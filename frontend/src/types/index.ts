// =============================================================
// RustPanel - Type Definitions
// =============================================================

export type UserRole = 'super_admin' | 'admin' | 'operator';
export type PeerStatus = 'online' | 'offline' | 'banned';

// =============================================================
// Database Types (mirrors Supabase schema)
// =============================================================

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Peer {
  id: string;
  rustdesk_id: string;
  alias: string | null;
  hostname: string | null;
  os: string | null;
  ip_public: string | null;
  ip_local: string | null;
  info: Record<string, unknown>;
  status: PeerStatus;
  first_seen: string;
  last_seen: string;
  total_online_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  peer_id: string;
  rustdesk_id: string;
  ip_public: string | null;
  ip_local: string | null;
  relay_uuid: string | null;
  connected_at: string;
  disconnected_at: string | null;
  duration_seconds: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Ban {
  id: string;
  peer_id: string;
  rustdesk_id: string;
  banned_by: string | null;
  reason: string;
  notes: string | null;
  is_active: boolean;
  banned_at: string;
  unbanned_at: string | null;
  unbanned_by: string | null;
  created_at: string;
  // Joined data
  banned_by_profile?: Profile;
  unbanned_by_profile?: Profile;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  // Joined data
  profile?: Profile;
}

export interface DashboardStats {
  total_peers: number;
  peers_online: number;
  peers_offline: number;
  peers_banned: number;
  sessions_today: number;
  avg_session_duration: number;
  last_activity: string | null;
}

// =============================================================
// UI Types
// =============================================================

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
}
