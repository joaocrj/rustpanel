-- =============================================================
-- RustPanel - Script 004: Reset Completo
-- Fecha TODAS as sessões ativas e marca todos peers offline
-- Use quando o dashboard mostrar dados inconsistentes
-- =============================================================

-- 1. Fechar TODAS as sessões ativas (independente de idade)
UPDATE sessions
SET
  is_active = false,
  disconnected_at = now(),
  duration_seconds = EXTRACT(EPOCH FROM (now() - connected_at))::INTEGER
WHERE is_active = true;

-- 2. Marcar todos peers como offline (limpeza completa)
UPDATE peers SET status = 'offline';

-- 3. Verificar resultado
SELECT 
  'Reset completo' AS status,
  (SELECT COUNT(*) FROM sessions WHERE is_active = true) AS sessoes_ativas,
  (SELECT COUNT(*) FROM peers WHERE status = 'online') AS peers_online,
  (SELECT COUNT(*) FROM peers) AS total_peers;