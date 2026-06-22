import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format, differenceInSeconds } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | null): string {
  if (!date) return '—';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  } catch {
    return '—';
  }
}

export function formatDateTime(date: string | null): string {
  if (!date) return '—';
  try {
    return format(new Date(date), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR });
  } catch {
    return '—';
  }
}

export function formatDate(date: string | null): string {
  if (!date) return '—';
  try {
    return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '—';
  }
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}m ${sec}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${min}m`;
}

export function formatUptime(date: string): string {
  const seconds = differenceInSeconds(new Date(), new Date(date));
  return formatDuration(seconds);
}

export function truncateIP(ip: string | null): string {
  if (!ip) return '—';
  // Remove IPv6-mapped prefix
  return ip.replace(/^\[?::ffff:/i, '').replace(/\]$/, '');
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'online': return 'badge-success';
    case 'offline': return 'badge-muted';
    case 'banned': return 'badge-danger';
    default: return 'badge-muted';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'online': return 'Online';
    case 'offline': return 'Offline';
    case 'banned': return 'Banido';
    default: return status;
  }
}

export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'login': 'Login',
    'logout': 'Logout',
    'ban_peer': 'Banimento',
    'unban_peer': 'Desbanimento',
    'update_peer': 'Atualização de Peer',
    'export_data': 'Exportação',
  };
  return labels[action] || action;
}
