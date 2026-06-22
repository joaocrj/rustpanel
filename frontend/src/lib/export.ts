import { supabase } from '@/lib/supabase';
import type { Peer, Session, Ban, AuditLog } from '@/types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

type ExportFormat = 'csv' | 'xlsx';

async function fetchAllPeers(): Promise<Peer[]> {
  const { data, error } = await supabase
    .from('peers')
    .select('*')
    .order('last_seen', { ascending: false });
  if (error) throw error;
  return data as Peer[];
}

async function fetchAllSessions(): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('connected_at', { ascending: false })
    .limit(10000);
  if (error) throw error;
  return data as Session[];
}

async function fetchAllBans(): Promise<Ban[]> {
  const { data, error } = await supabase
    .from('bans')
    .select('*')
    .order('banned_at', { ascending: false });
  if (error) throw error;
  return data as Ban[];
}

async function fetchAllAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10000);
  if (error) throw error;
  return data as AuditLog[];
}

function downloadFile(content: string | ArrayBuffer, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportCSV(data: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(data);
  downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
}

function exportXLSX(data: Record<string, unknown>[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  downloadFile(buffer, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function exportPeers(format: ExportFormat) {
  const data = await fetchAllPeers();
  const mapped = data.map(p => ({
    'RustDesk ID': p.rustdesk_id,
    'Alias': p.alias || '',
    'Hostname': p.hostname || '',
    'OS': p.os || '',
    'IP Público': p.ip_public || '',
    'IP Local': p.ip_local || '',
    'Status': p.status,
    'Primeira Conexão': p.first_seen,
    'Última Conexão': p.last_seen,
    'Tempo Online (s)': p.total_online_seconds,
  }));

  const filename = `rustpanel_peers_${new Date().toISOString().split('T')[0]}`;
  if (format === 'csv') exportCSV(mapped, filename);
  else exportXLSX(mapped, filename);
}

export async function exportSessions(format: ExportFormat) {
  const data = await fetchAllSessions();
  const mapped = data.map(s => ({
    'RustDesk ID': s.rustdesk_id,
    'Conectado em': s.connected_at,
    'Desconectado em': s.disconnected_at || '',
    'Duração (s)': s.duration_seconds || '',
    'IP Público': s.ip_public || '',
    'IP Local': s.ip_local || '',
    'Ativo': s.is_active ? 'Sim' : 'Não',
  }));

  const filename = `rustpanel_sessions_${new Date().toISOString().split('T')[0]}`;
  if (format === 'csv') exportCSV(mapped, filename);
  else exportXLSX(mapped, filename);
}

export async function exportBans(format: ExportFormat) {
  const data = await fetchAllBans();
  const mapped = data.map(b => ({
    'RustDesk ID': b.rustdesk_id,
    'Motivo': b.reason,
    'Observações': b.notes || '',
    'Data Ban': b.banned_at,
    'Data Unban': b.unbanned_at || '',
    'Ativo': b.is_active ? 'Sim' : 'Não',
  }));

  const filename = `rustpanel_bans_${new Date().toISOString().split('T')[0]}`;
  if (format === 'csv') exportCSV(mapped, filename);
  else exportXLSX(mapped, filename);
}

export async function exportAuditLogs(format: ExportFormat) {
  const data = await fetchAllAuditLogs();
  const mapped = data.map(l => ({
    'Ação': l.action,
    'Entidade': l.entity_type || '',
    'IP': l.ip_address || '',
    'Data': l.created_at,
    'Metadados': JSON.stringify(l.metadata),
  }));

  const filename = `rustpanel_audit_${new Date().toISOString().split('T')[0]}`;
  if (format === 'csv') exportCSV(mapped, filename);
  else exportXLSX(mapped, filename);
}
