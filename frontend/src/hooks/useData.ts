import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DashboardStats, Peer, Session, Ban, AuditLog } from '@/types';

// =============================================================
// Dashboard
// =============================================================

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      // Try the view first
      const { data, error } = await supabase
        .from('dashboard_stats')
        .select('*')
        .single();

      if (!error && data) {
        return data as DashboardStats;
      }

      // Fallback: compute stats directly from tables if view is inaccessible (RLS issue)
      console.warn('dashboard_stats view failed, computing stats from tables:', error?.message);
      const [peersResult, sessionsResult] = await Promise.all([
        supabase.from('peers').select('status, last_seen', { count: 'exact' }),
        supabase.from('sessions').select('duration_seconds, connected_at'),
      ]);

      const peers = peersResult.data || [];
      const sessions = sessionsResult.data || [];

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const recentSessions = sessions.filter(s => s.connected_at >= weekAgo && s.duration_seconds != null);
      const avgDuration = recentSessions.length > 0
        ? Math.round(recentSessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / recentSessions.length)
        : 0;

      return {
        total_peers: peers.length,
        peers_online: peers.filter((p: any) => p.status === 'online').length,
        peers_offline: peers.filter((p: any) => p.status === 'offline').length,
        peers_banned: peers.filter((p: any) => p.status === 'banned').length,
        sessions_today: sessions.filter(s => s.connected_at >= todayStart).length,
        avg_session_duration: avgDuration,
        last_activity: peers.length > 0
          ? peers.reduce((max: string, p: any) => p.last_seen > max ? p.last_seen : max, '')
          : null,
      };
    },
    refetchInterval: 30_000,
  });
}

export interface AgentStatus {
  status: string;
  started_at: string;
  version: string;
  ip_map_size?: number;
  known_peers?: number;
}

export function useAgentStatus() {
  return useQuery({
    queryKey: ['agent-status'],
    queryFn: async (): Promise<AgentStatus | null> => {
      const { data, error } = await supabase
        .from('agent_state')
        .select('value')
        .eq('key', 'agent_status')
        .single();

      if (error || !data) return null;
      return data.value as AgentStatus;
    },
    refetchInterval: 30_000,
  });
}

// =============================================================
// Peers
// =============================================================

interface PeersQuery {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function usePeers(query: PeersQuery = {}) {
  const { search, status, page = 1, pageSize = 25, sortBy = 'last_seen', sortDir = 'desc' } = query;

  return useQuery({
    queryKey: ['peers', query],
    queryFn: async () => {
      let q = supabase
        .from('peers')
        .select('*', { count: 'exact' });

      if (search) {
        q = q.or(`rustdesk_id.ilike.%${search}%,alias.ilike.%${search}%,hostname.ilike.%${search}%,ip_public.ilike.%${search}%`);
      }

      if (status && status !== 'all') {
        q = q.eq('status', status);
      }

      q = q.order(sortBy, { ascending: sortDir === 'asc' });
      q = q.range((page - 1) * pageSize, page * pageSize - 1);

      const { data, error, count } = await q;
      if (error) throw error;

      return {
        peers: data as Peer[],
        total: count || 0,
      };
    },
  });
}

export function usePeer(id: string) {
  return useQuery({
    queryKey: ['peer', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('peers')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Peer;
    },
    enabled: !!id,
  });
}

export function useUpdatePeer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Peer> }) => {
      const { data, error } = await supabase
        .from('peers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Peer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

// =============================================================
// Sessions
// =============================================================

export function useActiveSessions() {
  return useQuery({
    queryKey: ['sessions-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('is_active', true)
        .order('connected_at', { ascending: false });

      if (error) throw error;
      return data as Session[];
    },
    refetchInterval: 15_000,
  });
}

interface SessionsQuery {
  peerId?: string;
  page?: number;
  pageSize?: number;
}

export function useSessions(query: SessionsQuery = {}) {
  const { peerId, page = 1, pageSize = 25 } = query;

  return useQuery({
    queryKey: ['sessions', query],
    queryFn: async () => {
      let q = supabase
        .from('sessions')
        .select('*', { count: 'exact' })
        .order('connected_at', { ascending: false });

      if (peerId) {
        q = q.eq('peer_id', peerId);
      }

      q = q.range((page - 1) * pageSize, page * pageSize - 1);

      const { data, error, count } = await q;
      if (error) throw error;

      return {
        sessions: data as Session[],
        total: count || 0,
      };
    },
  });
}

// =============================================================
// Bans
// =============================================================

export function useBans(activeOnly = true) {
  return useQuery({
    queryKey: ['bans', { activeOnly }],
    queryFn: async () => {
      let q = supabase
        .from('bans')
        .select('*')
        .order('banned_at', { ascending: false });

      if (activeOnly) {
        q = q.eq('is_active', true);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as Ban[];
    },
  });
}

export function useBanPeer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ peerId, rustdeskId, reason, notes }: {
      peerId: string;
      rustdeskId: string;
      reason: string;
      notes?: string;
    }) => {
      // Create ban record
      const { error: banError } = await supabase
        .from('bans')
        .insert({
          peer_id: peerId,
          rustdesk_id: rustdeskId,
          banned_by: (await supabase.auth.getUser()).data.user?.id,
          reason,
          notes: notes || null,
        });

      if (banError) throw banError;

      // Update peer status
      const { error: peerError } = await supabase
        .from('peers')
        .update({ status: 'banned' })
        .eq('id', peerId);

      if (peerError) throw peerError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peers'] });
      queryClient.invalidateQueries({ queryKey: ['bans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

export function useUnbanPeer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ banId, peerId }: { banId: string; peerId: string }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;

      // Deactivate ban
      const { error: banError } = await supabase
        .from('bans')
        .update({
          is_active: false,
          unbanned_at: new Date().toISOString(),
          unbanned_by: userId,
        })
        .eq('id', banId);

      if (banError) throw banError;

      // Update peer status
      const { error: peerError } = await supabase
        .from('peers')
        .update({ status: 'offline' })
        .eq('id', peerId);

      if (peerError) throw peerError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peers'] });
      queryClient.invalidateQueries({ queryKey: ['bans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

// =============================================================
// Audit Logs
// =============================================================

interface AuditQuery {
  action?: string;
  page?: number;
  pageSize?: number;
}

export function useAuditLogs(query: AuditQuery = {}) {
  const { action, page = 1, pageSize = 50 } = query;

  return useQuery({
    queryKey: ['audit-logs', query],
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('*, profile:profiles!audit_logs_user_id_fkey(full_name, email, role)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (action && action !== 'all') {
        q = q.eq('action', action);
      }

      q = q.range((page - 1) * pageSize, page * pageSize - 1);

      const { data, error, count } = await q;
      if (error) throw error;

      return {
        logs: data as (AuditLog & { profile: { full_name: string; email: string; role: string } | null })[],
        total: count || 0,
      };
    },
  });
}
