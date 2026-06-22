// =============================================================
// RustPanel Agent - Supabase Service
// =============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';
import type { AgentConfig } from '../config.js';

export class SupabaseService {
  public client: SupabaseClient;

  constructor(config: AgentConfig) {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }

  // ---- Peers ----

  async upsertPeer(data: {
    rustdesk_id: string;
    hostname?: string;
    os?: string;
    ip_public?: string;
    info?: Record<string, unknown>;
  }) {
    const { error } = await this.client
      .from('peers')
      .upsert(
        {
          rustdesk_id: data.rustdesk_id,
          hostname: data.hostname || null,
          os: data.os || null,
          ip_public: data.ip_public || null,
          info: data.info || {},
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'rustdesk_id' }
      );

    if (error) {
      logger.error(`Error upserting peer ${data.rustdesk_id}: ${error.message}`);
    } else {
      logger.debug(`Upserted peer: ${data.rustdesk_id}`);
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

  async markOfflinePeers(timeoutMs: number) {
    const threshold = new Date(Date.now() - timeoutMs).toISOString();

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
      logger.info(`Marked ${data.length} peers as offline`);
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
      logger.info(`Created session for peer ${data.rustdesk_id}`);
    }
  }

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
        logger.info(`Closed session ${session.id} (duration: ${duration}s)`);
      }
    }
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
