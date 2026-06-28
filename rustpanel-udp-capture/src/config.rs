use config::{Config as ConfigBuilder, ConfigError, File, Environment};
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    /// Network interface to capture on (e.g., "eth0", "ens3", or "any")
    pub interface: String,
    
    /// UDP port to filter (RustDesk HBBS default: 21116)
    pub udp_port: u16,
    
    /// Supabase URL (e.g., https://xxx.supabase.co)
    pub supabase_url: String,
    
    /// Supabase Service Role Key (for admin writes)
    pub supabase_service_role_key: String,
    
    /// Batch size for sending updates to Supabase
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
    
    /// Batch timeout in milliseconds (flush even if not full)
    #[serde(default = "default_batch_timeout_ms")]
    pub batch_timeout_ms: u64,
    
    /// Log level (trace, debug, info, warn, error)
    #[serde(default = "default_log_level")]
    pub log_level: String,
    
    /// Enable Prometheus metrics endpoint
    #[serde(default)]
    pub enable_metrics: bool,
    
    /// Metrics bind address
    #[serde(default = "default_metrics_addr")]
    pub metrics_addr: String,
}

fn default_batch_size() -> usize {
    50
}

fn default_batch_timeout_ms() -> u64 {
    5000
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_metrics_addr() -> String {
    "0.0.0.0:9090".to_string()
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let cfg = ConfigBuilder::builder()
            .add_source(File::with_name("/etc/rustpanel-udp-capture").required(false))
            .add_source(Environment::with_prefix("UDP_CAPTURE").separator("__"))
            .build()?;
        
        cfg.try_deserialize()
    }
    
    pub fn supabase_peers_endpoint(&self) -> String {
        format!("{}/rest/v1/peers", self.supabase_url.trim_end_matches('/'))
    }
    
    pub fn supabase_headers(&self) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            "apikey",
            self.supabase_service_role_key.parse().unwrap(),
        );
        headers.insert(
            "Authorization",
            format!("Bearer {}", self.supabase_service_role_key).parse().unwrap(),
        );
        headers.insert(
            "Content-Type",
            "application/json".parse().unwrap(),
        );
        headers.insert(
            "Prefer",
            "resolution=merge-duplicates".parse().unwrap(),
        );
        headers
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PeerUpdate {
    pub rustdesk_id: String,
    pub ip_public: String,
    pub last_seen: chrono::DateTime<chrono::Utc>,
    pub status: String, // "online"
}
