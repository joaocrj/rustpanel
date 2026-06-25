-- =============================================================
-- Fix: Clear corrupted IP map in agent_state
-- The IP map persisted from previous agent runs may contain
-- stale/corrupted IP-to-PeerID mappings causing wrong session
-- correlations (e.g., session attributed to wrong peer).
--
-- After running this, the agent will rebuild the IP map from:
--   1. SQLite peer_ip table
--   2. HBBS Docker logs (backfill)
--   3. Supabase peers table
--   4. Real-time HBBS events
-- =============================================================

-- Clear the stale IP map so the agent rebuilds it
UPDATE agent_state
SET
  value = '{}',
  updated_at = now()
WHERE key = 'ip_map';

-- Verify
SELECT key, updated_at FROM agent_state WHERE key = 'ip_map';