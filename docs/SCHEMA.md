# RustPanel — Database Schema

Banco: **Supabase PostgreSQL**

## Estrutura de Tabelas

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  profiles   │     │    peers    │     │  sessions   │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ id (PK)     │     │ id (PK)     │     │ id (PK)     │
│ email       │     │ rustdesk_id │◄────│ peer_id (FK)│
│ full_name   │     │ alias       │     │ rustdesk_id │
│ role (ENUM) │     │ hostname    │     │ ip_public   │
│ avatar_url  │     │ os          │     │ relay_uuid  │
│ created_at  │     │ ip_public   │     │ is_active   │
│ updated_at  │     │ status(ENUM)│     │ duration    │
└──────┬──────┘     │ last_seen   │     │ connected_at│
       │            │ first_seen  │     │ disconnected │
       │            │ info (JSONB)│     └─────────────┘
       ▼            │ created_at  │
┌─────────────┐     │ updated_at  │
│    bans     │     └──────┬──────┘
├─────────────┤            │
│ id (PK)     │            ▼
│ peer_id(FK) │◄─── ┌─────────────┐     ┌─────────────┐
│ rustdesk_id │     │ audit_logs  │     │ agent_state │
│ banned_by   │     ├─────────────┤     ├─────────────┤
│ reason      │     │ id (PK)     │     │ key (PK)    │
│ is_active   │     │ user_id(FK) │     │ value(JSONB)│
│ banned_at   │     │ action      │     │ updated_at  │
│ unbanned_at │     │ entity_type │     └─────────────┘
└─────────────┘     │ metadata    │
                    └─────────────┘
```

## Tabelas

### `profiles`

Estende `auth.users` com dados da aplicação. Criado automaticamente via trigger `on_auth_user_created`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Referência a `auth.users.id` |
| `email` | TEXT | Email do usuário |
| `full_name` | TEXT | Nome completo |
| `role` | `user_role` | `super_admin`, `admin`, `operator` |
| `avatar_url` | TEXT | URL do avatar |
| `created_at` | TIMESTAMPTZ | Data de criação |
| `updated_at` | TIMESTAMPTZ | Atualizado automaticamente |

### `peers`

Dispositivos detectados pelo agente RustPanel. É a tabela central.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | ID interno |
| `rustdesk_id` | TEXT UNIQUE | ID do RustDesk (9 dígitos) |
| `alias` | TEXT | Apelido customizado |
| `hostname` | TEXT | Hostname da máquina |
| `os` | TEXT | Sistema operacional |
| `ip_public` | TEXT | IP público registrado |
| `ip_local` | TEXT | IP local |
| `info` | JSONB | Metadados (versão, etc) |
| `status` | `peer_status` | `online`, `offline`, `banned` |
| `first_seen` | TIMESTAMPTZ | Primeira detecção |
| `last_seen` | TIMESTAMPTZ | Última atividade (heartbeat) |
| `total_online_seconds` | BIGINT | Tempo total online |

**Índices**: `rustdesk_id`, `status`, `last_seen DESC`, `alias`

### `sessions`

Histórico de sessões de relay. Criado pelo agente quando detecta `relay_paired`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | ID da sessão |
| `peer_id` | UUID FK → peers.id | Peer conectado |
| `rustdesk_id` | TEXT | RustDesk ID (denormalizado) |
| `ip_public` | TEXT | IP público usado |
| `relay_uuid` | TEXT | UUID do relay |
| `is_active` | BOOLEAN | Sessão ativa? |
| `connected_at` | TIMESTAMPTZ | Início da conexão |
| `disconnected_at` | TIMESTAMPTZ | Fim da conexão |
| `duration_seconds` | INTEGER | Duração calculada |

**Índices**: `peer_id`, `is_active`, `connected_at DESC`, `rustdesk_id`

### `bans`

Registro de bans/unbans. Atualizado pelo frontend (admin).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | ID do ban |
| `peer_id` | UUID FK → peers.id | Peer banido |
| `rustdesk_id` | TEXT | RustDesk ID (denormalizado) |
| `banned_by` | UUID FK → profiles.id | Quem baniu |
| `reason` | TEXT | Motivo do ban |
| `is_active` | BOOLEAN | Ban ativo? |
| `banned_at` | TIMESTAMPTZ | Data do ban |
| `unbanned_at` | TIMESTAMPTZ | Data do unban |
| `unbanned_by` | UUID FK → profiles.id | Quem desbaniu |

**Índices**: `peer_id`, `is_active`, `rustdesk_id`

### `audit_logs`

Log de auditoria de ações administrativas. Preenchido automaticamente via triggers.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | ID do log |
| `user_id` | UUID FK → profiles.id | Usuário que executou |
| `action` | TEXT | Ação (`ban_peer`, `unban_peer`, etc) |
| `entity_type` | TEXT | Tipo da entidade (`peer`, etc) |
| `entity_id` | UUID | ID da entidade |
| `metadata` | JSONB | Dados adicionais |
| `ip_address` | TEXT | IP do usuário |
| `created_at` | TIMESTAMPTZ | Data da ação |

### `agent_state`

Key-value store para estado interno do agente. Usado para persistir IP Map, status, etc.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `key` | TEXT PK | Chave única |
| `value` | JSONB | Valor (objeto JSON) |
| `updated_at` | TIMESTAMPTZ | Última atualização |

**Chaves usadas atualmente**:

| Key | Valor | Atualização |
|-----|-------|-------------|
| `agent_status` | `{ status, started_at, version, ip_map_size, known_peers, active_relays, last_heartbeat }` | A cada 2 min |
| `agent_last_shutdown` | `{ timestamp }` | No shutdown |
| `ip_map` | `{ "<ip>": "<rustdesk_id>", ... }` | A cada 5 min + shutdown |

## ENUMs

```sql
user_role:   'super_admin' | 'admin' | 'operator'
peer_status: 'online' | 'offline' | 'banned'
```

## RLS (Row-Level Security)

| Tabela | SELECT | INSERT | UPDATE |
|--------|--------|--------|--------|
| `profiles` | Authenticated | — | Self + super_admin |
| `peers` | Authenticated | Service role + admin | Admin + Service role |
| `sessions` | Authenticated | Service role | Service role |
| `bans` | Authenticated | Admin | Admin |
| `audit_logs` | Authenticated | Service role + authenticated | — |
| `agent_state` | Service role + authenticated (read) | Service role | Service role |

## Realtime

As tabelas `peers`, `sessions` e `bans` estão habilitadas para Supabase Realtime (subscription via WebSocket).

## Views

### `dashboard_stats`

Fornece estatísticas agregadas para o dashboard:

| Campo | Descrição |
|-------|-----------|
| `total_peers` | Total de peers registrados |
| `peers_online` | Peers com status `online` |
| `peers_offline` | Peers com status `offline` |
| `peers_banned` | Peers com status `banned` |
| `sessions_today` | Sessões iniciadas hoje |
| `avg_session_duration` | Duração média das sessões (7 dias) |
| `last_activity` | Timestamp da última atividade |

## Migrations

| Arquivo | Descrição |
|---------|-----------|
| `001_initial_schema.sql` | Schema inicial completo (todas as tabelas, índices, triggers, RLS, views) |
| `002_cleanup_and_diagnostics.sql` | Limpeza e diagnóstico |
| `003_diagnostico.sql` | Queries de diagnóstico |
| `004_reset_all.sql` | Reset completo (⚠️ destrutivo) |
| `005_rollback.sql` | Remove schema com segurança (DROP em ordem reversa) |