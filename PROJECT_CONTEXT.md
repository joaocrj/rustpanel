# RustPanel — Contexto Técnico Compacto

> Resumo para diagnóstico de erros em produção. Última atualização: 2026-06-24.

---

## 1. O que é o RustPanel

Plataforma de monitoramento e gerenciamento de dispositivos **RustDesk OSS**. Stack: **React + Node.js + Supabase + Docker Swarm + Traefik**.

URL produção: `https://rustpanel.joaocrj.com.br`  
Registro Docker: `ghcr.io/joaocrj/rustpanel-frontend` e `ghcr.io/joaocrj/rustpanel-agent`

---

## 2. Estrutura de Diretórios (o que importa)

```
frontend/          # React + Vite + TypeScript + shadcn/ui → servido via Nginx
  src/
    api/supabase.ts       # Conexão com Supabase (client browser)
    components/           # Componentes React
    pages/                # Dashboard, Peers, Sessions, Bans
agent/             # Node.js + TypeScript — agente de monitoramento (roda no VPS)
  src/
    index.ts              # Entry point, orquestração
    config.ts             # Config via env vars (SUPABASE_URL, HBBS_CONTAINER_NAME, etc)
    parsers/
      hbbs-parser.ts      # Parse de logs do HBBS (update_pk, peer_register, etc)
      hbbr-parser.ts      # Parse de logs do HBBR (relay request/paired/closed)
    readers/
      docker-logs.ts      # Stream de logs Docker (dockerode)
      sqlite-reader.ts    # Leitura do SQLite do RustDesk (db_v2.sqlite3)
    services/
      supabase.ts         # Cliente Supabase (service_role) — CRUD peers/sessions/bans
    utils/
      logger.ts           # Logger (pino)
    parsers/__tests__/    # Testes unitários HBBS (40) e HBBR (42)
  Dockerfile              # Multi-stage: build (node:20-alpine) → runtime (node:20-alpine slim)
deploy/
  stack.yml               # Docker Swarm stack (frontend + agent + traefik + redes)
  supabase/
    001_initial_schema.sql
    005_rollback.sql       # Rollback SQL (drop reverso)
```

---

## 3. Como o sistema funciona

### Fluxo de dados:

```
RustDesk (HBBS/HBBR) → logs Docker → agent (Node.js) → Supabase (PostgreSQL)
                                                            ↑
                                              frontend (React) → dashboard/tabelas
```

### Detalhamento do Agent (`agent/src/index.ts`):

1. **Startup**: carrega config, conecta Supabase (service_role), conecta Docker socket (`/var/run/docker.sock`)
2. **Restaura IP Map**: `supabase.loadIpMap()` → restaura mapa IP→PeerID do `agent_state` (sobrevive reinicializações)
3. **Sync inicial**:
   - `syncPeersFromSqlite()` → lê SQLite do RustDesk (`db_v2.sqlite3`), registra peers no Supabase
   - `backfillIpMapFromHbbsLogs()` → lê últimos 5000 logs do HBBS via Docker API, constrói mapa IP→ID
   - `syncIpMapFromSupabase()` → carrega IPs conhecidos da tabela `peers`
4. **Streaming contínuo**:
   - **HBBS logs** → parse `update_pk`, `peer_register`, `tcp_connection` → atualiza `last_seen`, status `online`
   - **HBBR logs** → parse `relay_request`, `relay_paired`, `relay_closed` → cria/encerra sessões (`sessions`)
5. **Heartbeat**: a cada 60s verifica peers com `last_seen < now - graceMs` → marca `offline` (grace = 600s default)
6. **Persistência IP Map**: salva no `agent_state` a cada 5 min + no shutdown (SIGINT/SIGTERM)
7. **Diagnóstico**: a cada 2 min atualiza `agent_status` no `agent_state`

### Variáveis de ambiente do Agent:

| Var | Default | Descrição |
|-----|---------|-----------|
| `SUPABASE_URL` | (obrigatório) | URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | (obrigatório) | Service role key |
| `HBBS_CONTAINER_NAME` | `hbbs` | Nome do container HBBS no Docker |
| `HBBR_CONTAINER_NAME` | `hbbr` | Nome do container HBBR no Docker |
| `SQLITE_DB_PATH` | `/data/db_v2.sqlite3` | Caminho do SQLite dentro do container |
| `PEER_SYNC_INTERVAL_MS` | `60000` | Intervalo de sync SQLite |
| `HEARTBEAT_TIMEOUT_MS` | `300000` | Timeout para marcar offline (5 min) |
| `HEARTBEAT_GRACE_MS` | `600000` | Grace period antes de marcar offline (10 min) |
| `LOG_LEVEL` | `info` | Nível de log (debug/info/warn/error) |

---

## 4. Schema Supabase (resumo)

| Tabela | Propósito | Colunas-chave |
|--------|-----------|---------------|
| `peers` | Dispositivos detectados | `rustdesk_id` (UNIQUE), `status` (online/offline/banned), `last_seen`, `ip_public`, `hostname`, `os` |
| `sessions` | Conexões relay | `peer_id` FK→peers, `relay_uuid`, `is_active`, `connected_at`, `disconnected_at`, `duration_seconds` |
| `bans` | Banimentos | `peer_id` FK→peers, `is_active`, `banned_at`, `unbanned_at` |
| `audit_logs` | Auditoria | `user_id`, `action`, `entity_type`, `metadata` JSONB |
| `profiles` | Usuários (extends auth.users) | `role` (super_admin/admin/operator) |
| `agent_state` | KV store do agente | `key` (PK), `value` JSONB, `updated_at` |
| `dashboard_stats` | VIEW agregada | `total_peers`, `peers_online`, `peers_offline`, `sessions_today` |

**Chaves do `agent_state` usadas**: `agent_status`, `agent_last_shutdown`, `ip_map`

---

## 5. Parsers (HBBS e HBBR)

### HBBS Parser (`agent/src/parsers/hbbs-parser.ts`)

Eventos detectados (em ordem de prioridade):

| Regex | Tipo | Extrai |
|-------|------|--------|
| `update_pk <ID> [::ffff:<IP>]:<PORT>` | `peer_register` | ID, IP, port |
| `IP change of <ID> from ... to <IP>:<PORT>` | `peer_register` | ID, IP (novo), port |
| `Registering client: ID=<ID>, IP=<IP>` | `peer_register` | ID, IP |
| `update_addr: <ID>, addr: <IP>:<PORT>` | `peer_register` | ID, IP, port |
| `<ID> from <IP>:<PORT>` (handle_udp) | `peer_register` | ID, IP, port |
| `punch_hole request from <ID>` | `peer_activity` | ID |
| `Tcp connection from [::ffff:<IP>]:<PORT>` | `tcp_connection` | IP, port (sem ID) |
| `register_pk: <IP>:<PORT>` | `tcp_connection` | IP, port (sem ID — server-side não loga ID) |

**Validação**: IDs de 6-12 dígitos numéricos. Filtra portas conhecidas (21115-21119).

### HBBR Parser (`agent/src/parsers/hbbr-parser.ts`)

Eventos (paired verificado ANTES de request para evitar falso positivo):

| Regex | Tipo | Extrai |
|-------|------|--------|
| `Relay request <UUID> from <IP> got paired` | `relay_paired` | UUID, IP |
| `Relay paired: <UUID> from <IP>` | `relay_paired` | UUID, IP |
| `New relay request <UUID> from <IP>:<PORT>` | `relay_request` | UUID, IP, port |
| `Relayrequest <UUID> from <IP>:<PORT>` | `relay_request` | UUID, IP, port |
| `Both are raw` | `relay_active` | (usa último UUID do estado) |
| `Relay of <IP>:<PORT> closed` | `relay_closed` | IP, port |
| `Relay closed from <IP>` | `relay_closed` | IP |

**Estado interno**: `lastPairedUuid`, `lastPairedIp` — usado para correlacionar `Both are raw` com o UUID do relay. Resetado via `resetHbbrParserState()`.

---

## 6. IP Map (correlação IP → RustDesk ID)

**Problema**: Logs do HBBR contêm apenas IPs, não IDs. Para criar sessões, o agente precisa mapear IP → RustDesk ID.

**Fontes do IP Map** (em ordem de prioridade no `index.ts`):
1. `agent_state.ip_map` (persistido, sobrevive reinicializações)
2. `syncPeersFromSqlite()` — tabela `peer_ip` do SQLite do RustDesk
3. `backfillIpMapFromHbbsLogs()` — logs do HBBS (Docker API, últimos 5000)
4. `syncIpMapFromSupabase()` — tabela `peers` no Supabase
5. Em tempo real: eventos HBBS `update_pk` e `peer_register` atualizam o mapa

A cada evento HBBR `relay_paired`, a correlação tenta (em ordem):
1. Mapa em memória (`ipToPeerId.get(ip)`)
2. SQLite (`sqliteReader.lookupPeerIdByIp(ip)`)
3. Supabase (`supabase.getPeerByIp(ip)`)

Se nenhum funcionar, loga `"Could not correlate relay <UUID> with any peer"`.

---

## 7. Docker Compose / Swarm

**Stack** (`deploy/stack.yml`):
- **frontend**: React/Nginx, rede `JoaoCRJNET`, Traefik com rate limiting (100 req/s avg, burst 50), TLS via Let's Encrypt
- **agent**: Node.js, redes `JoaoCRJNET` + `rustdesk_net`, volume `rustdesk_hbbs:/data:ro`, socket Docker read-only
- **Resources agent**: CPU 0.5 limit, 128M RAM limit

**Redes**:
- `JoaoCRJNET` (external) — frontend + Traefik
- `rustdesk_net` (external, name: `rustdesk_net`) — agent + RustDesk containers

---

## 8. Problemas conhecidos / Pontos de atenção

1. **Logs do HBBS podem parar de fluir** — há um heartbeat detector que alerta se >5 min sem linhas. O streaming Docker pode perder conexão e precisar de reconnect.
2. **IP Map pode ficar desatualizado** após reinicialização do agente se o `agent_state.ip_map` não foi salvo antes do crash. O backfill mitiga isso.
3. **Sessões podem não ser criadas** se o IP do relay não está no IP Map — log `"Could not correlate relay"` aparece.
4. **`register_pk` NÃO contém RustDesk ID** — apenas IP. Não espere extrair ID dessas linhas.
5. **RLS no Supabase**: o agente usa `service_role` (bypass RLS). O frontend usa `anon_key` (limitado por RLS). Admins podem ver tudo.
6. **Peer status**: Só o agente atualiza `status` e `last_seen`. O frontend NUNCA deve mexer nisso (quebraria o heartbeat).
7. **Duplicação de peers**: `upsertPeer` usa `onConflict: 'rustdesk_id'`. `registerPeerFromSqlite` NÃO atualiza `last_seen` (preserva heartbeat).
8. **Docker Swarm placement**: agent tem `constraint: node.role == manager` — só roda no manager (precisa acesso ao socket Docker e SQLite).

---

## 9. Comandos úteis

```bash
# Testes
cd agent && npx tsx src/parsers/__tests__/hbbs-parser.test.ts
cd agent && npx tsx src/parsers/__tests__/hbbr-parser.test.ts

# Build & Push
./build-and-push.sh              # Ambos + push
./build-and-push.sh --no-push    # Build local só
./build-and-push.sh agent        # Só agent

# Deploy
cd deploy && docker stack deploy -c stack.yml rustpanel

# Logs do agent em produção
docker service logs rustpanel_agent --tail 100 -f

# Verificar IP Map atual no Supabase
# SQL: SELECT * FROM agent_state WHERE key = 'ip_map';

# Verificar status do agente
# SQL: SELECT * FROM agent_state WHERE key = 'agent_status';