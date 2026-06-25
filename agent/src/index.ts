// =============================================================
// RustPanel Agent - Main Entry Point (v2)
// =============================================================

import { loadConfig } from './config.js';
import { setLogLevel, logger } from './utils/logger.js';
import { DockerLogStream } from './readers/docker-logs.js';
import { SqliteReader, getPeerIpCache } from './readers/sqlite-reader.js';
import { SupabaseService } from './services/supabase.js';
import { parseHbbsLine } from './parsers/hbbs-parser.js';
import { parseHbbrLine, resetHbbrParserState } from './parsers/hbbr-parser.js';
import { PassThrough } from 'node:stream';

async function main() {
  console.log(`
  ╔══════════════════════════════════════╗
  ║       🛡️  RustPanel Agent v2.0       ║
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
  // This is the critical correlation layer. It is populated
  // from two sources:
  //   1. SQLite sync (foundational, all known peers)
  //   2. HBBS log events (real-time, as peers connect)
  // -------------------------------------------------------
  const ipToPeerId = new Map<string, string>();
  const knownPeers = new Set<string>();

  // -------------------------------------------------------
  // 1. SQLite Sync — load registered peers
  // -------------------------------------------------------
  async function syncPeersFromSqlite() {
    logger.info('Syncing peers from SQLite...');
    const peers = sqliteReader.getRegisteredPeers();
    let newCount = 0;

    // Populate IP map from SQLite peer_ip table (fast, reliable fallback)
    const ipCache = getPeerIpCache();
    let ipMapLoaded = 0;
    for (const [peerId, record] of ipCache) {
      if (record.ip && !ipToPeerId.has(record.ip)) {
        ipToPeerId.set(record.ip, peerId);
        ipMapLoaded++;
      }
    }
    if (ipMapLoaded > 0) {
      logger.info(`Loaded ${ipMapLoaded} IP mappings from SQLite peer_ip table`);
    }

    for (const peer of peers) {
      if (!peer.id) continue;

      const info = SqliteReader.parseInfo(peer.info);

      // Update IP in Supabase if we have it from SQLite
      const ipRecord = ipCache.get(peer.id);
      const ipPublic = ipRecord?.ip;

      // Use registerPeerFromSqlite (NOT upsertPeer) to avoid updating
      // last_seen — that would break the heartbeat offline detection.
      await supabase.registerPeerFromSqlite({
        rustdesk_id: peer.id,
        hostname: info.hostname,
        os: info.os,
        info: peer.info ? { raw: peer.info, version: info.version } : {},
      });

      // Also upsert IP if available (silently, without resetting last_seen)
      if (ipPublic) {
        const { error: ipErr } = await supabase.client
          .from('peers')
          .update({ ip_public: ipPublic })
          .eq('rustdesk_id', peer.id)
          .is('ip_public', null); // Only set if null, don't overwrite existing
        if (!ipErr) {
          logger.debug(`Set IP for peer ${peer.id} → ${ipPublic} (from SQLite)`);
        }
      }

      if (!knownPeers.has(peer.id)) {
        newCount++;
        knownPeers.add(peer.id);
      }
    }

    logger.info(`SQLite sync complete. ${peers.length} peers found, ${knownPeers.size} tracked (new: ${newCount})`);
  }

  // -------------------------------------------------------
  // 1.1 Backfill IP Map from HBBS Docker Logs
  //     Uses Docker API (dockerode) to read HBBS logs.
  //     Parses update_pk events to build IP→Peer map.
  //     This is critical because the live stream starts
  //     async and may not deliver backlog before first
  //     relay events arrive.
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

      // Read logs: multiplexed format (same as streamLogs)
      const logStream: any = await container.logs({
        stdout: true,
        stderr: true,
        tail: 5000,
        timestamps: false,
        follow: false,
      });

      const rawData: string = await new Promise((resolve, reject) => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        (docker as any).modem.demuxStream(logStream, stdout, stderr);

        let data = '';
        stdout.on('data', (chunk: Buffer) => { data += chunk.toString('utf-8'); });
        stderr.on('data', (chunk: Buffer) => { data += chunk.toString('utf-8'); });
        stdout.on('end', () => resolve(data));
        stdout.on('error', reject);
      });

      let count = 0;
      const lines = rawData.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Match: update_pk <ID> [::ffff:<IP>]:<PORT>
        const match = trimmed.match(/(?:update_pk|peer_register|register_pk)\s+(\d+)\s+\[::ffff:([^\]]+)\]/i);
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
        logger.warn('Backfill found 0 IP mappings in HBBS logs — IP map will rely on live stream only');
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
  // Log first 5 raw HBBS lines so we can verify the format
  // in production logs if parser issues arise.
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
      // Mark peer as active without changing IP
      await supabase.updatePeerLastSeen(event.peerId);
      knownPeers.add(event.peerId);
    }

    if (event.type === 'tcp_connection' && event.ip) {
      // TCP/IP-only event — we know the IP is active but don't have the peer ID
      // Look up in our IP map to mark the peer as active
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
  // Track active relay sessions by UUID
  const activeRelays = new Map<string, { ip: string; timestamp: Date; pairedIp?: string }>();

  // Log unmatched HBBR lines (for format diagnosis) — log all unmatched up to 50
  let hbbrUnmatchedCount = 0;

  dockerLogs.streamLogs(config.hbbrContainerName, async (line) => {
    // Reset HBBR parser state on each new stream connection
    // (handled implicitly; resetHbbrParserState is called on reconnect)

    const event = parseHbbrLine(line);
    if (!event) {
      // Log unmatched lines so we can discover new log formats
      if (hbbrUnmatchedCount < 50) {
        logger.info(`[HBBR-UNMATCHED][${hbbrUnmatchedCount + 1}/50] ${line}`);
        hbbrUnmatchedCount++;
      }
      return;
    }

    if (event.type === 'relay_request' && event.uuid && event.ip) {
      // New relay session starting — store for correlation
      activeRelays.set(event.uuid, { ip: event.ip, timestamp: event.timestamp });
      logger.debug(`HBBR relay_request: UUID=${event.uuid} IP=${event.ip}`);

      // Enrich IP map: relay IPs are valuable for correlation.
      // Even if we can't map them to a peer ID yet, storing the IP
      // in the IP map (via reverse lookup from Supabase) helps
      // future relay_paired events correlate properly.
      if (!ipToPeerId.has(event.ip)) {
        const cachedId = await supabase.getPeerByIp(event.ip);
        if (cachedId) {
          ipToPeerId.set(event.ip, cachedId);
          logger.info(`HBBR relay_request: IP=${event.ip} → cached ID=${cachedId} (from Supabase)`);
        }
      }
    }

    if (event.type === 'relay_paired' && event.uuid) {
      // Relay paired — both sides connected, session is forming
      const relay = activeRelays.get(event.uuid);

      // Update the paired IP in the activeRelays map if we track this relay
      if (relay && event.ip) {
        relay.pairedIp = event.ip;
      }

      // We check both event.ip and relay.ip to see which one correlates to a registered peer.
      // One is the operator/controller, the other is the target client/peer.
      const candidateIps = [event.ip, relay?.ip].filter((ip): ip is string => !!ip);

      if (candidateIps.length > 0) {
        logger.info(`HBBR relay_paired: UUID=${event.uuid} candidates=[${candidateIps.join(', ')}]`);

        // Correlate the relay IP with a registered peer
        try {
          let rustdeskId: string | undefined;
          let correlatedIp: string | undefined;

          for (const ip of candidateIps) {
            // 1. Try in-memory IP map (instant, most reliable)
            let id = ipToPeerId.get(ip);

            // 2. Query SQLite peer_ip table (most accurate source)
            if (!id) {
              // Look up ALL peers on this IP (may be multiple in NAT/office environments)
              const sqliteIds = sqliteReader.lookupPeerIdsByIp(ip);
              if (sqliteIds.length === 1) {
                // Single peer on this IP — straightforward correlation
                id = sqliteIds[0];
                ipToPeerId.set(ip, id);
                logger.info(`IP ${ip} resolved to peer ${id} via SQLite peer_ip table (single match)`);
              } else if (sqliteIds.length > 1) {
                // Multiple peers share this IP (NAT/office)
                // Heuristic: prefer the peer that already has an active session
                logger.info(`IP ${ip} has ${sqliteIds.length} peers in SQLite: [${sqliteIds.join(', ')}]. Applying heuristics...`);

                let selectedId: string | null = null;

                // Heuristic 1: Check which peers have active sessions on this IP
                const activeSessionIds = await supabase.getActivePeerIdsOnIp(ip);
                if (activeSessionIds && activeSessionIds.length > 0) {
                  const match = sqliteIds.find(sid => activeSessionIds.includes(sid));
                  if (match) {
                    selectedId = match;
                    logger.info(`Heuristic: Selected peer ${match} — has active session on IP ${ip}`);
                  }
                }

                // Heuristic 2: Prefer the peer with the most recent last_seen
                if (!selectedId) {
                  const recentPeer = await supabase.getMostRecentPeerFromIds(sqliteIds);
                  if (recentPeer) {
                    selectedId = recentPeer;
                    logger.info(`Heuristic: Selected peer ${recentPeer} — most recently active among candidates`);
                  }
                }

                // Heuristic 3: Fallback to first (most recent last_update in SQLite)
                if (!selectedId) {
                  selectedId = sqliteIds[0];
                  logger.info(`Heuristic: Selected peer ${selectedId} — first candidate (most recent SQLite last_update)`);
                }

                id = selectedId;
                ipToPeerId.set(ip, selectedId);
              }
              // If sqliteIds.length === 0, id stays undefined → try Supabase
            }

            // 3. Fallback: query Supabase peers table
            if (!id) {
              id = (await supabase.getPeerByIp(ip)) ?? undefined;
              if (id) {
                ipToPeerId.set(ip, id);
              }
            }

            if (id) {
              rustdeskId = id;
              correlatedIp = ip;
              break; // Found the registered peer!
            }
          }

          if (rustdeskId && correlatedIp) {
            // Keep peer marked online and active
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
      // "Both are raw" — data is actually flowing
      logger.debug(`HBBR relay_active: UUID=${event.uuid} — data flowing`);
    }

    if (event.type === 'relay_closed' && event.ip) {
      logger.info(`HBBR relay_closed: IP=${event.ip}`);

      // Try to close by UUID first (more precise), matching either the requester or paired IP
      let closedByUuid = false;
      for (const [uuid, data] of activeRelays) {
        if (data.ip === event.ip || data.pairedIp === event.ip) {
          await supabase.closeSessionByUuid(uuid);
          activeRelays.delete(uuid);
          closedByUuid = true;
        }
      }

      // Fallback: close by IP if no UUID match found
      if (!closedByUuid) {
        await supabase.closeSessionByIp(event.ip);
      }
    }
  });

  // -------------------------------------------------------
  // 4. Heartbeat — mark inactive peers as offline
  //    Uses grace period to avoid false offline marking
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
  // 6. Periodic diagnostics — log IP map and relay state
  //    Also refreshes agent_state so the dashboard stays live
  // -------------------------------------------------------
  const startedAt = new Date().toISOString();

  const updateAgentState = async () => {
    logger.info(`[Diagnostics] IP map: ${ipToPeerId.size} entries | Known peers: ${knownPeers.size} | Active relays: ${activeRelays.size}`);
    try {
      await supabase.setState('agent_status', {
        status: 'running',
        started_at: startedAt,
        version: '2.0.0',
        ip_map_size: ipToPeerId.size,
        known_peers: knownPeers.size,
        active_relays: activeRelays.size,
        last_heartbeat: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(`Failed to update agent state: ${err}`);
    }
  };

  setInterval(updateAgentState, 120_000); // Every 2 minutes

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

  // Mark agent as running (initial state)
  await supabase.setState('agent_status', {
    status: 'running',
    started_at: startedAt,
    version: '2.0.0',
    ip_map_size: ipToPeerId.size,
    known_peers: knownPeers.size,
    active_relays: 0,
    last_heartbeat: startedAt,
  });

  logger.info('🚀 RustPanel Agent v2.0 is running');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
