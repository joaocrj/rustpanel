-- =============================================================
-- RustPanel - Migration 008: Fix Session Correlation
-- =============================================================
-- Problemas sendo corrigidos:
--   1. Peers sintéticos criados como fallback (IP-xxx_xxx_xxx_xxx)
--      quando o agente não consegue correlacionar IP→ID.
--      Esses peers poluem a tabela e mostram IDs falsos.
--   2. IP map persistido pode conter mapeamentos stale que
--      causam correlação incorreta de sessões.
--   3. Sessões ativas podem estar associadas a peers sintéticos.
--
-- Ações:
--   A. Fechar sessões ativas associadas a peers sintéticos
--   B. Remover peers sintéticos (rustdesk_id LIKE 'IP-%')
--   C. Limpar IP map stale no agent_state
--   D. Adicionar CHECK constraint para evitar IDs sintéticos
-- =============================================================

BEGIN;

-- -------------------------------------------------------
-- A. Fechar sessões ativas associadas a peers sintéticos
--    Marca is_active=false e disconnected_at=now()
-- -------------------------------------------------------
UPDATE sessions
SET
  is_active = false,
  disconnected_at = now(),
  duration_seconds = EXTRACT(EPOCH FROM (now() - connected_at))::INTEGER
WHERE is_active = true
  AND rustdesk_id LIKE 'IP-%';

-- Log o que foi fechado para auditoria
DO $$
DECLARE
  closed_count INTEGER;
BEGIN
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RAISE NOTICE 'Closed % active sessions associated with synthetic peers (IP-*)', closed_count;
END $$;

-- -------------------------------------------------------
-- B. Remover bans associados a peers sintéticos
-- -------------------------------------------------------
DELETE FROM bans
WHERE rustdesk_id LIKE 'IP-%';

-- -------------------------------------------------------
-- C. Remover peers sintéticos
-- -------------------------------------------------------
DELETE FROM peers
WHERE rustdesk_id LIKE 'IP-%';

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % synthetic peers (IP-*)', deleted_count;
END $$;

-- -------------------------------------------------------
-- D. Limpar IP map stale no agent_state para forçar rebuild
--    (o agente vai reconstruir a partir do SQLite + HBBS logs)
-- -------------------------------------------------------
UPDATE agent_state
SET
  value = '{}',
  updated_at = now()
WHERE key = 'ip_map';

-- -------------------------------------------------------
-- E. Adicionar CHECK constraint para evitar IDs sintéticos
--    no futuro. O rustdesk_id deve ser numérico (RustDesk ID)
--    ou null (quando não correlacionado).
--    NOTA: só adiciona se a constraint não existir ainda
-- -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_peers_rustdesk_id_no_synthetic'
    AND conrelid = 'peers'::regclass
  ) THEN
    -- Remove qualquer peer sintético restante que possa ter escapado
    -- (ex: criado entre o DELETE acima e a criação da constraint)
    DELETE FROM peers WHERE rustdesk_id ~ '^IP-\d+_\d+_\d+_\d+$';

    -- Adiciona constraint: rustdesk_id deve ser NULL ou numérico (6-12 dígitos)
    -- ou seguir o formato do RustDesk (apenas dígitos)
    ALTER TABLE peers
    ADD CONSTRAINT ck_peers_rustdesk_id_no_synthetic
    CHECK (
      rustdesk_id IS NULL
      OR rustdesk_id ~ '^\d{6,12}$'
      OR rustdesk_id ~ '^[a-fA-F0-9-]{36}$'  -- UUID format (fallback)
    );
  END IF;
END $$;

-- -------------------------------------------------------
-- F. Verificar estado final
-- -------------------------------------------------------
SELECT
  'peers' AS tabela,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE rustdesk_id LIKE 'IP-%') AS sinteticos
FROM peers
UNION ALL
SELECT
  'sessions',
  COUNT(*),
  COUNT(*) FILTER (WHERE rustdesk_id LIKE 'IP-%')
FROM sessions
UNION ALL
SELECT
  'bans',
  COUNT(*),
  COUNT(*) FILTER (WHERE rustdesk_id LIKE 'IP-%')
FROM bans;

COMMIT;