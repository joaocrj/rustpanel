// =============================================================
// RustPanel Agent - Supabase Service (v2)
// =============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';
import type { AgentConfig } from '../config.js';

export class SupabaseService {
  public client: SupabaseClient;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      realtime: {
        transport: WebSocket as any,
      },
    });
  }

  // ---- Peers ----

  /**
   * Register a peer from SQLite data.
   * IMPORTANT: Does NOT update last_seen or status — only hostname/os/info.
   * This preserves the heartbeat system integrity:
   *   - Only HBBS log events should update last_seen → mark peer online
   *   - Only markOfflinePeers() should change status to offline
   * Calling upsertPeer (which sets last_seen=now) from the SQLite sync
   * would keep all peers' last_seen perpetually fresh, breaking heartbeat.
   */
  async registerPeerFromSqlite(data: {
    rustdesk_id: string;
    hostname?: string;
    os?: string;
    info?: Record<string, unknown>;
  }) {
    const record: Record<string, unknown> = {
      rustdesk_id: data.rustdesk_id,
    };

    // Only set non-null values to avoid overwriting meaningful data with nulls
    if (data.hostname) record.hostname = data.hostname;
    if (data.os) record.os = data.os;
    if (data.info && Object.keys(data.info).length > 0) record.info = data.info;

    const { error } = await this.client
      .from('peers')
      .upsert(record, { onConflict: 'rustdesk_id', ignoreDuplicates: false });

    if (error) {
      logger.error(`Error registering peer ${data.rustdesk_id} from SQLite: ${error.message}`);
    } else {
      logger.debug(`Registered peer from SQLite: ${data.rustdesk_id}`);
    }
  }

  /**
   * Upsert a peer record from a live HBBS event.
   * Sets last_seen to now() — used when a peer actively contacts the server.
   * This is the ONLY place (besides updatePeerLastSeen) that should update last_seen.
   */
  async upsertPeer(data: {
    rustdesk_id: string;
    hostname?: string;
    os?: string;
    ip_public?: string;
    info?: Record<string, unknown>;
  }) {
    const record: Record<string, unknown> = {
      rustdesk_id: data.rustdesk_id,
      last_seen: new Date().toISOString(),
    };

    if (data.hostname) record.hostname = data.hostname;
    if (data.os) record.os = data.os;
    if (data.ip_public) record.ip_public = data.ip_public;
    if (data.info) record.info = data.info;

    const { error } = await this.client
      .from('peers')
      .upsert(record, { onConflict: 'rustdesk_id', ignoreDuplicates: false });

    if (error) {
      logger.error(`Error upserting peer ${data.rustdesk_id}: ${error.message}`);
    } else {
      logger.debug(`Upserted peer: ${data.rustdesk_id}${data.ip_public ? ` (IP: ${data.ip_public})` : ''}`);
    }
  }

  async updatePeerStatus(rustdeskId: string, status: 'online' | 'offline') {
    const { error } = await this.client
      .from('peers')
      .update({
        status,
        last_seen: new Date().toISOString(),
      })
      .eq('rustdesk_id', rustdeskId)
      .neq('status', 'banned'); // Don't update banned peers

    if (error) {
      logger.error(`Error updating peer status ${rustdeskId}: ${error.message}`);
    }
  }

  /**
   * Refresh last_seen WITHOUT changing status.
   * Used by SQLite sync to keep peers "alive" in the heartbeat system.
   * Unlike updatePeerLastSeen, this does NOT set status='online' —
   * it only refreshes the timestamp so markOfflinePeers doesn't
   * prematurely mark peers offline when HBBS hasn't emitted events.
   */
  async refreshPeerLastSeen(rustdeskId: string) {
    const { error } = await this.client
      .from('peers')
      .update({ last_seen: new Date().toISOString() })
      .eq('rustdesk_id', rustdeskId)
      .neq('status', 'banned');

    if (error && error.code !== 'PGRST116') {
      logger.error(`Error refreshing last_seen for ${rustdeskId}: ${error.message}`);
    }
  }

  /**
   * Mark a peer as recently seen (online).
   * Always updates last_seen and status.
   * Optionally updates ip_public if provided.
   */
  async updatePeerLastSeen(rustdeskId: string, ip?: string) {
    const update: Record<string, unknown> = {
      last_seen: new Date().toISOString(),
      status: 'online',
    };
    if (ip) update.ip_public = ip;

    const { error } = await this.client
      .from('peers')
      .update(update)
      .eq('rustdesk_id', rustdeskId)
      .neq('status', 'banned');

    if (error && error.code !== 'PGRST116') {
      logger.error(`Error updating last_seen for ${rustdeskId}: ${error.message}`);
    }
  }

  /**
   * Look up a peer's RustDesk ID by its public IP.
   * Returns the most recently seen peer at that IP.
   */
  async getPeerByIp(ip: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('peers')
      .select('rustdesk_id')
      .eq('ip_public', ip)
      .order('last_seen', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0].rustdesk_id;
  }

  /**
   * Fetch ALL peer IDs that share a given IP.
   * Used for multi-peer NAT heuristics.
   */
  async getAllPeerIdsByIp(ip: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('peers')
      .select('rustdesk_id')
      .eq('ip_public', ip);

    if (error || !data) return [];
    return data.map((p: any) => p.rustdesk_id);
  }

  /**
   * Fetch all peers that have a public IP.
   * Used to initialize the IP map on start.
   */
  async getAllPeersWithIp(): Promise<{ rustdesk_id: string; ip_public: string }[]> {
    const { data, error } = await this.client
      .from('peers')
      .select('rustdesk_id, ip_public')
      .not('ip_public', 'is', null)
      .neq('ip_public', '');

    if (error) {
      logger.error(`Error fetching peers for IP map: ${error.message}`);
      return [];
    }

    return (data || []) as { rustdesk_id: string; ip_public: string }[];
  }

  /**
   * Mark peers as offline if they haven't been seen within the grace period.
   * Uses heartbeatGraceMs (not heartbeatTimeoutMs) to avoid premature offline marking
   * when log streams are reconnecting.
   */
  async markOfflinePeers(graceMs: number) {
    const threshold = new Date(Date.now() - graceMs).toISOString();

    const { data, error } = await this.client
      .from('peers')
      .update({ status: 'offline' })
      .eq('status', 'online')
      .lt('last_seen', threshold)
      .select('rustdesk_id');

    if (error) {
      logger.error(`Error marking offline peers: ${error.message}`);
      return;
    }

    if (data && data.length > 0) {
      const ids = data.map((p) => p.rustdesk_id).join(', ');
      logger.info(`Marked ${data.length} peers as offline (grace: ${Math.round(graceMs / 1000)}s): ${ids}`);
    }
  }

  // ---- Sessions ----

  async createSession(data: {
    rustdesk_id: string;
    ip_public?: string;
    relay_uuid?: string;
  }) {
    // Find peer ID
    const { data: peer } = await this.client
      .from('peers')
      .select('id')
      .eq('rustdesk_id', data.rustdesk_id)
      .single();

    if (!peer) {
      logger.warn(`Cannot create session: peer ${data.rustdesk_id} not found`);
      return;
    }

    // Check for duplicate active session with same relay_uuid
    if (data.relay_uuid) {
      const { data: existing } = await this.client
        .from('sessions')
        .select('id')
        .eq('relay_uuid', data.relay_uuid)
        .eq('is_active', true)
        .limit(1);

      if (existing && existing.length > 0) {
        logger.debug(`Session with relay_uuid ${data.relay_uuid} already exists, skipping`);
        return;
      }
    }

    const { error } = await this.client
      .from('sessions')
      .insert({
        peer_id: peer.id,
        rustdesk_id: data.rustdesk_id,
        ip_public: data.ip_public || null,
        relay_uuid: data.relay_uuid || null,
        is_active: true,
      });

    if (error) {
      logger.error(`Error creating session for ${data.rustdesk_id}: ${error.message}`);
    } else {
      logger.info(`Created session for peer ${data.rustdesk_id} (relay: ${data.relay_uuid || 'N/A'})`);
    }
  }

  /**
   * Close active sessions by relay UUID (most precise method).
   */
  async closeSessionByUuid(uuid: string) {
    const now = new Date();

    const { data: sessions, error: fetchError } = await this.client
      .from('sessions')
      .select('id, connected_at')
      .eq('relay_uuid', uuid)
      .eq('is_active', true);

    if (fetchError || !sessions?.length) return;

    for (const session of sessions) {
      const duration = Math.floor((now.getTime() - new Date(session.connected_at).getTime()) / 1000);

      const { error } = await this.client
        .from('sessions')
        .update({
          is_active: false,
          disconnected_at: now.toISOString(),
          duration_seconds: duration,
        })
        .eq('id', session.id);

      if (error) {
        logger.error(`Error closing session ${session.id} by UUID: ${error.message}`);
      } else {
        logger.info(`Closed session ${session.id} by UUID ${uuid} (duration: ${duration}s)`);
      }
    }
  }

  /**
   * Close active sessions by IP (fallback when UUID is unavailable).
   */
  async closeSessionByIp(ip: string) {
    const now = new Date();

    const { data: sessions, error: fetchError } = await this.client
      .from('sessions')
      .select('id, connected_at')
      .eq('ip_public', ip)
      .eq('is_active', true);

    if (fetchError || !sessions?.length) return;

    for (const session of sessions) {
      const duration = Math.floor((now.getTime() - new Date(session.connected_at).getTime()) / 1000);

      const { error } = await this.client
        .from('sessions')
        .update({
          is_active: false,
          disconnected_at: now.toISOString(),
          duration_seconds: duration,
        })
        .eq('id', session.id);

      if (error) {
        logger.error(`Error closing session ${session.id}: ${error.message}`);
      } else {
        logger.info(`Closed session ${session.id} by IP ${ip} (duration: ${duration}s)`);
      }
    }
  }

  /**
   * Get RustDesk IDs of peers that have an active session on a given IP.
   * Used for multi-peer correlation heuristics (NAT/office environments).
   */
  async getActivePeerIdsOnIp(ip: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('rustdesk_id')
      .eq('ip_public', ip)
      .eq('is_active', true)
      .order('connected_at', { ascending: false });

    if (error || !data) return [];
    return [...new Set(data.map(row => row.rustdesk_id))];
  }

  /**
   * Given a list of RustDesk IDs, return the one with the most recent last_seen.
   * Used for multi-peer correlation heuristics when multiple peers share the same IP.
   */
  async getMostRecentPeerFromIds(ids: string[]): Promise<string | null> {
    if (ids.length === 0) return null;

    const { data, error } = await this.client
      .from('peers')
      .select('rustdesk_id')
      .in('rustdesk_id', ids)
      .order('last_seen', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0].rustdesk_id;
  }

  // ---- Agent State ----

  async getState(key: string): Promise<unknown> {
    const { data } = await this.client
      .from('agent_state')
      .select('value')
      .eq('key', key)
      .single();

    return data?.value;
  }

  async setState(key: string, value: unknown) {
    const { error } = await this.client
      .from('agent_state')
      .upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      logger.error(`Error saving state ${key}: ${error.message}`);
    }
  }

  // ---- Bans ----

  async getActiveBans(): Promise<string[]> {
    const { data, error } = await this.client
      .from('bans')
      .select('rustdesk_id')
      .eq('is_active', true);

    if (error) {
      logger.error(`Error fetching active bans: ${error.message}`);
      return [];
    }

    return data?.map((b) => b.rustdesk_id) || [];
  }
}
