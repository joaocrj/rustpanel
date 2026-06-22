import { motion } from 'framer-motion';
import { Wifi, Download, Clock } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useActiveSessions } from '@/hooks/useData';
import { formatRelativeTime, formatUptime } from '@/lib/utils';
import { exportSessions } from '@/lib/export';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';

export function SessionsPage() {
  const { data: sessions, isLoading } = useActiveSessions();
  const { hasRole } = useAuth();
  const canExport = hasRole(['super_admin', 'admin']);
  const [, setTick] = useState(0);

  // Re-render every 10s to update durations
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <Header
        title="Sessões Ativas"
        subtitle={`${sessions?.length ?? 0} sessões em andamento`}
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: 'var(--color-success)' }}
            />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Atualização em tempo real
            </span>
          </div>

          {canExport && (
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost" onClick={() => exportSessions('csv')}>
                <Download className="w-4 h-4" /> CSV
              </button>
              <button className="btn btn-ghost" onClick={() => exportSessions('xlsx')}>
                <Download className="w-4 h-4" /> XLSX
              </button>
            </div>
          )}
        </div>

        {/* Sessions Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-5 space-y-3">
                <div className="skeleton h-5 w-24" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : sessions?.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card p-12 text-center"
          >
            <Wifi className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--color-text-disabled)' }} />
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Nenhuma sessão ativa
            </h3>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              As sessões relay aparecerão aqui em tempo real quando detectadas pelo agent.
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions?.map((session, idx) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="card p-5 glow-border"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
                      {session.rustdesk_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="status-dot online" />
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>
                      ATIVA
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      IP Público
                    </span>
                    <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {session.ip_public || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      IP Local
                    </span>
                    <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {session.ip_local || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Conectado há
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {formatUptime(session.connected_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Início
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {formatRelativeTime(session.connected_at)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
