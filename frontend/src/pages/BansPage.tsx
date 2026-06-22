import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldBan, ShieldCheck, Download } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useBans, useUnbanPeer } from '@/hooks/useData';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';
import { exportBans } from '@/lib/export';
import { useAuth } from '@/contexts/AuthContext';

export function BansPage() {
  const [showAll, setShowAll] = useState(false);
  const [unbanTarget, setUnbanTarget] = useState<{ banId: string; peerId: string; rustdeskId: string } | null>(null);
  const { data: bans, isLoading } = useBans(!showAll);
  const unbanPeer = useUnbanPeer();
  const { hasRole } = useAuth();
  const canManage = hasRole(['super_admin', 'admin']);

  return (
    <div>
      <Header
        title="Banimentos"
        subtitle={`${bans?.length ?? 0} ${showAll ? 'registros totais' : 'bans ativos'}`}
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Mostrar histórico completo
              </span>
            </label>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost" onClick={() => exportBans('csv')}>
                <Download className="w-4 h-4" /> CSV
              </button>
              <button className="btn btn-ghost" onClick={() => exportBans('xlsx')}>
                <Download className="w-4 h-4" /> XLSX
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>RustDesk ID</th>
                  <th>Motivo</th>
                  <th>Observações</th>
                  <th>Status</th>
                  <th>Data Ban</th>
                  <th>Data Unban</th>
                  {canManage && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: canManage ? 7 : 6 }).map((_, j) => (
                        <td key={j}><div className="skeleton h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                )}
                {!isLoading && bans?.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
                      <ShieldBan className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-text-disabled)' }} />
                      Nenhum banimento {showAll ? 'registrado' : 'ativo'}
                    </td>
                  </tr>
                )}
                {bans?.map((ban) => (
                  <tr key={ban.id}>
                    <td>
                      <span className="font-mono text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                        {ban.rustdesk_id}
                      </span>
                    </td>
                    <td className="text-xs max-w-[200px] truncate">{ban.reason}</td>
                    <td className="text-xs max-w-[200px] truncate">{ban.notes || '—'}</td>
                    <td>
                      {ban.is_active ? (
                        <span className="badge badge-danger">Ativo</span>
                      ) : (
                        <span className="badge badge-muted">Revogado</span>
                      )}
                    </td>
                    <td className="text-xs">{formatDateTime(ban.banned_at)}</td>
                    <td className="text-xs">{ban.unbanned_at ? formatDateTime(ban.unbanned_at) : '—'}</td>
                    {canManage && (
                      <td>
                        {ban.is_active && (
                          <button
                            className="btn btn-ghost p-1.5 text-xs gap-1"
                            onClick={() => setUnbanTarget({
                              banId: ban.id,
                              peerId: ban.peer_id,
                              rustdeskId: ban.rustdesk_id,
                            })}
                            title="Desbanir"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />
                            <span style={{ color: 'var(--color-success)' }}>Desbanir</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* Confirm Unban */}
      <ConfirmDialog
        open={!!unbanTarget}
        onClose={() => setUnbanTarget(null)}
        onConfirm={() => {
          if (unbanTarget) {
            unbanPeer.mutate(
              { banId: unbanTarget.banId, peerId: unbanTarget.peerId },
              { onSuccess: () => setUnbanTarget(null) }
            );
          }
        }}
        title="Desbanir Peer"
        description={`Tem certeza que deseja desbanir o ID ${unbanTarget?.rustdeskId}? O peer poderá se reconectar.`}
        confirmLabel="Desbanir"
        variant="primary"
        loading={unbanPeer.isPending}
      />
    </div>
  );
}
