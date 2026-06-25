// =============================================================
// RustPanel Agent - Main Entry Point (v3)
// =============================================================
//
// Changes from v2:
//   - Removed peer_ip table dependency (not present in this RustDesk version)
//   - Fixed Docker log backfill (uses dockerode container.logs directly)
//   - Simplified SQLite sync (no IP map from SQLite)
//   - Multi-peer NAT heuristic uses Supabase (not SQLite peer_ip)
// =============================================================

import { loadConfig } from './config.js';
import { setLogLevel, logger } from './utils/logger.js';
import { DockerLogStream } from './readers/docker-logs.js';
import { SqliteReader } from './readers/sqlite-reader.js';
import { SupabaseService } from './services/supabase.js';
import { parseHbbsLine } from './parsers/hbbs-parser.js';
import { parseHbbrLine, resetHbbrParserState } from './parsers/hbbr-parser.js';

async function main() {
  console.log(`
  ╔══════════════════════════════════════╗
  ║       🛡️  RustPanel Agent v3.0       ║
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
  logger.info(`Heartbeat grace: ${config.heartbeatGraceMs}ms`);

  // Initialize services
  const supabase = new SupabaseService(config);
  const dockerLogs = new DockerLogStream();
  const sqliteReader = new SqliteReader(config);

  // -------------------------------------------------------
  // In-Memory IP → RustDesk ID Map
  //
  // Populated from:
  //   1. HBBS log backfill (startup — parses update_pk events)
  //   2. Supabase peers table (ip_public column)
  //   3. HBBS log streaming (real-time update_pk events)
  //
  // NOTE: This RustDesk version does NOT have a peer_ip table
  // in SQLite, so we cannot query IP→Peer mappings from there.
  // -------------------------------------------------------
  const ipToPeerId = new Map<string, string>();
  const knownPeers = new Set<string>();

  // -------------------------------------------------------
  // 1. SQLite Sync — load registered peers
  //    Does NOT populate IP map (no peer_ip table available).
  //    Only registers peers in Supabase with hostname/os info.
  // -------------------------------------------------------
  async function syncPeersFromSqlite() {
    logger.info('Syncing peers from SQLite...');
    const peers = sqliteReader.getRegisteredPeers();
    let newCount = 0;

    for (const peer of peers) {
      if (!peer.id) continue;

      const info = SqliteReader.parseInfo(peer.info);

      // Use registerPeerFromSqlite (NOT upsertPeer) to avoid updating
      // last_seen — that would break the heartbeat offline detection.
      await supabase.registerPeerFromSqlite({
        rustdesk_id: peer.id,
        hostname: info.hostname,
        os: info.os,
        info: peer.info ? { raw: peer.info, version: info.version } : {},
      });

      if (!knownPeers.has(peer.id)) {
        newCount++;
        knownPeers.add(peer.id);
      }
    }

    logger.info(`SQLite sync complete. ${peers.length} peers found, ${knownPeers.size} tracked (new: ${newCount})`);
  }

  // -------------------------------------------------------
  // 1.1 Backfill IP Map from HBBS Docker Logs
  //     Reads recent HBBS logs via Docker API to build
  //     IP→Peer map from update_pk events.
  //     This is the PRIMARY source of IP mappings since
  //     peer_ip table does not exist in this RustDesk version.
  // -------------------------------------------------------
  async function backfillIpMapFromHbbsLogs() {
    try {
      logger.info('Backfilling IP map from HBBS Docker logs...');
      const Docker = (await import('dockerode')).default;
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });

      const containers = await docker.listContainers({ all: false });
      const match = containers.find((c: any) =>
        c.Names.some((n: string) => n.includes(config.hbbsContainerName))
      );

      if (!match) {
        logger.warn('HBBS container not found for backfill');
        return;
      }

      const container = docker.getContainer(match.Id);

      // Use container.logs with string output (simpler, no demux needed)
      const logBuffer: Buffer = await container.logs({
        stdout: true,
        stderr: true,
        tail: 5000,
        timestamps: false,
        follow: false,
      }) as Buffer;

      const rawData = logBuffer.toString('utf-8');

      let count = 0;
      const lines = rawData.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Docker multiplexed format strips first 8 bytes per frame
        // Lines may have leading null bytes or control chars — strip them
        const cleanLine = trimmed.replace(/^[\x00-\x08]+/, '');

        // Match: update_pk <ID> [::ffff:<IP>]:<PORT>
        const match = cleanLine.match(/(?:update_pk|peer_register|register_pk)\s+(\d+)\s+\[::ffff:([^\]]+)\]/i);
        if (match) {
          const peerId = match[1];
          const ip = match[2];
          if (!ipToPeerId.has(ip)) {
            ipToPeerId.set(ip, peerId);
            count++;
          }
        }
      }

      if (count > 0) {
        logger.info(`Backfilled ${count} IP mappings from HBBS Docker logs. IP map: ${ipToPeerId.size} entries`);
      } else {
        logger.warn('Backfill found 0 IP mappings in HBBS logs — IP map will rely on live stream and Supabase');
      }
    } catch (err) {
      logger.warn(`Failed to backfill IP map from HBBS logs: ${err}`);
    }
  }

  // -------------------------------------------------------
  // 1.2 IP Map Sync — Load known IPs from Supabase
  // -------------------------------------------------------
  async function syncIpMapFromSupabase() {
    try {
      const dbPeers = await supabase.getAllPeersWithIp();
      for (const p of dbPeers) {
        if (p.ip_public) {
          ipToPeerId.set(p.ip_public, p.rustdesk_id);
        }
      }
      logger.info(`Loaded ${dbPeers.length} IP mappings from Supabase. IP map size: ${ipToPeerId.size} entries`);
    } catch (err) {
      logger.error(`Failed to load IP mappings from Supabase: ${err}`);
    }
  }

  // Initial sync
  await syncPeersFromSqlite();
  await backfillIpMapFromHbbsLogs();
  await syncIpMapFromSupabase();

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
  let hbbsRawDebugCount = 0;
  let hbbsLastLineTime = Date.now();

  dockerLogs.streamLogs(config.hbbsContainerName, async (line) => {
    hbbsLastLineTime = Date.now();

    if (hbbsRawDebugCount < 5) {
      logger.info(`[HBBS-RAW][${hbbsRawDebugCount + 1}/5] ${line}`);
      hbbsRawDebugCount++;
    }

    const event = parseHbbsLine(line);
    if (!event) return;

    if (event.type === 'peer_register' && event.peerId) {
      logger.debug(`HBBS peer_register: ID=${event.peerId} IP=${event.ip || 'unknown'}`);

      // Update in-memory IP map
      if (event.ip) {
        ipToPeerId.set(event.ip, event.peerId);
      }

      // Upsert peer and mark as online
      await supabase.upsertPeer({
        rustdesk_id: event.peerId,
        ip_public: event.ip,
      });
      await supabase.updatePeerLastSeen(event.peerId, event.ip);
      knownPeers.add(event.peerId);
    }

    if (event.type === 'peer_activity' && event.peerId) {
      logger.debug(`HBBS peer_activity: ID=${event.peerId}`);
      await supabase.updatePeerLastSeen(event.peerId);
      knownPeers.add(event.peerId);
    }

    if (event.type === 'tcp_connection' && event.ip) {
      const mappedId = ipToPeerId.get(event.ip);
      if (mappedId) {
        logger.debug(`HBBS tcp_connection: IP=${event.ip} → mapped to ID=${mappedId}`);
        await supabase.updatePeerLastSeen(mappedId, event.ip);
      } else {
        logger.debug(`HBBS tcp_connection from ${event.ip}:${event.port} (no peer mapping)`);
      }
    }
  });

  // Heartbeat check: warn if HBBS stream hasn't delivered data in 5+ minutes
  setInterval(() => {
    const secondsSinceLastLine = Math.round((Date.now() - hbbsLastLineTime) / 1000);
    if (secondsSinceLastLine > 300) {
      logger.warn(`HBBS stream appears stalled — no lines received in ${secondsSinceLastLine}s (${Math.round(secondsSinceLastLine / 60)}min)`);
    }
  }, 120_000);

  // -------------------------------------------------------
  // 3. HBBR log streaming — detect relay sessions
  // -------------------------------------------------------
  const activeRelays = new Map<string, { ip: string; timestamp: Date; pairedIp?: string }>();

  let hbbrUnmatchedCount = 0;

  dockerLogs.streamLogs(config.hbbrContainerName, async (line) => {
    const event = parseHbbrLine(line);
    if (!event) {
      if (hbbrUnmatchedCount < 50) {
        logger.info(`[HBBR-UNMATCHED][${hbbrUnmatchedCount + 1}/50] ${line}`);
        hbbrUnmatchedCount++;
      }
      return;
    }

    if (event.type === 'relay_request' && event.uuid && event.ip) {
      activeRelays.set(event.uuid, { ip: event.ip, timestamp: event.timestamp });
      logger.debug(`HBBR relay_request: UUID=${event.uuid} IP=${event.ip}`);

      // Enrich IP map from Supabase if this IP is new to us
      if (!ipToPeerId.has(event.ip)) {
        const cachedId = await supabase.getPeerByIp(event.ip);
        if (cachedId) {
          ipToPeerId.set(event.ip, cachedId);
          logger.info(`HBBR relay_request: IP=${event.ip} → cached ID=${cachedId} (from Supabase)`);
        }
      }
    }

    if (event.type === 'relay_paired' && event.uuid) {
      const relay = activeRelays.get(event.uuid);

      if (relay && event.ip) {
        relay.pairedIp = event.ip;
      }

      const candidateIps = [event.ip, relay?.ip].filter((ip): ip is string => !!ip);

      if (candidateIps.length > 0) {
        logger.info(`HBBR relay_paired: UUID=${event.uuid} candidates=[${candidateIps.join(', ')}]`);

        try {
          let rustdeskId: string | undefined;
          let correlatedIp: string | undefined;

          for (const ip of candidateIps) {
            // 1. Try in-memory IP map (built from HBBS logs + Supabase)
            let id = ipToPeerId.get(ip);

            // 2. Fallback: query Supabase peers table by IP
            if (!id) {
              id = (await supabase.getPeerByIp(ip)) ?? undefined;
              if (id) {
                ipToPeerId.set(ip, id);
                logger.info(`IP ${ip} resolved to peer ${id} via Supabase`);
              }
            }

            // 3. Multi-peer heuristic: if multiple peers share this IP in Supabase
            if (!id) {
              const allPeerIds = await supabase.getAllPeerIdsByIp(ip);
              if (allPeerIds.length === 1) {
                id = allPeerIds[0];
                ipToPeerId.set(ip, id);
                logger.info(`IP ${ip} resolved to peer ${id} via Supabase (single match)`);
              } else if (allPeerIds.length > 1) {
                logger.info(`IP ${ip} has ${allPeerIds.length} peers in Supabase: [${allPeerIds.join(', ')}]. Applying heuristics...`);

                // Heuristic 1: prefer peer with active session on this IP
                const activeSessionIds = await supabase.getActivePeerIdsOnIp(ip);
                const match = allPeerIds.find(pid => activeSessionIds.includes(pid));
                if (match) {
                  id = match;
                  logger.info(`Heuristic: Selected peer ${match} — has active session on IP ${ip}`);
                }

                // Heuristic 2: prefer most recently seen peer
                if (!id) {
                  const recentPeer = await supabase.getMostRecentPeerFromIds(allPeerIds);
                  if (recentPeer) {
                    id = recentPeer;
                    logger.info(`Heuristic: Selected peer ${recentPeer} — most recently active`);
                  }
                }

                // Heuristic 3: fallback to first candidate
                if (!id) {
                  id = allPeerIds[0];
                  logger.info(`Heuristic: Selected peer ${id} — first candidate (fallback)`);
                }

                ipToPeerId.set(ip, id);
              }
            }

            if (id) {
              rustdeskId = id;
              correlatedIp = ip;
              break;
            }
          }

          if (rustdeskId && correlatedIp) {
            await supabase.updatePeerLastSeen(rustdeskId, correlatedIp);

            await supabase.createSession({
              rustdesk_id: rustdeskId,
              ip_public: correlatedIp,
              relay_uuid: event.uuid,
            });
          } else {
            logger.warn(`Could not correlate relay ${event.uuid} (IPs: ${candidateIps.join(', ')}) with any peer. IP map has ${ipToPeerId.size} entries.`);
          }
        } catch (err) {
          logger.error(`Error correlating session: ${err}`);
        }
      } else {
        logger.warn(`Relay paired ${event.uuid} but no IPs available`);
      }
    }

    if (event.type === 'relay_active' && event.uuid) {
      logger.debug(`HBBR relay_active: UUID=${event.uuid} — data flowing`);
    }

    if (event.type === 'relay_closed' && event.ip) {
      logger.info(`HBBR relay_closed: IP=${event.ip}`);

      let closedByUuid = false;
      for (const [uuid, data] of activeRelays) {
        if (data.ip === event.ip || data.pairedIp === event.ip) {
          await supabase.closeSessionByUuid(uuid);
          activeRelays.delete(uuid);
          closedByUuid = true;
        }
      }

      if (!closedByUuid) {
        await supabase.closeSessionByIp(event.ip);
      }
    }
  });

  // -------------------------------------------------------
  // 4. Heartbeat — mark inactive peers as offline
  // -------------------------------------------------------
  const heartbeatInterval = Math.min(config.heartbeatTimeoutMs / 2, 60_000);
  logger.info(`Heartbeat interval: ${heartbeatInterval}ms, grace: ${config.heartbeatGraceMs}ms`);

  setInterval(async () => {
    try {
      await supabase.markOfflinePeers(config.heartbeatGraceMs);
    } catch (err) {
      logger.error(`Heartbeat error: ${err}`);
    }
  }, heartbeatInterval);

  // -------------------------------------------------------
  // 5. Ban monitoring
  // -------------------------------------------------------
  async function checkBans() {
    const bannedIds = await supabase.getActiveBans();
    if (bannedIds.length > 0) {
      logger.debug(`Active bans: ${bannedIds.join(', ')}`);
    }
  }

  setInterval(checkBans, 30_000);
  await checkBans();

  // -------------------------------------------------------
  // 6. Periodic diagnostics
  // -------------------------------------------------------
  const startedAt = new Date().toISOString();

  const updateAgentState = async () => {
    logger.info(`[Diagnostics] IP map: ${ipToPeerId.size} entries | Known peers: ${knownPeers.size} | Active relays: ${activeRelays.size}`);
    try {
      await supabase.setState('agent_status', {
        status: 'running',
        started_at: startedAt,
        version: '3.0.0',
        ip_map_size: ipToPeerId.size,
        known_peers: knownPeers.size,
        active_relays: activeRelays.size,
        last_heartbeat: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(`Failed to update agent state: ${err}`);
    }
  };

  setInterval(updateAgentState, 120_000);

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

  await supabase.setState('agent_status', {
    status: 'running',
    started_at: startedAt,
    version: '3.0.0',
    ip_map_size: ipToPeerId.size,
    known_peers: knownPeers.size,
    active_relays: 0,
    last_heartbeat: startedAt,
  });

  logger.info('🚀 RustPanel Agent v3.0 is running');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});