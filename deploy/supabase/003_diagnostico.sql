-- =============================================================
-- RustPanel - Diagnóstico de Estado do Sistema
-- Cole este SQL no Supabase SQL Editor e execute
-- =============================================================

-- 1. Estado atual dos peers
SELECT
  rustdesk_id,
  status,
  ip_public,
  last_seen,
  now() - last_seen::timestamptz AS "tempo_desde_last_seen",
  hostname,
  os
FROM peers
ORDER BY last_seen DESC
LIMIT 30;

-- 2. Estado do agente
SELECT key, value, updated_at FROM agent_state ORDER BY updated_at DESC;

-- 3. Sessões ativas e recentes
SELECT
  s.rustdesk_id,
  s.ip_public,
  s.relay_uuid,
  s.is_active,
  s.connected_at,
  s.disconnected_at,
  s.duration_seconds
FROM sessions s
ORDER BY s.connected_at DESC
LIMIT 20;

-- 4. Contagem por status
SELECT status, COUNT(*) as total FROM peers GROUP BY status;

-- 5. Peers com last_seen recente (última hora)
SELECT COUNT(*) as "peers_vistos_ultima_hora"
FROM peers
WHERE last_seen > now() - INTERVAL '1 hour';
