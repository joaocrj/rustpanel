-- =============================================================
-- RustPanel - Migration 002: Cleanup & Diagnostics
-- =============================================================
-- Run this in Supabase SQL Editor if:
--   - Peers are stuck in 'online' status after agent restart
--   - Sessions remain 'is_active = true' after server restart
--   - You want to verify current data health
--
-- This migration is IDEMPOTENT and safe to run multiple times.
-- =============================================================

-- ------------------------------------------------------------
-- 1. Close any orphaned active sessions (no disconnected_at
--    but older than 2 hours — these are zombie records from
--    agent crashes/restarts)
-- ------------------------------------------------------------
UPDATE sessions
SET
  is_active = false,
  disconnected_at = now(),
  duration_seconds = EXTRACT(EPOCH FROM (now() - connected_at))::INTEGER
WHERE
  is_active = true
  AND connected_at < now() - INTERVAL '2 hours';

-- ------------------------------------------------------------
-- 2. Mark all currently-online peers as offline
--    (force a clean slate — the agent will mark them online
--     again as soon as it reads their next heartbeat)
-- ------------------------------------------------------------
UPDATE peers
SET status = 'offline'
WHERE status = 'online';

-- ------------------------------------------------------------
-- 3. Ensure the dashboard_stats view exists and is correct
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM peers) AS total_peers,
    (SELECT COUNT(*) FROM peers WHERE status = 'online') AS peers_online,
    (SELECT COUNT(*) FROM peers WHERE status = 'offline') AS peers_offline,
    (SELECT COUNT(*) FROM peers WHERE status = 'banned') AS peers_banned,
    (SELECT COUNT(*) FROM sessions WHERE connected_at >= CURRENT_DATE) AS sessions_today,
    (SELECT COALESCE(AVG(duration_seconds), 0)::INTEGER
     FROM sessions
     WHERE duration_seconds IS NOT NULL
       AND connected_at >= CURRENT_DATE - INTERVAL '7 days') AS avg_session_duration,
    (SELECT MAX(last_seen) FROM peers) AS last_activity;

-- ------------------------------------------------------------
-- 4. Diagnostic queries — run these to check data health
-- ------------------------------------------------------------

-- Check current peer statuses
-- SELECT status, COUNT(*) FROM peers GROUP BY status;

-- Check agent state
-- SELECT key, value, updated_at FROM agent_state;

-- Check active sessions
-- SELECT s.id, s.rustdesk_id, s.ip_public, s.connected_at, p.status
-- FROM sessions s
-- JOIN peers p ON p.id = s.peer_id
-- WHERE s.is_active = true;

-- Check recent peers (last 1 hour)
-- SELECT rustdesk_id, status, ip_public, last_seen
-- FROM peers
-- WHERE last_seen > now() - INTERVAL '1 hour'
-- ORDER BY last_seen DESC;

-- ------------------------------------------------------------
-- 5. Grant RLS policy for dashboard_stats view (if not exists)
-- ------------------------------------------------------------
-- The dashboard_stats view inherits from underlying tables,
-- so no explicit RLS is needed on the view itself.
-- Authenticated users can read it because they can read peers/sessions.

-- ------------------------------------------------------------
-- Done!
-- ------------------------------------------------------------
SELECT
  'Cleanup complete' AS result,
  (SELECT COUNT(*) FROM peers WHERE status = 'online') AS online_peers,
  (SELECT COUNT(*) FROM sessions WHERE is_active = true) AS active_sessions,
  (SELECT value FROM agent_state WHERE key = 'agent_status') AS agent_state;
