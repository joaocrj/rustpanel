// =============================================================
// RustPanel Agent - Main Entry Point
// =============================================================

import { loadConfig } from './config.js';
import { setLogLevel, logger } from './utils/logger.js';
import { DockerLogStream } from './readers/docker-logs.js';
import { SqliteReader } from './readers/sqlite-reader.js';
import { SupabaseService } from './services/supabase.js';
import { parseHbbsLine } from './parsers/hbbs-parser.js';
import { parseHbbrLine } from './parsers/hbbr-parser.js';

async function main() {
  console.log(`
  ╔══════════════════════════════════════╗
  ║       🛡️  RustPanel Agent v1.0       ║
  ║   RustDesk Monitoring Service        ║
  ╚══════════════════════════════════════╝
  `);

  // Load configuration
  const config = loadConfig();
  setLogLevel(config.logLevel);

  logger.info('Configuration loaded successfully');
  logger.info(`HBBS container: ${config.hbbsContainerName}`);
  logger.info(`HBBR container: ${config.hbbrContainerName}`);
  logger.info(`SQLite path: ${config.sqliteDbPath}`);
  logger.info(`Peer sync interval: ${config.peerSyncIntervalMs}ms`);
  logger.info(`Heartbeat timeout: ${config.heartbeatTimeoutMs}ms`);

  // Initialize services
  const supabase = new SupabaseService(config);
  const dockerLogs = new DockerLogStream();
  const sqliteReader = new SqliteReader(config);

  // Track known peers for deduplication
  const knownPeers = new Set<string>();

  // -------------------------------------------------------
  // 1. Initial SQLite sync — load all registered peers
  // -------------------------------------------------------
  async function syncPeersFromSqlite() {
    logger.info('Syncing peers from SQLite...');
    const peers = sqliteReader.getRegisteredPeers();

    for (const peer of peers) {
      if (!peer.id || knownPeers.has(peer.id)) continue;

      const info = SqliteReader.parseInfo(peer.info);

      await supabase.upsertPeer({
        rustdesk_id: peer.id,
        hostname: info.hostname,
        os: info.os,
        info: peer.info ? { raw: peer.info } : {},
      });

      knownPeers.add(peer.id);
    }

    logger.info(`SQLite sync complete. ${peers.length} peers found, ${knownPeers.size} tracked`);
  }

  // Initial sync
  await syncPeersFromSqlite();

  // Periodic sync
  setInterval(async () => {
    try {
      await syncPeersFromSqlite();
    } catch (err) {
      logger.error(`SQLite sync error: ${err}`);
    }
  }, config.peerSyncIntervalMs);

  // -------------------------------------------------------
  // 2. HBBS log streaming — detect peer activity
  // -------------------------------------------------------
  dockerLogs.streamLogs(config.hbbsContainerName, async (line) => {
    const event = parseHbbsLine(line);
    if (!event) return;

    logger.debug(`HBBS event: ${event.type} | peer=${event.peerId} ip=${event.ip}`);

    if (event.type === 'peer_register' && event.peerId) {
      // Upsert peer and mark as active
      await supabase.upsertPeer({
        rustdesk_id: event.peerId,
        ip_public: event.ip,
      });
      await supabase.updatePeerLastSeen(event.peerId, event.ip);
      knownPeers.add(event.peerId);
    }

    if (event.type === 'tcp_connection' && event.ip) {
      // TCP connection detected — we know the IP is active but may not have the peer ID
      logger.debug(`TCP connection from ${event.ip}:${event.port}`);
    }
  });

  // -------------------------------------------------------
  // 3. HBBR log streaming — detect relay sessions
  // -------------------------------------------------------
  // Track active relay sessions by UUID
  const activeRelays = new Map<string, { ip: string; timestamp: Date }>();

  dockerLogs.streamLogs(config.hbbrContainerName, async (line) => {
    const event = parseHbbrLine(line);
    if (!event) return;

    logger.debug(`HBBR event: ${event.type} | uuid=${event.uuid} ip=${event.ip}`);

    if (event.type === 'relay_request' && event.uuid && event.ip) {
      // New relay session starting
      activeRelays.set(event.uuid, { ip: event.ip, timestamp: event.timestamp });
      logger.info(`Relay request: ${event.uuid} from ${event.ip}`);
    }

    if (event.type === 'relay_paired' && event.uuid) {
      // Relay paired — session is now active
      const relay = activeRelays.get(event.uuid);
      if (relay) {
        logger.info(`Relay paired: ${event.uuid} from ${relay.ip}`);
        // We don't have the rustdesk_id in relay logs, but we track the IP
        // The session will be created when we correlate with peer data
      }
    }

    if (event.type === 'relay_closed' && event.ip) {
      // Relay session ended
      logger.info(`Relay closed from ${event.ip}`);
      await supabase.closeSessionByIp(event.ip);

      // Clean up tracked relays
      for (const [uuid, data] of activeRelays) {
        if (data.ip === event.ip) {
          activeRelays.delete(uuid);
        }
      }
    }
  });

  // -------------------------------------------------------
  // 4. Heartbeat — mark inactive peers as offline
  // -------------------------------------------------------
  setInterval(async () => {
    try {
      await supabase.markOfflinePeers(config.heartbeatTimeoutMs);
    } catch (err) {
      logger.error(`Heartbeat error: ${err}`);
    }
  }, Math.min(config.heartbeatTimeoutMs / 2, 60_000));

  // -------------------------------------------------------
  // 5. Ban monitoring — watch for new bans
  // -------------------------------------------------------
  async function checkBans() {
    const bannedIds = await supabase.getActiveBans();
    if (bannedIds.length > 0) {
      logger.debug(`Active bans: ${bannedIds.join(', ')}`);
    }
    // Future: implement iptables enforcement here
  }

  setInterval(checkBans, 30_000);
  await checkBans();

  // -------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------
  const shutdown = async () => {
    logger.info('Shutting down agent...');
    await dockerLogs.stop();
    await supabase.setState('agent_last_shutdown', { timestamp: new Date().toISOString() });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Mark agent as running
  await supabase.setState('agent_status', {
    status: 'running',
    started_at: new Date().toISOString(),
    version: '1.0.0',
  });

  logger.info('🚀 RustPanel Agent is running');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
