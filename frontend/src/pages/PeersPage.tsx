import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  Download,
  MoreHorizontal,
  Edit3,
  ShieldBan,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { usePeers, useUpdatePeer, useBanPeer } from '@/hooks/useData';
import { formatRelativeTime, formatDuration, formatDateTime } from '@/lib/utils';
import { exportPeers } from '@/lib/export';
import type { Peer, PeerStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export function PeersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [editingPeer, setEditingPeer] = useState<Peer | null>(null);
  const [banModal, setBanModal] = useState<Peer | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banNotes, setBanNotes] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const pageSize = 25;

  const { hasRole } = useAuth();
  const canManage = hasRole(['super_admin', 'admin']);

  const { data, isLoading } = usePeers({
    search: search || undefined,
    status: statusFilter,
    page,
    pageSize,
  });

  const updatePeer = useUpdatePeer();
  const banPeer = useBanPeer();

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  const handleEditSave = () => {
    if (!editingPeer) return;
    updatePeer.mutate(
      { id: editingPeer.id, updates: { alias: editAlias || null } },
      { onSuccess: () => setEditingPeer(null) }
    );
  };

  const handleBan = () => {
    if (!banModal) return;
    banPeer.mutate(
      {
        peerId: banModal.id,
        rustdeskId: banModal.rustdesk_id,
        reason: banReason,
        notes: banNotes || undefined,
      },
      {
        onSuccess: () => {
          setBanModal(null);
          setBanReason('');
          setBanNotes('');
        },
      }
    );
  };

  return (
    <div>
      <Header title="Peers" subtitle={`${data?.total ?? 0} dispositivos detectados`} />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
            <input
              className="input pl-9"
              placeholder="Buscar por ID, alias, hostname, IP..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
            <select
              className="input w-auto"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="all">Todos</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="banned">Banidos</option>
            </select>
          </div>

          {/* Export */}
          {canManage && (
            <div className="flex items-center gap-2 ml-auto">
              <button className="btn btn-ghost" onClick={() => exportPeers('csv')}>
                <Download className="w-4 h-4" /> CSV
              </button>
              <button className="btn btn-ghost" onClick={() => exportPeers('xlsx')}>
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
                  <th>Alias</th>
                  <th>Hostname</th>
                  <th>OS</th>
                  <th>IP Público</th>
                  <th>Status</th>
                  <th>Primeira Conexão</th>
                  <th>Última Conexão</th>
                  <th>Tempo Online</th>
                  {canManage && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: canManage ? 10 : 9 }).map((_, j) => (
                        <td key={j}><div className="skeleton h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                )}
                {!isLoading && data?.peers.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 10 : 9} className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
                      {search ? 'Nenhum peer encontrado para esta busca' : 'Nenhum peer detectado. O agent está rodando?'}
                    </td>
                  </tr>
                )}
                {data?.peers.map((peer) => (
                  <tr key={peer.id}>
                    <td>
                      <span className="font-mono text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                        {peer.rustdesk_id}
                      </span>
                    </td>
                    <td>{peer.alias || <span style={{ color: 'var(--color-text-disabled)' }}>—</span>}</td>
                    <td className="text-xs">{peer.hostname || '—'}</td>
                    <td className="text-xs">{peer.os || '—'}</td>
                    <td className="font-mono text-xs">{peer.ip_public || '—'}</td>
                    <td title={`Último contato: ${formatDateTime(peer.last_seen)}`}>
                      <StatusBadge status={peer.status} size="sm" />
                    </td>
                    <td className="text-xs">{formatDateTime(peer.first_seen)}</td>
                    <td className="text-xs" title={formatDateTime(peer.last_seen)}>
                      {formatRelativeTime(peer.last_seen)}
                    </td>
                    <td className="text-xs">{formatDuration(peer.total_online_seconds)}</td>
                    {canManage && (
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            className="p-1.5 rounded-md transition-colors cursor-pointer"
                            style={{ color: 'var(--color-text-muted)' }}
                            title="Editar alias"
                            onClick={() => {
                              setEditingPeer(peer);
                              setEditAlias(peer.alias || '');
                            }}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {peer.status !== 'banned' && (
                            <button
                              className="p-1.5 rounded-md transition-colors cursor-pointer"
                              style={{ color: 'var(--color-danger)' }}
                              title="Banir"
                              onClick={() => setBanModal(peer)}
                            >
                              <ShieldBan className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
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

      {/* Edit Alias Modal */}
      <Modal
        open={!!editingPeer}
        onClose={() => setEditingPeer(null)}
        title="Editar Peer"
        description={`RustDesk ID: ${editingPeer?.rustdesk_id}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Alias
            </label>
            <input
              className="input"
              placeholder="Nome amigável para este peer"
              value={editAlias}
              onChange={(e) => setEditAlias(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn btn-ghost" onClick={() => setEditingPeer(null)}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleEditSave}
              disabled={updatePeer.isPending}
            >
              {updatePeer.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Ban Modal */}
      <Modal
        open={!!banModal}
        onClose={() => setBanModal(null)}
        title="Banir Peer"
        description={`Tem certeza que deseja banir o ID ${banModal?.rustdesk_id}?`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Motivo *
            </label>
            <input
              className="input"
              placeholder="Motivo do banimento"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Observações
            </label>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="Observações adicionais (opcional)"
              value={banNotes}
              onChange={(e) => setBanNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn btn-ghost" onClick={() => setBanModal(null)}>
              Cancelar
            </button>
            <button
              className="btn btn-danger"
              onClick={handleBan}
              disabled={!banReason || banPeer.isPending}
            >
              {banPeer.isPending ? 'Banindo...' : 'Confirmar Banimento'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
