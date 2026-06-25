// =============================================================
// RustPanel Agent - SQLite Reader (v3)
// Reads db_v2.sqlite3 from RustDesk server
// =============================================================
//
// NOTE: This RustDesk version does NOT have a peer_ip table.
// IP → Peer ID correlation relies on:
//   1. HBBS log streaming (real-time update_pk events)
//   2. Supabase peers table (ip_public column)
//   3. HBBS log backfill on startup
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

export class SqliteReader {
  private dbPath: string;

  constructor(config: AgentConfig) {
    this.dbPath = config.sqliteDbPath;
  }

  /**
   * Read all registered peers from the RustDesk SQLite database.
   * Only reads the peer table — no peer_ip dependency.
   */
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

      db.close();
      logger.info(`Read ${rows.length} peers from SQLite at ${this.dbPath}`);
      return rows;
    } catch (error) {
      logger.error(`Error reading SQLite: ${error}`);
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