use crate::config::{AppConfig, PeerUpdate};
use crate::parser::ParsedPeer;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

/// Batched Supabase client for sending peer updates
pub struct SupabaseBatcher {
    client: Client,
    config: Arc<AppConfig>,
    buffer: Arc<Mutex<Vec<PeerUpdate>>>,
    last_flush: Arc<Mutex<Instant>>,
    flush_task: Option<tokio::task::JoinHandle<()>>,
}

impl SupabaseBatcher {
    pub fn new(config: Arc<AppConfig>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            config,
            buffer: Arc::new(Mutex::new(Vec::new())),
            last_flush: Arc::new(Mutex::new(Instant::now())),
            flush_task: None,
        }
    }

    /// Start the periodic flush task
    pub fn start_flush_task(&mut self) {
        let buffer = self.buffer.clone();
        let last_flush = self.last_flush.clone();
        let config = self.config.clone();
        let client = self.client.clone();

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(config.batch_timeout_ms));
            
            loop {
                interval.tick().await;
                Self::flush_buffer(&client, &config, &buffer, &last_flush).await;
            }
        });

        self.flush_task = Some(handle);
    }

    /// Add a parsed peer to the buffer
    pub async fn add_peer(&self, peer: ParsedPeer) {
        let update = PeerUpdate {
            rustdesk_id: peer.rustdesk_id,
            ip_public: peer.ip.to_string(),
            last_seen: peer.timestamp,
            status: "online".to_string(),
        };

        let mut buffer = self.buffer.lock().await;
        buffer.push(update);

        // Flush if buffer is full
        if buffer.len() >= self.config.batch_size {
            let batch_size = self.config.batch_size;
            drop(buffer); // Release lock before flush
            Self::flush_buffer(&self.client, &self.config, &self.buffer, &self.last_flush).await;
        }
    }

    /// Flush the buffer to Supabase
    async fn flush_buffer(
        client: &Client,
        config: &AppConfig,
        buffer: &Arc<Mutex<Vec<PeerUpdate>>>,
        last_flush: &Arc<Mutex<Instant>>,
    ) {
        let mut buffer_guard = buffer.lock().await;
        
        if buffer_guard.is_empty() {
            return;
        }

        // Deduplicate by rustdesk_id (keep latest)
        let mut latest_by_id: HashMap<String, PeerUpdate> = HashMap::new();
        for update in buffer_guard.drain(..) {
            let id = update.rustdesk_id.clone();
            latest_by_id
                .entry(id)
                .and_modify(|existing| {
                    if update.last_seen > existing.last_seen {
                        *existing = update.clone();
                    }
                })
                .or_insert(update);
        }

        let updates: Vec<PeerUpdate> = latest_by_id.into_values().collect();
        let count = updates.len();

        if count == 0 {
            return;
        }

        debug!("Flushing {} peer updates to Supabase", count);

        let endpoint = config.supabase_peers_endpoint();
        let headers = config.supabase_headers();

        // Use upsert (onConflict: rustdesk_id) to update existing or insert new
        let response = client
            .post(&endpoint)
            .headers(headers)
            .json(&updates)
            .send()
            .await;

        match response {
            Ok(resp) => {
                if resp.status().is_success() {
                    info!("Successfully sent {} peer updates to Supabase", count);
                    *last_flush.lock().await = Instant::now();
                } else {
                    let status = resp.status();
                    let text = resp.text().await.unwrap_or_default();
                    error!("Supabase error {}: {}", status, text);
                    // Put updates back in buffer for retry
                    let mut buffer_guard = buffer.lock().await;
                    buffer_guard.extend(updates);
                }
            }
            Err(e) => {
                error!("Failed to send to Supabase: {}", e);
                // Put updates back in buffer for retry
                let mut buffer_guard = buffer.lock().await;
                buffer_guard.extend(updates);
            }
        }
    }

    /// Force flush all buffered updates
    pub async fn flush(&self) {
        Self::flush_buffer(&self.client, &self.config, &self.buffer, &self.last_flush).await;
    }

    /// Get current buffer size (for metrics)
    pub async fn buffer_size(&self) -> usize {
        self.buffer.lock().await.len()
    }
}

impl Drop for SupabaseBatcher {
    fn drop(&mut self) {
        if let Some(handle) = self.flush_task.take() {
            handle.abort();
        }
    }
}
