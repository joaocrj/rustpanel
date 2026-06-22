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
      const { data, error } = await supabase
        .from('dashboard_stats')
        .select('*')
        .single();

      if (error) throw error;
      return data as DashboardStats;
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
