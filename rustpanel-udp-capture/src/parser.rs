use bytes::Bytes;
use chrono::{DateTime, Utc};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use tracing::{debug, trace, warn};

/// Parsed peer information from a RustDesk update_pk packet
#[derive(Debug, Clone)]
pub struct ParsedPeer {
    pub rustdesk_id: String,
    pub ip: IpAddr,
    pub port: u16,
    pub timestamp: DateTime<Utc>,
}

/// Parse a RustDesk UDP packet payload for update_pk messages
/// 
/// RustDesk HBBS sends update_pk packets with format:
/// - `update_pk <ID> [::ffff:<IPv4>]:<PORT>` (IPv4 mapped to IPv6)
/// - `update_pk <ID> [<IPv6>]:<PORT>`
/// - Binary protocol may also be used
pub fn parse_packet(payload: &[u8], src_ip: IpAddr, src_port: u16) -> Option<ParsedPeer> {
    if payload.is_empty() {
        return None;
    }

    // Try to parse as text first (RustDesk logs show text format)
    if let Ok(text) = std::str::from_utf8(payload) {
        return parse_text_packet(text, src_ip, src_port);
    }

    // Try binary protocol parsing
    parse_binary_packet(payload, src_ip, src_port)
}

/// Parse text-based update_pk packet
/// Format: "update_pk <ID> [::ffff:IP]:PORT" or "update_pk <ID> [IPv6]:PORT"
fn parse_text_packet(text: &str, src_ip: IpAddr, src_port: u16) -> Option<ParsedPeer> {
    let text = text.trim();
    
    // Check for update_pk prefix
    if !text.starts_with("update_pk") && !text.starts_with("update_pk ") {
        trace!("Not an update_pk packet: {}", &text[..text.len().min(50)]);
        return None;
    }

    // Parse: update_pk <ID> [IP]:PORT
    let parts: Vec<&str> = text.split_whitespace().collect();
    if parts.len() < 3 {
        return None;
    }

    // Extract ID (second part)
    let rustdesk_id = parts[1].to_string();
    
    // Validate ID format (6-12 digits)
    if !is_valid_rustdesk_id(&rustdesk_id) {
        debug!("Invalid RustDesk ID format: {}", rustdesk_id);
        return None;
    }

    // Extract IP and port from third part: [IP]:PORT
    let addr_part = parts[2];
    let (ip, port) = parse_ip_port(addr_part)?;
    
    // Use source IP from packet if parsed IP is localhost/any
    let final_ip = if ip.is_unspecified() || ip.is_loopback() {
        src_ip
    } else {
        ip
    };

    Some(ParsedPeer {
        rustdesk_id,
        ip: final_ip,
        port,
        timestamp: Utc::now(),
    })
}

/// Parse binary RustDesk protocol packet
/// The binary protocol uses a custom framing - we'll try to extract ID from known patterns
fn parse_binary_packet(payload: &[u8], src_ip: IpAddr, src_port: u16) -> Option<ParsedPeer> {
    // RustDesk binary protocol structure (simplified):
    // - First byte: message type (0x01 = update_pk, 0x02 = punch_hole, etc.)
    // - Followed by length-prefixed fields
    
    if payload.len() < 3 {
        return None;
    }

    // Check for known message types
    let msg_type = payload[0];
    
    // Message type 0x01 = update_pk (peer /update_pk (peer registration)
    // Message type 0x02 = punch_hole
    if msg_type != 0x01 && msg_type != 0x02 {
        trace!("Unknown message type: 0x{:02x}", msg_type);
        return None;
    }

    // Try to extract peer ID from payload
    // The ID is typically a variable-length integer followed by the ID bytes
    // For simplicity, we'll scan for a 6-12 digit number in the payload
    if let Some(id) = extract_rustdesk_id_from_bytes(payload) {
        return Some(ParsedPeer {
            rustdesk_id: id,
            ip: src_ip,
            port: src_port,
            timestamp: Utc::now(),
        });
    }

    None
}

/// Validate RustDesk ID format (6-12 digits)
fn is_valid_rustdesk_id(id: &str) -> bool {
    id.len() >= 6 && id.len() <= 12 && id.chars().all(|c| c.is_ascii_digit())
}

/// Extract RustDesk ID from raw bytes by scanning for digit sequences
fn extract_rustdesk_id_from_bytes(bytes: &[u8]) -> Option<String> {
    let mut current = String::new();
    
    for &b in bytes {
        if b.is_ascii_digit() {
            current.push(b as char);
            if current.len() > 12 {
                current.clear();
            }
        } else {
            if current.len() >= 6 && current.len() <= 12 {
                return Some(current);
            }
            current.clear();
        }
    }
    
    // Check at end
    if current.len() >= 6 && current.len() <= 12 {
        return Some(current);
    }
    
    None
}

/// Parse IP:PORT from string like "[::ffff:192.168.1.1]:21116" or "[2001:db8::1]:21116"
fn parse_ip_port(s: &str) -> Option<(IpAddr, u16)> {
    // Remove brackets
    let s = s.trim_start_matches('[').trim_end_matches(']');
    
    // Split by last colon (IPv6 has multiple colons)
    let last_colon = s.rfind(':')?;
    let ip_str = &s[..last_colon];
    let port_str = &s[last_colon + 1..];
    
    let port = port_str.parse::<u16>().ok()?;
    
    // Handle IPv4-mapped IPv6: "::ffff:192.168.1.1"
    let ip = if let Some(ipv4_str) = ip_str.strip_prefix("::ffff:") {
        ipv4_str.parse::<Ipv4Addr>().map(IpAddr::V4).ok()?
    } else {
        ip_str.parse::<IpAddr>().ok()?
    };
    
    Some((ip, port))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};
    use chrono::Utc;

    #[test]
    fn test_parse_text_packet_ipv4_mapped() {
        let payload = b"update_pk 432197642 [::ffff:179.218.11.179]:21116";
        let result = parse_packet(payload, IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)), 12345);
        
        assert!(result.is_some());
        let peer = result.unwrap();
        assert_eq!(peer.rustdesk_id, "432197642");
        assert_eq!(peer.ip, IpAddr::V4(Ipv4Addr::new(179, 218, 11, 179)));
        assert_eq!(peer.port, 21116);
    }

    #[test]
    fn test_parse_text_packet_ipv6() {
        let payload = b"update_pk 452858709 [2001:db8::1]:21116";
        let result = parse_packet(payload, IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)), 12345);
        
        assert!(result.is_some());
        let peer = result.unwrap();
        assert_eq!(peer.rustdesk_id, "452858709");
        assert_eq!(peer.port, 21116);
    }

    #[test]
    fn test_parse_text_packet_invalid_id() {
        let payload = b"update_pk abc [::ffff:1.2.3.4]:21116";
        let result = parse_packet(payload, IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)), 12345);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_text_packet_short_id() {
        let payload = b"update_pk 12345 [::ffff:1.2.3.4]:21116";
        let result = parse_packet(payload, IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)), 12345);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_ip_port_ipv4_mapped() {
        let result = parse_ip_port("[::ffff:179.218.11.179]:21116");
        assert_eq!(result, Some((IpAddr::V4(Ipv4Addr::new(179, 218, 11, 179)), 21116)));
    }

    #[test]
    fn test_parse_ip_port_ipv6() {
        let result = parse_ip_port("[2001:db8::1]:21116");
        assert!(result.is_some());
        let (ip, port) = result.unwrap();
        assert_eq!(port, 21116);
        assert!(matches!(ip, IpAddr::V6(_)));
    }

    #[test]
    fn test_is_valid_rustdesk_id() {
        assert!(is_valid_rustdesk_id("432197642"));
        assert!(is_valid_rustdesk_id("123456"));
        assert!(is_valid_rustdesk_id("123456789012"));
        assert!(!is_valid_rustdesk_id("12345"));
        assert!(!is_valid_rustdesk_id("1234567890123"));
        assert!(!is_valid_rustdesk_id("abc123"));
        assert!(!is_valid_rustdesk_id(""));
    }

    #[test]
    fn test_extract_rustdesk_id_from_bytes() {
        let payload = b"\x01\x00\x00\x00432197642\x00\x00\x00";
        let result = extract_rustdesk_id_from_bytes(payload);
        assert_eq!(result, Some("432197642".to_string()));
    }
}