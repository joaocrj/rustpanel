mod config;
mod parser;
mod supabase;

use config::AppConfig;
use parser::parse_packet;
use pnet::datalink::{self, Channel::Ethernet};
use pnet::packet::ip::IpNextHeaderProtocols;
use pnet::packet::ipv4::Ipv4Packet;
use pnet::packet::ipv6::Ipv6Packet;
use pnet::packet::udp::UdpPacket;
use pnet::packet::Packet;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;
use supabase::SupabaseBatcher;
use tokio::signal;
use tracing::{info, warn, Level};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load configuration
    let config = Arc::new(AppConfig::from_env()?);

    // Initialize logging
    let log_level = config.log_level.parse::<Level>().unwrap_or(Level::INFO);
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(format!("rustpanel_udp_capture={},pnet=warn", log_level)));

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(false)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .init();

    info!("Starting rustpanel-udp-capture v{}", env!("CARGO_PKG_VERSION"));
    info!("Interface: {}, UDP Port: {}", config.interface, config.udp_port);
    info!("Supabase: {}", config.supabase_url);

    // Start metrics server if enabled
    if config.enable_metrics {
        let metrics_addr = config.metrics_addr.clone();
        tokio::spawn(async move {
            let _ = metrics_exporter_prometheus::PrometheusBuilder::new()
                .with_http_listener(metrics_addr.parse::<std::net::SocketAddr>().unwrap())
                .install();
            info!("Metrics server started on {}", metrics_addr);
        });
    }

    // Initialize Supabase batcher
    let mut batcher = SupabaseBatcher::new(config.clone());
    batcher.start_flush_task();

    // Find network interface
    let interface_name = &config.interface;
    let interfaces = datalink::interfaces();
    let interface = interfaces
        .into_iter()
        .find(|iface| iface.name == *interface_name || interface_name == "any")
        .ok_or_else(|| format!("Interface '{}' not found", interface_name))?;

    info!("Using interface: {} ({:?})", interface.name, interface.ips);

    // Create datalink channel
    let (_, mut rx) = match datalink::channel(&interface, Default::default()) {
        Ok(Ethernet(tx, rx)) => (tx, rx),
        Ok(_) => return Err("Unhandled channel type".into()),
        Err(e) => return Err(format!("Failed to create datalink channel: {}", e).into()),
    };

    info!("Listening for UDP packets on port {}...", config.udp_port);

    // Packet processing loop
    let batcher = Arc::new(batcher);
    let udp_port = config.udp_port;
    let mut packet_count: u64 = 0;
    let mut parsed_count: u64 = 0;
    let mut last_stats = std::time::Instant::now();

    // Channel for shutdown signal
    let (shutdown_tx, mut shutdown_rx) = tokio::sync::mpsc::channel::<()>(1);

    // Handle Ctrl+C
    let shutdown_tx_clone = shutdown_tx.clone();
    tokio::spawn(async move {
        signal::ctrl_c().await.expect("Failed to listen for ctrl-c");
        info!("Shutdown signal received");
        let _ = shutdown_tx_clone.send(()).await;
    });

    // Also handle SIGTERM
    let shutdown_tx_clone = shutdown_tx.clone();
    tokio::spawn(async move {
        #[cfg(unix)]
        {
            use tokio::signal::unix::{signal, SignalKind};
            let mut sigterm = signal(SignalKind::terminate()).expect("Failed to register SIGTERM handler");
            sigterm.recv().await;
            info!("SIGTERM received");
            let _ = shutdown_tx_clone.send(()).await;
        }
    });

    loop {
        tokio::select! {
            _ = shutdown_rx.recv() => {
                info!("Shutting down...");
                break;
            }
            _ = tokio::time::sleep(Duration::from_millis(1)) => {
                // Non-blocking packet receive
                match rx.next() {
                    Ok(packet) => {
                        packet_count += 1;
                        process_packet(packet, udp_port, &batcher, &mut parsed_count).await;
                    }
                    Err(e) => {
                        warn!("Error receiving packet: {}", e);
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                }
            }
        }

        // Log stats periodically
        if last_stats.elapsed() >= Duration::from_secs(30) {
            let buffer_size = batcher.buffer_size().await;
            info!(
                "Stats: packets={}, parsed={}, buffer={}, rate={:.1} pps",
                packet_count,
                parsed_count,
                buffer_size,
                packet_count as f64 / last_stats.elapsed().as_secs_f64()
            );
            last_stats = std::time::Instant::now();
            packet_count = 0;
            parsed_count = 0;
        }
    }

    // Final flush on shutdown
    info!("Flushing remaining updates...");
    batcher.flush().await;
    info!("Shutdown complete");

    Ok(())
}

async fn process_packet(
    packet: &[u8],
    target_port: u16,
    batcher: &Arc<SupabaseBatcher>,
    parsed_count: &mut u64,
) {
    // Parse Ethernet -> IPv4/IPv6 -> UDP
    let eth = match pnet::packet::ethernet::EthernetPacket::new(packet) {
        Some(eth) => eth,
        None => return,
    };

    let ip_next_header = eth.get_ethertype();
    
    // Process IPv4
    if ip_next_header == pnet::packet::ethernet::EtherTypes::Ipv4 {
        if let Some(ipv4) = Ipv4Packet::new(eth.payload()) {
            if ipv4.get_next_level_protocol() == IpNextHeaderProtocols::Udp {
                if let Some(udp) = UdpPacket::new(ipv4.payload()) {
                    if udp.get_destination() == target_port {
                        let src_ip = IpAddr::V4(ipv4.get_source());
                        let src_port = udp.get_source();
                        let payload = udp.payload().to_vec(); // Copy payload to avoid lifetime issues
                        if let Some(peer) = parse_packet(&payload, src_ip, src_port) {
                            *parsed_count += 1;
                            batcher.add_peer(peer).await;
                        }
                    }
                }
            }
        }
        return;
    }
    
    // Process IPv6
    if ip_next_header == pnet::packet::ethernet::EtherTypes::Ipv6 {
        if let Some(ipv6) = Ipv6Packet::new(eth.payload()) {
            if ipv6.get_next_header() == IpNextHeaderProtocols::Udp {
                if let Some(udp) = UdpPacket::new(ipv6.payload()) {
                    if udp.get_destination() == target_port {
                        let src_ip = IpAddr::V6(ipv6.get_source());
                        let src_port = udp.get_source();
                        let payload = udp.payload().to_vec(); // Copy payload to avoid lifetime issues
                        if let Some(peer) = parse_packet(&payload, src_ip, src_port) {
                            *parsed_count += 1;
                            batcher.add_peer(peer).await;
                        }
                    }
                }
            }
        }
    }
}
