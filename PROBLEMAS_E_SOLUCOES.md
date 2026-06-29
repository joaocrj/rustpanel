# 🐛 Problemas Conhecidos e Soluções Sugeridas

> Documento vivo — Atualizado em: 2026-06-28  
> Baseado em: `PROJECT_CONTEXT.md`, logs de produção, issues observados

---

## 🔴 Críticos (Impactam Produção)

### 1. Logs do HBBS param de fluir silenciosamente
**Sintoma:** Agent para de receber logs do container `hbbs` — nenhum erro no log do agent, mas `last_seen` dos peers congela.

**Causa Raiz:** Docker log stream (stdout/stderr) perde conexão; o `dockerode` não reconecta automaticamente em todos os casos de falha de rede/container restart.

**Evidência:** `docker-logs.ts` tem lógica de reconnect no evento `end`, mas pode falhar se o container for recriado (novo ID).

**Soluções:**
| Prioridade | Ação |
|------------|------|
| 🔴 Imediata | Adicionar health check no agent: alertar se `lineCounters[hbbs]` não incrementa por > 5 min (já existe detector mas só loga `warn`) |
| 🟡 Curto prazo | Implementar `container.wait()` + re-find container ID no reconnect (atual usa nome fixo) |
| 🟢 Médio prazo | Migrar para **Filebeat/Fluent Bit** sidecar → ship logs para Loki/Elastic → agent consome via API (desacopla do Docker socket) |

---

### 2. IP Map desatualizado após crash do agent
**Sintoma:** Após restart do agent, peers novos não aparecem online até novo `update_pk` (pode demorar horas).

**Causa Raiz:** `ipToPeerId` (Map em memória) só persiste no `agent_state` a cada 5 min + shutdown. Se crash (OOM, SIGKILL), perde últimos 5 min.

**Evidência:** `index.ts` linha 506: `setInterval(updateAgentState, 120_000)` — mas `ip_map` só salvo no shutdown (linha 514) e a cada 5 min (não implementado periodic save do ip_map, só agent_status).

**Soluções:**
| Prioridade | Ação |
|------------|------|
| 🔴 Imediata | Salvar `ip_map` no `agent_state` a cada 60s (adicionar em `updateAgentState` ou intervalo separado) |
| 🟡 Curto prazo | Persistir também no SQLite local (arquivo `/data/ip_map.json` no volume) como backup secundário |
| 🟢 Médio prazo | Implementar **WAL (Write-Ahead Log)** para IP Map: cada `update_pk` → append em arquivo → replay no startup |

---

### 3. Sessões não criadas — "Could not correlate relay \<UUIDwith any peer"
**Sintoma:** Log frequente no agent: HBBR `relay_paired` chega mas IP não está no IP Map → sessão não criada.

**Causa Raiz:** Múltiplas fontes de IP Map (ordem de prioridade no `index.ts:147-152`):
1. `agent_state.ip_map` (persistido)
2. `syncPeersFromSqlite()` — **NÃO TEM peer_ip table** (removido v3)
3. `backfillIpMapFromHbbsLogs()` — últimos 5000 linhas Docker
4. `syncIpMapFromSupabase()` — `peers.ip_public`
5. Tempo real: `update_pk` / `peer_register`

**Gap:** Se peer conectou via UDP (update_pk) mas agent reiniciou antes de persistir, e o peer não fez novo `update_pk` recentemente → IP perdido.

**Soluções:**
| Prioridade | Ação |
|------------|------|
| 🔴 Imediata | Aumentar `backfillIpMapFromHbbsLogs()` para 24h / 50k linhas (atual: 24h / 10k) |
| 🟡 Curto prazo | Melhorar heurística de correlação: usar **múltiplas fontes** (IP Map + `peers.ip_public` + backfill) e **heurística multi-peer NAT** para resolver ambiguidade |
| 🟢 Médio prazo | Ajustar `heartbeat_grace_ms` por peer (adicionar coluna `heartbeat_grace_ms` em `peers`) permitindo controle individual para conexões instáveis |
---



## ⚠️ UDP Capture: Tentativa abandonada
> **❌ NÃO IMPLEMENTADO EM PRODUÇÃO -** Hostinger VPS OpenVZ **sem suporte a CAP_NET_RAW**

### 🔍 O que foi tentado
- Implementação **rustpanel-udp-capture** (Rust + pnet) completa ✅
- Build da imagem Docker ✅
- Deploy em Swarm (`network_mode: host`) ✅
- Testes iniciais OK em localhost/windows ✅

### ❌ Por que falhou
- **Hostinger VPS usa OpenVZ/LXC** com kernel compartilhado privado
- **Módulo af_packet do kernel NÃO disponível**:
  ```bash
  modprobe af_packet
  # ERROR: Module af_packet not found
  ```
- Captura raw sockets (`CAP_NET_RAW`) bloqueada pela virtualização
- Mesmo com `--network host`, AF_PACKET não funciona em contêineres OpenVZ

### 📋 Lições aprendidas
1. **Verificar virtualização do VPS antes**: use `systemd-detect-virt` ou `dmidecode -s system-product-name`
2. **Testar módulos do kernel primeiro**: `lsmod | grep af_packet`
3. **KVM é mandatório** para captura raw (DigitalOcean/Vultr/Hetzner permitem)

### ✅ Solução adotada
- **Fortalecer Agent baseado em logs Docker** com:
  - Backfill HBBS aumentado para **24h / 50k linhas**
  - IP Map persistido **a cada 60s** no `agent_state`
  - Heurística multi-peer NAT via `getMostRecentPeerFromIds`

---
## 🟠 Altos (Degradam Experiência)

### 4. `register_pk` NÃO contém RustDesk ID
**Problema:** Log `register_pk: [::ffff:1.2.3.4]:21116` aparece no HBBS mas **não tem ID**. Parser trata como `tcp_connection` (IP only).

**Impacto:** Não dá para correlacionar esse IP a um peer específico sem outra fonte.

**Mitigação Atual:** UDP Capture captura `update_pk` (que TEM ID) no mesmo fluxo UDP.

**Solução:** Depender do UDP Capture como fonte primária; `register_pk` serve só para detectar "alguém nesse IP".

---

### 5. RLS no Supabase — Frontend limitado, Agent bypass
**Arquitetura Atual:**
- **Agent:** `service_role` key → bypass RLS total (pode INSERT/UPDATE/DELETE em tudo)
- **Frontend:** `anon_key` → limitado por policies RLS

**Risco:** Se `anon_key` vazar, attacker lê tudo (SELECT liberado para `authenticated`). Policies de UPDATE/INSERT restringem a roles.

**Soluções:**
| Prioridade | Ação |
|------------|------|
| 🟡 Curto prazo | Auditar policies: `peers_update` permite `super_admin, admin, service_role` — OK. Mas `peers_insert_agent` permite `authenticated` com role admin — **perigoso se token anon tiver role admin** (impossível pelo trigger, mas revisar) |
| 🟢 Médio prazo | Criar **Edge Function** para ações sensíveis (ban, unban, export) → frontend chama function (server-side) em vez de SQL direto |

---

### 6. Peer status — Frontend NUNCA deve mexer
**Regra Crítica:** Só o agent atualiza `status` e `last_seen` via heartbeat + log events.

** events.

**Violação observada:** Nenhuma no código atual, mas documentar para futuros devs.

**Solução:** Adicionar comment no schema SQL + lint rule proibindo `supabase.from('peers').update({status, last_seen})` no frontend.

---

### 7. Duplicação de peers no upsert
**Código:** `upsertPeer` usa `onConflict: 'rustdesk_id'`. `registerPeerFromSqlite` **NÃO** atualiza `last_seen` (preserva heartbeat).

**Risco:** Se SQLite sync roda enquanto peer está online, `registerPeerFromSqlite` faz upsert sem `last_seen` → mantém valor antigo (OK). Mas se peer offline e SQLite tem info nova (hostname), atualiza hostname mas não `last_seen` (OK).

**Verificar:** Testar cenário race condition: HBBS log `update_pk` (seta last_seen=now) + SQLite sync simultâneo (sem last_seen). Quem ganha? Postgres upsert é atômico — último write wins. Como agent processa logs sequencialmente, OK.

---

### 8. Docker Swarm placement — Agent só no manager
**Constraint:** `node.role == manager` (precisa socket Docker + volume SQLite).

**Risco:** Se manager cai, agent para. Não há HA.

**Soluções:**
| Prioridade | Ação |
|------------|------|
| 🟡 Curto prazo | Documentar runbook: promote worker → manager + `docker service update --force rustpanel_agent` |
| 🟢 Médio prazo | Migrar agent para **sidecar no mesmo node do RustDesk** (não precisa Swarm placement) ou usar **Docker Context** remoto |
---

## 🟡 Médios (Melhorias de Robustez)

### 9. Heartbeat grace period fixo (10 min)
**Atual:** `HEARTBEAT_GRACE_MS=600000` (10 min) hardcoded no agent.

**Problema:** Rede instável → peer flapa online/offline. 10 min pode ser pouco para conexões móveis/4G.

**Solução:** Tornar configurável por peer (coluna `heartbeat_grace_ms` em `peers` com default global) + UI no Settings.

---

### 10. Ban monitoring polling (30s)
**Atual:** `setInterval(checkBans, 30_000)` faz `SELECT rustdesk_id FROM bans WHERE is_active=true`.

**Problema:** Poll desnecessário. Supabase Realtime já notifica changes em `bans`.

**Solução:** Remover polling; usar Realtime channel no agent (já tem client com realtime habilitado) → cache local de banned IDs → invalidar no event.

---

### 11. Falta de métricas Prometheus no Agent
**Atual:** Só logs estruturados. UDP Capture tem `/metrics` (Prometheus).

**Solução:** Adicionar `prom-client` no agent → expor `:9091/metrics` com:
- `rustpanel_agent_ip_map_size`
- `rustpanel_agent_known_peers`
- `rustpanel_agent_active_relays`
- `rustpanel_agent_heartbeat_cycles_total`
- `rustpanel_agent_log_lines_processed_total{container="hbbs|hbbr"}`
- `rustpanel_agent_sessions_created_total`
- `rustpanel_agent_sessions_closed_total`
- `rustpanel_agent_errors_total{type="supabase|docker|parse"}`

---

### 12. Frontend: Sem cache offline / PWA
**Problema:** Se Supabase Realtime desconecta, UI não avisa usuário.

**Solução:** Adicionar `useRealtimeConnectionStatus` hook → banner "Conexão perdida, reconectando..." + Service Worker para cache estático.

---

## 🟢 Baixos (Nice to Have)

### 13. Exportação assíncrona (jobs)
**Atual:** Export CSV/XLSX roda no browser (download direto). Para 10k+ rows, trava UI.

**Solução:** Edge Function `export_job` → gera arquivo no Storage → retorna signed URL → frontend faz download.

---

### 14. Audit log: Faltam detalhes de "antes/depois"
**Atual:** `metadata` JSONB genérico. Não padronizado.

**Solução:** Definir schema `AuditMetadata` por action:
- `ban_peer`: `{reason, notes, previous_status}`
- `update_peer`: `{field, old_value, new_value}`
- `export_data`: `{format, row_count, filters}`

---

### 15. Testes de integração (E2E)
**Atual:** Só unit tests nos parsers (82 testes).

**Falta:** 
- Agent + Supabase (testcontainers)
- Frontend + Supabase mock (MSW)
- Docker stack deploy smoke test

---

## 📋 Checklist de Ações Imediatas (Esta Semana)

| # | Ação | Arquivo/Comando | Responsável |
|---|------|-----------------|-------------|
| 1 | Salvar `ip_map` a cada 60s no `agent_state` | `agent/src/index.ts` → `updateAgentState` | Dev |
| 2 | Aumentar backfill HBBS para 50k linhas | `agent/src/index.ts:268` → `tail: 50000` | Dev |
| 3 | Deploy UDP Capture na VPS (produção) | `./build-and-push.sh udp-capture` + `docker service update` | DevOps |
| 4 | Adicionar métricas Prometheus no Agent | `agent/src/utils/metrics.ts` (novo) | Dev |
| 5 | Documentar runbook de failover manager | `docs/FAILOVER_MANAGER.md` (novo) | DevOps |

---

## 🔗 Referências Cruzadas

| Documento | Seção Relevante |
|-----------|-----------------|
| `PROJECT_CONTEXT.md` | Seção 8: "Problemas conhecidos / Pontos de atenção" |
| `agent/src/index.ts` | Linhas 55-56 (IP Map), 268 (backfill), 506 (diagnostics) |
| `agent/src/services/supabase.ts` | `getActivePeerIdsOnIp`, `getMostRecentPeerFromIds` |
| `deploy/stack.yml` | Service `agent` placement |