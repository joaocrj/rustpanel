-- =============================================================
-- RustPanel - Migration 006: Fix Dashboard View RLS
-- =============================================================
-- Problem: dashboard_stats view was created without explicit
-- RLS bypass, which means authenticated users (frontend)
-- cannot read it when RLS is enabled on underlying tables.
--
-- Solution: Recreate the view with security_invoker = false
-- so it runs with the owner's privileges (bypassing RLS).
-- Also add a GRANT to ensure authenticated role can select.
-- =============================================================

BEGIN;

-- Drop the old view
DROP VIEW IF EXISTS dashboard_stats;

-- Recreate with security_invoker = false (owner's privileges)
-- This allows authenticated users to read aggregated stats
-- without needing RLS policies on every underlying table.
CREATE OR REPLACE VIEW dashboard_stats
WITH (security_invoker = false) AS
SELECT
    (SELECT COUNT(*) FROM peers) AS total_peers,
    (SELECT COUNT(*) FROM peers WHERE status = 'online') AS peers_online,
    (SELECT COUNT(*) FROM peers WHERE status = 'offline') AS peers_offline,
    (SELECT COUNT(*) FROM peers WHERE status = 'banned') AS peers_banned,
    (SELECT COUNT(*) FROM sessions WHERE connected_at >= CURRENT_DATE) AS sessions_today,
    (SELECT COALESCE(AVG(duration_seconds), 0)::INTEGER FROM sessions WHERE duration_seconds IS NOT NULL AND connected_at >= CURRENT_DATE - INTERVAL '7 days') AS avg_session_duration,
    (SELECT MAX(last_seen) FROM peers) AS last_activity;

-- Grant SELECT to authenticated role
GRANT SELECT ON dashboard_stats TO authenticated;
GRANT SELECT ON dashboard_stats TO anon;
GRANT SELECT ON dashboard_stats TO service_role;

COMMIT;