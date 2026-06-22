import { motion } from 'framer-motion';
import {
  Monitor,
  Wifi,
  WifiOff,
  ShieldBan,
  Activity,
  Clock,
  Zap,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDashboardStats, usePeers, useActiveSessions } from '@/hooks/useData';
import { formatRelativeTime, formatDuration } from '@/lib/utils';

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentPeers } = usePeers({ pageSize: 5, sortBy: 'last_seen', sortDir: 'desc' });
  const { data: activeSessions } = useActiveSessions();

  return (
    <div>
      <Header title="Dashboard" subtitle="Visão geral do sistema" />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <StatCard
            title="Total de IDs"
            value={stats?.total_peers ?? '—'}
            icon={<Monitor className="w-5 h-5" />}
            color="primary"
            loading={statsLoading}
          />
          <StatCard
            title="Online"
            value={stats?.peers_online ?? '—'}
            icon={<Wifi className="w-5 h-5" />}
            color="success"
            loading={statsLoading}
          />
          <StatCard
            title="Offline"
            value={stats?.peers_offline ?? '—'}
            icon={<WifiOff className="w-5 h-5" />}
            color="info"
            loading={statsLoading}
          />
          <StatCard
            title="Banidos"
            value={stats?.peers_banned ?? '—'}
            icon={<ShieldBan className="w-5 h-5" />}
            color="danger"
            loading={statsLoading}
          />
          <StatCard
            title="Sessões Hoje"
            value={stats?.sessions_today ?? '—'}
            icon={<Activity className="w-5 h-5" />}
            color="accent"
            loading={statsLoading}
          />
          <StatCard
            title="Tempo Médio"
            value={stats ? formatDuration(stats.avg_session_duration) : '—'}
            icon={<Clock className="w-5 h-5" />}
            color="warning"
            loading={statsLoading}
          />
          <StatCard
            title="Última Atividade"
            value={stats?.last_activity ? formatRelativeTime(stats.last_activity) : '—'}
            icon={<Zap className="w-5 h-5" />}
            color="primary"
            loading={statsLoading}
          />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Peers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card"
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Peers Recentes
              </h3>
              <a
                href="/peers"
                className="text-xs font-medium transition-colors"
                style={{ color: 'var(--color-primary)' }}
              >
                Ver todos →
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>IP Público</th>
                    <th>Última Atividade</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPeers?.peers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                        Nenhum peer detectado ainda. Aguardando o agent...
                      </td>
                    </tr>
                  )}
                  {recentPeers?.peers.map((peer) => (
                    <tr key={peer.id}>
                      <td>
                        <div>
                          <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
                            {peer.rustdesk_id}
                          </span>
                          {peer.alias && (
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                              {peer.alias}
                            </p>
                          )}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={peer.status} size="sm" />
                      </td>
                      <td className="font-mono text-xs">{peer.ip_public || '—'}</td>
                      <td className="text-xs">{formatRelativeTime(peer.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Active Sessions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card"
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Sessões Ativas
                </h3>
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: 'var(--color-success)' }}
                />
              </div>
              <a
                href="/sessions"
                className="text-xs font-medium transition-colors"
                style={{ color: 'var(--color-primary)' }}
              >
                Ver todas →
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>IP Público</th>
                    <th>Conectado há</th>
                  </tr>
                </thead>
                <tbody>
                  {(!activeSessions || activeSessions.length === 0) && (
                    <tr>
                      <td colSpan={3} className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                        Nenhuma sessão ativa no momento
                      </td>
                    </tr>
                  )}
                  {activeSessions?.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
                          {session.rustdesk_id}
                        </span>
                      </td>
                      <td className="font-mono text-xs">{session.ip_public || '—'}</td>
                      <td className="text-xs">{formatRelativeTime(session.connected_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
