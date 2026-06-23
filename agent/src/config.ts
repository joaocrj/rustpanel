// =============================================================
// RustPanel Agent - Configuration
// =============================================================

export interface AgentConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  hbbsContainerName: string;
  hbbrContainerName: string;
  sqliteDbPath: string;
  peerSyncIntervalMs: number;
  heartbeatTimeoutMs: number;
  heartbeatGraceMs: number;
  logLevel: string;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(): AgentConfig {
  return {
    supabaseUrl: getEnv('SUPABASE_URL'),
    supabaseServiceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    hbbsContainerName: getEnv('HBBS_CONTAINER_NAME', 'hbbs'),
    hbbrContainerName: getEnv('HBBR_CONTAINER_NAME', 'hbbr'),
    sqliteDbPath: getEnv('SQLITE_DB_PATH', '/data/db_v2.sqlite3'),
    peerSyncIntervalMs: parseInt(getEnv('PEER_SYNC_INTERVAL_MS', '60000'), 10),
    heartbeatTimeoutMs: parseInt(getEnv('HEARTBEAT_TIMEOUT_MS', '300000'), 10),
    heartbeatGraceMs: parseInt(getEnv('HEARTBEAT_GRACE_MS', '600000'), 10),
    logLevel: getEnv('LOG_LEVEL', 'info'),
  };
}
