import { motion } from 'framer-motion';
import {
  Monitor,
  Wifi,
  WifiOff,
  ShieldBan,
  Activity,
  Clock,
  Zap,
  Server,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDashboardStats, usePeers, useActiveSessions, useAgentStatus } from '@/hooks/useData';
import { formatRelativeTime, formatDuration } from '@/lib/utils';

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: activePeers } = usePeers({ status: 'online', pageSize: 5, sortBy: 'last_seen', sortDir: 'desc' });
  const { data: activeSessions } = useActiveSessions();
  const { data: agentStatus } = useAgentStatus();

  const isAgentRunning = agentStatus?.status === 'running';

  return (
    <div>
      <Header title="Dashboard" subtitle="Visão geral do sistema" />

      <div className="p-6 space-y-6">
        {/* Agent Status Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: isAgentRunning
                    ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                    : 'color-mix(in srgb, var(--color-danger) 15%, transparent)',
                }}
              >
                <Server
                  className="w-5 h-5"
                  style={{ color: isAgentRunning ? 'var(--color-success)' : 'var(--color-danger)' }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    RustPanel Agent
                  </h3>
                  {isAgentRunning ? (
                    <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                  ) : (
                    <XCircle className="w-4 h-4" style={{ color: 'var(--color-danger)' }} />
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {isAgentRunning
                    ? `v${agentStatus?.version || '?'} • Rodando desde ${formatRelativeTime(agentStatus?.started_at || null)}`
                    : 'Agent não está rodando ou não reportou status'}
                </p>
              </div>
            </div>
            {isAgentRunning && agentStatus && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Mapa IP→ID
                  </p>
                  <p className="text-sm font-mono font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {agentStatus.ip_map_size ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Peers Rastreados
                  </p>
                  <p className="text-sm font-mono font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {agentStatus.known_peers ?? '—'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

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
          {/* Active Peers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card"
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Peers Ativos
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
                  {activePeers?.peers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                        Nenhum peer online no momento
                      </td>
                    </tr>
                  )}
                  {activePeers?.peers.map((peer) => (
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