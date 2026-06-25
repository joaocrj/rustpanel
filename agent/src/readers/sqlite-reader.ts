// =============================================================
// RustPanel Agent - SQLite Reader (v2)
// Reads db_v2.sqlite3 from RustDesk server
// =============================================================

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import type { AgentConfig } from '../config.js';
import { existsSync } from 'node:fs';

export interface SqlitePeer {
  id: string;
  uuid: string;
  guid: string;
  created_at?: string;
  user?: string;
  note?: string;
  info?: string;
  status?: number;
}

export interface PeerIpRecord {
  peer_id: string;
  ip: string;
  port: number;
  last_update: string;
}

/**
 * Module-level cache of peer IP mappings from SQLite peer_ip table.
 * Populated during getRegisteredPeers() and accessible via getPeerIpCache().
 */
const peerIpCache = new Map<string, PeerIpRecord>();

export function getPeerIpCache(): Map<string, PeerIpRecord> {
  return peerIpCache;
}

export class SqliteReader {
  private dbPath: string;

  constructor(config: AgentConfig) {
    this.dbPath = config.sqliteDbPath;
  }

  getRegisteredPeers(): SqlitePeer[] {
    if (!existsSync(this.dbPath)) {
      logger.warn(`SQLite database not found at ${this.dbPath}`);
      return [];
    }

    try {
      // Open in readonly mode to avoid lock conflicts with hbbs
      const db = new Database(this.dbPath, { readonly: true });

      const rows = db.prepare(`
        SELECT
          id,
          hex(uuid) as uuid,
          hex(guid) as guid,
          created_at,
          user,
          note,
          info,
          status
        FROM peer
        ORDER BY created_at DESC
      `).all() as SqlitePeer[];

      // Also query peer_ip table to build IP → peer mapping
      try {
        const ipRows = db.prepare(`
          SELECT peer_id, ip, port, last_update
          FROM peer_ip
          ORDER BY last_update DESC
        `).all() as PeerIpRecord[];
        logger.info(`Read ${ipRows.length} IP mappings from SQLite peer_ip table`);

        // Store in module-level cache for lookup
        peerIpCache.clear();
        for (const row of ipRows) {
          peerIpCache.set(row.peer_id, row);
        }
      } catch (err: any) {
        // peer_ip table may not exist in older RustDesk versions
        logger.warn(`peer_ip table query failed: ${err?.message || err}. IP lookup will rely solely on log streams.`);
      }

      db.close();
      logger.debug(`Read ${rows.length} peers from SQLite`);
      return rows;
    } catch (error) {
      logger.error(`Error reading SQLite: ${error}`);
      return [];
    }
  }

  /**
   * Look up a peer's RustDesk ID by public IP using the peer_ip table.
   * Returns the peer ID string or null if not found.
   * This is the critical correlation function — it bridges the gap
   * between relay IPs (from HBBR logs) and registered peer IDs (from SQLite).
   * 
   * NOTE: When multiple peers share the same IP (NAT/office), only the
   * most recently updated one is returned. Use lookupPeerIdsByIp() to
   * get all peers on an IP for smarter correlation.
   */
  lookupPeerIdByIp(ip: string): string | null {
    if (!existsSync(this.dbPath)) {
      logger.warn(`SQLite database not found at ${this.dbPath} (IP lookup)`);
      return null;
    }

    try {
      const db = new Database(this.dbPath, { readonly: true });

      // peer_ip table: peer_id (text), ip (text), port (int), last_update (text)
      const row = db.prepare(`
        SELECT peer_id
        FROM peer_ip
        WHERE ip = ?
        ORDER BY last_update DESC
        LIMIT 1
      `).get(ip) as { peer_id: string } | undefined;

      db.close();

      if (row) {
        logger.info(`SQLite IP lookup: ${ip} → ${row.peer_id}`);
        return row.peer_id;
      }

      return null;
    } catch {
      // Table may not exist or query may fail
      logger.debug(`SQLite IP lookup failed for ${ip} (table may not exist)`);
      return null;
    }
  }

  /**
   * Look up ALL peer IDs associated with a given IP from the peer_ip table.
   * Returns peer IDs ordered by most recent last_update first.
   * 
   * This is critical when multiple peers share the same public IP
   * (e.g., NAT/office environments). The caller should use additional
   * heuristics (active sessions, recent activity) to pick the correct peer.
   */
  lookupPeerIdsByIp(ip: string): string[] {
    if (!existsSync(this.dbPath)) {
      return [];
    }

    try {
      const db = new Database(this.dbPath, { readonly: true });

      const rows = db.prepare(`
        SELECT peer_id, last_update
        FROM peer_ip
        WHERE ip = ?
        ORDER BY last_update DESC
      `).all(ip) as { peer_id: string; last_update: string }[];

      db.close();

      if (rows.length > 0) {
        const ids = rows.map(r => r.peer_id);
        logger.info(`SQLite IP lookup (multi): ${ip} → [${ids.join(', ')}] (${ids.length} peers)`);
        return ids;
      }

      return [];
    } catch {
      logger.debug(`SQLite IP lookup (multi) failed for ${ip} (table may not exist)`);
      return [];
    }
  }

  /**
   * Parse the info field from SQLite peer to extract hostname and OS
   */
  static parseInfo(info: string | undefined): { hostname?: string; os?: string; version?: string } {
    if (!info) return {};

    try {
      // The info field may contain JSON or pipe/comma-separated data
      if (info.startsWith('{')) {
        const parsed = JSON.parse(info);
        return {
          hostname: parsed.hostname || parsed.device_name || undefined,
          os: parsed.os || parsed.platform || undefined,
          version: parsed.version || undefined,
        };
      }

      // Try comma-separated format: "hostname,os,version"
      const parts = info.split(',');
      if (parts.length >= 2) {
        return {
          hostname: parts[0]?.trim() || undefined,
          os: parts[1]?.trim() || undefined,
          version: parts[2]?.trim() || undefined,
        };
      }
    } catch {
      // Not parseable, return empty
    }

    return {};
  }
}