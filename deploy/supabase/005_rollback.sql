-- =============================================================
-- RustPanel - Rollback Migration 005
-- Drop all RustPanel schema objects in dependency order.
-- =============================================================
-- WARNING: This drops ALL RustPanel tables, functions, triggers,
-- policies, enums, and views. Data will be lost.
-- =============================================================

BEGIN;

-- 1. Drop Views first (depend on tables)
DROP VIEW IF EXISTS dashboard_stats CASCADE;

-- 2. Remove tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS peers;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS sessions;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS bans;

-- 3. Drop triggers on auth.users (must drop before functions)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 4. Drop table triggers
--    (These are dropped automatically when tables are dropped,
--     but being explicit is safer)
DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS set_peers_updated_at ON peers;
DROP TRIGGER IF EXISTS on_ban_change ON bans;

-- 5. Drop policies (order matters — policies must be dropped before tables)
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;

DROP POLICY IF EXISTS "peers_select" ON peers;
DROP POLICY IF EXISTS "peers_insert" ON peers;
DROP POLICY IF EXISTS "peers_update" ON peers;
DROP POLICY IF EXISTS "peers_update_agent" ON peers;
DROP POLICY IF EXISTS "peers_insert_agent" ON peers;

DROP POLICY IF EXISTS "sessions_select" ON sessions;
DROP POLICY IF EXISTS "sessions_insert" ON sessions;
DROP POLICY IF EXISTS "sessions_update" ON sessions;

DROP POLICY IF EXISTS "bans_select" ON bans;
DROP POLICY IF EXISTS "bans_insert" ON bans;
DROP POLICY IF EXISTS "bans_update" ON bans;

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_auth" ON audit_logs;

DROP POLICY IF EXISTS "agent_state_all" ON agent_state;
DROP POLICY IF EXISTS "agent_state_select_authenticated" ON agent_state;

-- 6. Drop tables (FK order: children first)
DROP TABLE IF EXISTS bans;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS agent_state;
DROP TABLE IF EXISTS peers;
DROP TABLE IF EXISTS profiles;

-- 7. Drop functions (must drop after triggers that use them)
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS update_updated_at();
DROP FUNCTION IF EXISTS audit_ban_action();
DROP FUNCTION IF EXISTS get_user_role(UUID);

-- 8. Drop ENUM types (must drop after tables that use them)
DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS peer_status;

-- 9. Disable RLS on tables (already dropped, but for state cleanup)
--    (no-op if tables are already dropped)

COMMIT;