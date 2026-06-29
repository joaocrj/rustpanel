# 📊 Estado Atual das Implementações

> **Versão:** 3.0 (Agent v3)  
> **Data:** 2026-06-28  
> **Ambiente:** Produção em `https://rustpanel.joaocrj.com.br` (Docker Swarm + Supabase Cloud)

---

## 🎯 Resumo Executivo

| Módulo | Versão | Status | Cobertura Testes | Deploy Produção |
|--------|--------|--------|------------------|-----------------|
| **Frontend** | 1.0.0 | ✅ Completo | — | ✅ `ghcr.io/joaocrj/rustpanel-frontend:latest` |
| **Agent (Node.js)** | 3.0.0 | ✅ Completo | 82 unit tests (parsers) | ✅ `ghcr.io/joaocrj/rustpanel-agent:latest` |
| **Supabase Schema** | 001 | ✅ Aplicado | — | ✅ Migração 001 executada |
| **Docker Swarm Stack** | — | ✅ Produção | — | ✅ `deploy/stack.yml` |
| **CI/CD Scripts** | — | ✅ Funcional | — | ✅ Bash + PowerShell |

---

## ✅ Frontend (React + Vite + TypeScript + shadcn/ui)

### Páginas Implementadas

| Página | Arquivo | Funcionalidades | Status |
|--------|---------|-----------------|--------|
| **Login** | `LoginPage.tsx` | Email/password, show/hide password, loading, error handling, animações Framer Motion | ✅ Completo |
| **Dashboard** | `DashboardPage.tsx` | Stats cards (online/offline/banned/sessions), Agent status banner, Top 5 peers recentes, Active sessions grid, Real-time updates | ✅ Completo |
| **Peers** | `PeersPage.tsx` | Tabela paginada (25/page), busca global (ID/alias/hostname/IP), filtro status, ordenação, edição alias inline, ban direto, export CSV/XLSX | ✅ Completo |
| **Sessões** | `SessionsPage.tsx` | Grid cards sessões ativas (IP público/local, uptime, connected_at), real-time duration counter (10s), export CSV/XLSX | ✅ Completo |
| **Banimentos** | `BansPage.tsx` | Tabela com toggle histórico/ativos, motivo/notas, desbanir com confirmação, export CSV/XLSX | ✅ Completo |
| **Auditoria** | `AuditPage.tsx` | Tabela paginada (50/page), filtro por action (login, ban, unban, update, export), badges coloridos por ação, export CSV/XLSX | ✅ Completo |
| **Configurações** | `SettingsPage.tsx` | Perfil (nome, email read-only, role badge), save profile, system info | ✅ Completo |
### Componentes UI (shadcn/ui based)

| Componente | Localização | Uso |
|------------|-------------|-----|
| `Button`, `Input`, `Select`, `Table` | `components/ui/` | Base |
| `Modal`, `ConfirmDialog` | `components/ui/Modal.tsx` | Edit alias, Ban, Unban |
| `StatusBadge` | `components/ui/StatusBadge.tsx` | Online/Offline/Banned badges |
| `StatCard` | `components/ui/StatCard.tsx` | Dashboard stats |
| `Header`, `AppLayout`, `Sidebar` | `components/layout/` | Layout principal |
| `DataTable` (custom) | Inline nas pages | Sortable, paginated, searchable |

### Hooks & Estado

| Hook | Arquivo | Responsabilidade |
|------|---------|------------------|
| `useAuth` | `contexts/AuthContext.tsx` | Supabase Auth + profile + roles |
| `useDashboardStats` | `hooks/useData.ts` | View `dashboard_stats` + fallback |
| `usePeers` | `hooks/useData.ts` | Peers com search/filter/sort/pagination |
| `useActiveSessions` | `hooks/useData.ts` | Sessions `is_active=true` |
| `useBans` | `hooks/useData.ts` | Bans ativos/histórico |
| `useAuditLogs` | `hooks/useData.ts` | Audit logs paginados + filtro |
| `useRealtimeSubscription` | `hooks/useRealtime.ts` | Invalida React Query cache no Postgres changes |

### Autenticação & Autorização

- ✅ **Supabase Auth** (email/password)
- ✅ **3 Roles:** `super_admin`, `admin`, `operator` (enum `user_role`)
- ✅ **Auto-profile creation** on signup (trigger `handle_new_user`)
- ✅ **First user = super_admin** automático
- ✅ **RLS policies** por role (ver schema)
- ✅ **Route guards:** `ProtectedRoute` + `PublicRoute` + `hasRole()`

### Real-time

- ✅ **Canais:** `peers`, `sessions`, `bans` (configurados no schema SQL)
- ✅ **Auto-invalidate** React Query cache on changes
- ✅ **Sem polling** — usa Supabase Realtime (WebSocket)

---

## ✅ Agent (Node.js + TypeScript) — v3

### Arquitetura v3 (Mudanças do v2)

| Mudança | Descrição |
|---------|-----------|
| **Sem peer_ip table** | SQLite não tem mais `peer_ip` — IP Map via logs HBBS + Supabase |
| **Docker log backfix** | Usa `dockerode` + `demuxStream()` correto (multi-frame chunks) |
| **SQLite sync simplificado** | Só registra peers (hostname/os/info) — NÃO atualiza `last_seen` |
| **Multi-peer NAT heuristic** | Usa Supabase (`getActivePeerIdsOnIp` + `getMostRecentPeerFromIds`) |

### Módulos Principais

| Módulo | Arquivo | Linhas | Testes | Status |
|--------|---------|--------|--------|--------|
| **Entry Point** | `src/index.ts` | ~530 | — | ✅ Completo |
| **Config** | `src/config.ts` | 36 | — | ✅ Completo |
| **Logger** | `src/utils/logger.ts` | 43 | — | ✅ Completo |
| **Docker Logs Reader** | `src/readers/docker-logs.ts` | 179 | — | ✅ Completo |
| **SQLite Reader** | `src/readers/sqlite-reader.ts` | 105 | — | ✅ Completo |
| **Supabase Service** | `src/services/supabase.ts` | ~420 | — | ✅ Completo |
| **HBBS Parser** | `src/parsers/hbbs-parser.ts` | ~240 | 40 tests | ✅ Completo |
| **HBBR Parser** | `src/parsers/hbbr-parser.ts` | ~210 | 42 tests | ✅ Completo |

### Funcionalidades Core

| Feature | Implementação | Status |
|---------|---------------|--------|
| **Startup & Config** | Env vars validadas, Docker socket connect, Supabase service_role | ✅ |
| **IP Map Restore** | `agent_state.ip_map` persistido (sobrevive restart) | ✅ |
| **SQLite Peer Sync** | `syncPeersFromSqlite()` 60s interval, read-only, preserva heartbeat | ✅ |
| **HBBS Log Backfill** | Últimas 24h / 10k linhas → `update_pk` → IP Map | ✅ |
| **Supabase IP Map Sync** | `peers.ip_public` → IP Map | ✅ |
| **HBBS Streaming** | `docker-logs.ts` + `parseHbbsLine()` → 8 padrões de log | ✅ |
| **HBBR Streaming** | `docker-logs.ts` + `parseHbbrLine()` → 4 estágios relay | ✅ |
| **IP Correlation** | 3 fontes (memória → SQLite → Supabase) + heuristic NAT | ✅ |
| **Session Lifecycle** | `relay_request` → `relay_paired` → `relay_active` → `relay_closed` | ✅ |
| **Heartbeat** | 30s interval, grace 10min (config), mark offline peers | ✅ |
| **Ban Monitoring** | 30s poll (TODO: migrar para Realtime) | ⚠️ Polling |
| **IP Map Persistence** | Shutdown (SIGINT/SIGTERM) + **TODO: periodic 60s** | ⚠️ Parcial |
| **Diagnostics** | 2min interval → `agent_state.agent_status` | ✅ |

### Parsers — Padrões Suportados

**HBBS (40 testes):**
- `update_pk ID [::ffff:IP]:PORT` (OSS principal)
- `IP change of ID from ... to [::ffff:IP]:PORT`
- `Registering client: ID=X, IP=Y` (legacy)
- `update_addr: ID, addr: [::ffff:IP]:PORT`
- `ID from [::ffff:IP]:PORT` (handle_udp)
- `punch_hole request from ID1 to ID2`
- `Tcp connection from [::ffff:IP]:PORT`
- `register_pk: [::ffff:IP]:PORT` (IP only)

**HBBR (42 testes):**
- `New relay request UUID from [::ffff:IP]:PORT`
- `Relayrequest UUID from [::ffff:IP]:PORT got paired`
- `Both are raw` (stateful: usa último UUID pareado)
- `Relay of [::ffff:IP]:PORT closed`
- `Relay closed from IP`

### Supabase Service (Agent)

| Método | Descrição |
|--------|-----------|
| `registerPeerFromSqlite()` | Upsert peer (hostname/os/info) — **NÃO** toca last_seen/status |
| `upsertPeer()` | Peer ativo (HBBS log) — seta `last_seen=now()`, `status=online`, `ip_public` |
| `updatePeerLastSeen()` | Atualiza só `last_seen` (heartbeat/activity) |
| `updatePeerStatus()` | Muda `status` (online/offline/banned) |
| `createSession()` | Cria sessão `pending` (relay_request) |
| `pairSession()` | Atualiza para `active` + `rustdesk_id` (relay_paired) |
| `activateSession()` | Confirma `relay_active` |
| `closeSessionByUuid()` | Encerra por UUID (relay_closed) |
| `closeSessionByIp()` | Fallback encerra por IP |
| `markOfflinePeers()` | Heartbeat: `last_seen < now - grace` → `status=offline` |
| `getActivePeerIdsOnIp()` | Heurística NAT: peers ativos no mesmo IP |
| `getMostRecentPeerFromIds()` | Heurística NAT: peer com `last_seen` mais recente |
| `getState()` / `setState()` | Key-value `agent_state` (ip_map, agent_status) |
| `getActiveBans()` | Cache de banned IDs para bloqueio |
---

## ✅ UDP Capture (Rust + pnet)

### Funcionalidades

| Feature | Status | Detalhes |
|---------|--------|----------|
| **Packet Capture** | ✅ | `pnet::datalink` + interface configurável (`any` = todas) |
| **Protocol Parsing** | ✅ | Texto (`update_pk ID [IP]:PORT`) + Binário (msg_type 0x01/0x02) |
| **IPv4/IPv6** | ✅ | `::ffff:IPv4` mapped + IPv6 nativo |
| **Batched Upsert** | ✅ | Buffer em memória → dedup por `rustdesk_id` → HTTP POST Supabase |
| **Config via Env** | ✅ | `config` crate: interface, port, batch_size, batch_timeout, Supabase creds |
| **Prometheus Metrics** | ✅ | `/metrics` em `:9090` (packets, parsed, buffer, rate) |
| **Graceful Shutdown** | ✅ | Ctrl+C / SIGTERM → flush buffer → exit |
| **Docker Multi-stage** | ✅ | Build: `rust:1.82` → Runtime: `debian:bookworm-slim` |

### Parser (`parser.rs`)

| Função | Cobertura |
|--------|-----------|
| `parse_packet()` | Entry point: tenta texto → binário |
| `parse_text_packet()` | `update_pk <ID> [IP]:PORT` (IPv4 mapped + IPv6) |
| `parse_binary_packet()` | Msg type 0x01 (update_pk), 0x02 (punch_hole) — scan ID nos bytes |
| `parse_ip_port()` | `[::ffff:1.2.3.4]:21116` ou `[2001:db8::1]:21116` |
| `is_valid_rustdesk_id()` | 6-12 dígitos numéricos |
| `extract_rustdesk_id_from_bytes()` | Scan payload por número 6-12 dígitos |

### Supabase Batcher (`supabase.rs`)

| Feature | Implementação |
---

## ✅ Supabase (PostgreSQL + Auth + Realtime)

### Schema (Migração 001)

| Tabela | Colunas Principais | Índices | RLS |
|--------|-------------------|---------|-----|
| `profiles` | `id` (FK auth.users), `email`, `full_name`, `role`, `avatar_url` | PK `id` | Select own, Update super_admin |
| `peers` | `id` UUID, `rustdesk_id` UNIQUE, `alias`, `hostname`, `os`, `ip_public`, `ip_local`, `info` JSONB, `status` enum, `first_seen`, `last_seen`, `total_online_seconds` | PK, UNIQUE rustdesk_id, idx status, last_seen, alias | Select all auth, Insert/Update service_role + admin |
| `sessions` | `id`, `peer_id` FK, `rustdesk_id`, `ip_public`, `ip_local`, `relay_uuid`, `connected_at`, `disconnected_at`, `duration_seconds`, `is_active` | PK, FK peer_id, idx rustdesk_id, connected_at, is_active | Select all auth, Write service_role |
| `bans` | `id`, `peer_id` FK, `rustdesk_id`, `banned_by` FK profiles, `reason`, `notes`, `is_active`, `banned_at`, `unbanned_at`, `unbanned_by` | PK, FKs, idx rustdesk_id, is_active | Select all auth, Write admin |
| `audit_logs` | `id`, `user_id` FK profiles, `action`, `entity_type`, `entity_id`, `metadata` JSONB, `ip_address` | PK, FK user_id, idx created_at, action, entity_type | Select all auth, Write service_role + auth |
| `agent_state` | `key` PK, `value` JSONB, `updated_at` | PK | All service_role, Select auth |

### Realtime Publicação

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE peers;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE bans;
```

### View: `dashboard_stats`

```sql
-- Agrega: total_peers, peers_online, peers_offline, peers_banned,
-- sessions_today, avg_session_duration (7d), last_activity
```

### Rollback (Migração 005)

- `DROP VIEW dashboard_stats`
- `DROP TABLE` em ordem reversa (FKs)
- `DROP TYPE user_role, peer_status`
---

## ✅ Deploy & Infraestrutura

### Docker Swarm Stack (`deploy/stack.yml`)

| Serviço | Imagem | Rede | Volumes | Constraints | Resources |
|---------|--------|------|---------|-------------|-----------|
| `frontend` | `ghcr.io/joaocrj/rustpanel-frontend:latest` | `JoaoCRJNET` | — | — | 64M/0.25 CPU |
| `agent` | `ghcr.io/joaocrj/rustpanel-agent:latest` | `rustdesk_net` | `/var/run/docker.sock:ro`, `rustdesk_hbbs:/root:ro` | `node.role == manager` | 128M/0.5 CPU |
| `udp-capture` | `ghcr.io/joaocrj/rustpanel-udp-capture:latest` | `host` (network_mode) | — | `node.role == manager` | 128M/0.5 CPU |

**Redes Externas:** `JoaoCRJNET` (frontend+Traefik), `rustdesk_net` (agent+RustDesk)  
**Volumes Externos:** `rustdesk_hbbs` (SQLite read-only)  
**Traefik Labels:** TLS Let's Encrypt, rate limiting (100 req/s avg, burst 50), security headers

### Stack Local (`deploy/stack-local.yml`)

- Mesma estrutura, imagens `rustpanel-frontend:local` / `rustpanel-agent:local`
- Sem `udp-capture` (precisa host network + CAP_NET_RAW)

### Scripts

| Script | Plataforma | Features |
|--------|------------|----------|
| `build-and-push.sh` | Bash (Linux/macOS/CI) | Multi-arch, `--no-push`, seletivo (frontend/agent/udp-capture/all), carrega `.env` |
| `build-and-push.ps1` | PowerShell (Windows) | `docker buildx` linux/amd64, hardcoded creds dev, push GHCR |
| `deploy-vps.sh` | Bash (VPS) | Git pull + build local agent/udp-capture + `docker service update --force` |

---

## 🧪 Testes

| Suite | Comando | Testes | Status |
|-------|---------|--------|--------|
| HBBS Parser | `npx tsx src/parsers/__tests__/hbbs-parser.test.ts` | 40 | ✅ Pass |
| HBBR Parser | `npx tsx src/parsers/__tests__/hbbr-parser.test.ts` | 42 | ✅ Pass |
| UDP Capture | `cargo test` (em `rustpanel-udp-capture/`) | 6 | ✅ Pass |
| Integração Agent+Supabase | — | 0 | ❌ Falta |
| Integração Frontend+Supabase | — | 0 | ❌ Falta |
| E2E Docker Stack | — | 0 | ❌ Falta |

---

## 📦 Versões & Dependências Principais

| Componente | Versão | Lockfile |
|------------|--------|----------|
| Node.js | 20.x | `package-lock.json` (frontend + agent) |
| React | 18.x | `frontend/package.json` |
| Vite | 5.x | `frontend/package.json` |
| TypeScript | 5.x | `tsconfig.json` |
| Supabase JS | 2.x | `@supabase/supabase-js` |
| TanStack Query | 5.x | `@tanstack/react-query` |
| React Router | 6.x | `react-router-dom` |
| shadcn/ui | Latest | `components/ui/` |
| Framer Motion | 11.x | `framer-motion` |
| Lucide React | Latest | `lucide-react` |
| Dockerode | 4.x | `agent/package.json` |
| Better-SQLite3 | 9.x | `agent/package.json` |
| Pino (logger) | Custom | `agent/src/utils/logger.ts` |
| Dockerode | 4.x | `agent/package.json` |
| Better-SQLite3 | 9.x | `agent/package.json` |
| Pino (logger) | Custom | `agent/src/utils/logger.ts` |

---

## 🚧 Gaps Conhecidos (Próximos Passos)

| Prioridade | Item | Esforço | Blocker |
|------------|------|---------|---------|
| 🔴 | Salvar `ip_map` periódico (60s) no agent | Baixo | — |
| 🔴 | Deploy UDP Capture em produção | Médio | VPS network interface + CAP_NET_RAW |
| 🟡 | Migrar ban monitoring para Realtime (remover polling 30s) | Baixo | — |
| 🟡 | Métricas Prometheus no Agent (`prom-client`) | Médio | — |
| 🟡 | Runbook failover manager (promote worker) | Baixo | Doc only |
| 🟢 | Export assíncrona via Edge Function | Alto | Supabase Edge Functions |
| 🟢 | Testes integração (testcontainers + MSW) | Alto | Infra test |
| 🟢 | PWA / Service Worker no Frontend | Médio | `vite-plugin-pwa` |

---

## 📈 Métricas de Saúde (Produção)

| Métrica | Target | Atual | Fonte |
|---------|--------|-------|-------|
| Agent uptime | > 99.9% | — | `agent_state.agent_status` |
| Log processing latency | < 5s | — | `lineCounters` + timestamps |
| IP Map coverage | > 95% peers | — | `ip_map_size` / `known_peers` |
| Session correlation rate | > 90% | — | `relay_paired` vs sessions created |
| Frontend Realtime latency | < 2s | — | Supabase Realtime SLA |
| Supabase API errors | < 0.1% | — | Supabase Dashboard |

> **Nota:** Métricas atuais não coletadas automaticamente — implementar Prometheus no Agent (item 🟡 acima).
- `DROP EXTENSION uuid-ossp`
|---------|---------------|
| **Buffer** | `Arc<Mutex<Vec<PeerUpdate>>>` thread-safe |
| **Dedup** | HashMap por `rustdesk_id` mantém `last_seen` mais recente |
| **Flush Triggers** | Buffer ≥ `batch_size` (default 50) OU timeout `batch_timeout_ms` (default 5000) |
| **Retry** | Falha → recoloca no buffer → retry no próximo flush |
| **Endpoint** | `POST /rest/v1/peers?on_conflict=rustdesk_id` (upsert) |
| **Headers** | `apikey`, `Authorization: Bearer service_role`, `Prefer: resolution=merge-duplicates` |