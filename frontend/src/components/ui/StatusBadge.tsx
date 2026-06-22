import type { PeerStatus } from '@/types';

interface StatusBadgeProps {
  status: PeerStatus;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

const statusConfig: Record<PeerStatus, { label: string; class: string; dotClass: string }> = {
  online: { label: 'Online', class: 'badge-success', dotClass: 'online' },
  offline: { label: 'Offline', class: 'badge-muted', dotClass: 'offline' },
  banned: { label: 'Banido', class: 'badge-danger', dotClass: 'banned' },
};

export function StatusBadge({ status, size = 'md', showDot = true }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.offline;

  return (
    <span className={`badge ${config.class} ${size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : ''}`}>
      {showDot && <span className={`status-dot ${config.dotClass}`} />}
      {config.label}
    </span>
  );
}
