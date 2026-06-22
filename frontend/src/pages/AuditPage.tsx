import { useState } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, Filter, Download } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAuditLogs } from '@/hooks/useData';
import { formatDateTime, getActionLabel } from '@/lib/utils';
import { exportAuditLogs } from '@/lib/export';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const actionColors: Record<string, string> = {
  login: 'badge-info',
  logout: 'badge-muted',
  ban_peer: 'badge-danger',
  unban_peer: 'badge-success',
  update_peer: 'badge-warning',
  export_data: 'badge-info',
};

export function AuditPage() {
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading } = useAuditLogs({ action: actionFilter, page, pageSize });
  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  return (
    <div>
      <Header
        title="Auditoria"
        subtitle={`${data?.total ?? 0} registros`}
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
            <select
              className="input w-auto"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            >
              <option value="all">Todas as ações</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="ban_peer">Banimento</option>
              <option value="unban_peer">Desbanimento</option>
              <option value="update_peer">Atualização</option>
              <option value="export_data">Exportação</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={() => exportAuditLogs('csv')}>
              <Download className="w-4 h-4" /> CSV
            </button>
            <button className="btn btn-ghost" onClick={() => exportAuditLogs('xlsx')}>
              <Download className="w-4 h-4" /> XLSX
            </button>
          </div>
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
                  <th>Data</th>
                  <th>Ação</th>
                  <th>Usuário</th>
                  <th>Entidade</th>
                  <th>IP</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j}><div className="skeleton h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                )}
                {!isLoading && data?.logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
                      <ScrollText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-text-disabled)' }} />
                      Nenhum registro de auditoria encontrado
                    </td>
                  </tr>
                )}
                {data?.logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-xs whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td>
                      <span className={`badge ${actionColors[log.action] || 'badge-muted'}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="text-xs">
                      {log.profile?.full_name || log.profile?.email || 'Sistema'}
                    </td>
                    <td className="text-xs">
                      {log.entity_type && (
                        <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                          {log.entity_type}
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-xs">{log.ip_address || '—'}</td>
                    <td className="text-xs max-w-[200px] truncate">
                      {log.metadata && Object.keys(log.metadata).length > 0
                        ? JSON.stringify(log.metadata)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Mostrando {((page - 1) * pageSize) + 1}—{Math.min(page * pageSize, data?.total || 0)} de {data?.total || 0}
              </p>
              <div className="flex items-center gap-1">
                <button
                  className="btn btn-ghost p-1.5"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs px-3" style={{ color: 'var(--color-text-secondary)' }}>
                  {page} / {totalPages}
                </span>
                <button
                  className="btn btn-ghost p-1.5"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
