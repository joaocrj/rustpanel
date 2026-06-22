-- =============================================================
-- RustPanel - Supabase Migration 001: Initial Schema
-- =============================================================
-- Run this in Supabase SQL Editor or as a migration

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- ENUM TYPES
-- =============================================================

CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'operator');
CREATE TYPE peer_status AS ENUM ('online', 'offline', 'banned');

-- =============================================================
-- TABLE: profiles
-- Extends Supabase auth.users with application-specific data
-- =============================================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'operator',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        CASE
            WHEN NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN 'super_admin'::public.user_role
            ELSE 'operator'::public.user_role
        END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================
-- TABLE: peers
-- Devices detected by the rustpanel-agent
-- =============================================================

CREATE TABLE IF NOT EXISTS peers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rustdesk_id TEXT NOT NULL UNIQUE,
    alias TEXT,
    hostname TEXT,
    os TEXT,
    ip_public TEXT,
    ip_local TEXT,
    info JSONB DEFAULT '{}',
    status peer_status NOT NULL DEFAULT 'offline',
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_online_seconds BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_peers_rustdesk_id ON peers(rustdesk_id);
CREATE INDEX idx_peers_status ON peers(status);
CREATE INDEX idx_peers_last_seen ON peers(last_seen DESC);
CREATE INDEX idx_peers_alias ON peers(alias) WHERE alias IS NOT NULL;

-- =============================================================
-- TABLE: sessions
-- Connection history built by the agent
-- =============================================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    peer_id UUID NOT NULL REFERENCES peers(id) ON DELETE CASCADE,
    rustdesk_id TEXT NOT NULL,
    ip_public TEXT,
    ip_local TEXT,
    relay_uuid TEXT,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    disconnected_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_peer_id ON sessions(peer_id);
CREATE INDEX idx_sessions_is_active ON sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_sessions_connected_at ON sessions(connected_at DESC);
CREATE INDEX idx_sessions_rustdesk_id ON sessions(rustdesk_id);

-- =============================================================
-- TABLE: bans
-- Ban/unban history
-- =============================================================

CREATE TABLE IF NOT EXISTS bans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    peer_id UUID NOT NULL REFERENCES peers(id) ON DELETE CASCADE,
    rustdesk_id TEXT NOT NULL,
    banned_by UUID REFERENCES profiles(id),
    reason TEXT NOT NULL DEFAULT 'Não especificado',
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unbanned_at TIMESTAMPTZ,
    unbanned_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bans_peer_id ON bans(peer_id);
CREATE INDEX idx_bans_is_active ON bans(is_active) WHERE is_active = true;
CREATE INDEX idx_bans_rustdesk_id ON bans(rustdesk_id);

-- =============================================================
-- TABLE: audit_logs
-- Administrative action log
-- =============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- =============================================================
-- TABLE: agent_state
-- Key-value store for agent internal state
-- =============================================================

CREATE TABLE IF NOT EXISTS agent_state (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- TRIGGERS: updated_at auto-update
-- =============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_peers_updated_at
    BEFORE UPDATE ON peers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- TRIGGERS: Audit log on ban/unban
-- =============================================================

CREATE OR REPLACE FUNCTION audit_ban_action()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
        VALUES (
            NEW.banned_by,
            'ban_peer',
            'peer',
            NEW.peer_id,
            jsonb_build_object(
                'rustdesk_id', NEW.rustdesk_id,
                'reason', NEW.reason,
                'ban_id', NEW.id
            )
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
        VALUES (
            NEW.unbanned_by,
            'unban_peer',
            'peer',
            NEW.peer_id,
            jsonb_build_object(
                'rustdesk_id', NEW.rustdesk_id,
                'ban_id', NEW.id
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_ban_change
    AFTER INSERT OR UPDATE ON bans
    FOR EACH ROW EXECUTE FUNCTION audit_ban_action();

-- =============================================================
-- RLS (Row Level Security)
-- =============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE peers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_state ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS public.user_role AS $$
    SELECT role FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- PROFILES: Users can read all profiles, only super_admin can update roles
CREATE POLICY "profiles_select" ON profiles
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "profiles_update_self" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND (
            role = (SELECT role FROM profiles WHERE id = auth.uid())
            OR get_user_role(auth.uid()) = 'super_admin'
        )
    );

CREATE POLICY "profiles_update_admin" ON profiles
    FOR UPDATE TO authenticated
    USING (get_user_role(auth.uid()) = 'super_admin')
    WITH CHECK (get_user_role(auth.uid()) = 'super_admin');

-- PEERS: All authenticated can read, super_admin/admin can update
CREATE POLICY "peers_select" ON peers
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "peers_insert" ON peers
    FOR INSERT TO service_role
    WITH CHECK (true);

CREATE POLICY "peers_update" ON peers
    FOR UPDATE TO authenticated
    USING (get_user_role(auth.uid()) IN ('super_admin', 'admin'));

CREATE POLICY "peers_update_agent" ON peers
    FOR UPDATE TO service_role
    USING (true);

CREATE POLICY "peers_insert_agent" ON peers
    FOR INSERT TO authenticated
    WITH CHECK (get_user_role(auth.uid()) IN ('super_admin', 'admin'));

-- SESSIONS: All can read, only agent (service_role) can write
CREATE POLICY "sessions_select" ON sessions
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "sessions_insert" ON sessions
    FOR INSERT TO service_role
    WITH CHECK (true);

CREATE POLICY "sessions_update" ON sessions
    FOR UPDATE TO service_role
    USING (true);

-- BANS: All can read, super_admin/admin can manage
CREATE POLICY "bans_select" ON bans
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "bans_insert" ON bans
    FOR INSERT TO authenticated
    WITH CHECK (get_user_role(auth.uid()) IN ('super_admin', 'admin'));

CREATE POLICY "bans_update" ON bans
    FOR UPDATE TO authenticated
    USING (get_user_role(auth.uid()) IN ('super_admin', 'admin'));

-- AUDIT_LOGS: All authenticated can read, only system can write
CREATE POLICY "audit_logs_select" ON audit_logs
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "audit_logs_insert" ON audit_logs
    FOR INSERT TO service_role
    WITH CHECK (true);

CREATE POLICY "audit_logs_insert_auth" ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- AGENT_STATE: Only service_role can access
CREATE POLICY "agent_state_all" ON agent_state
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================
-- REALTIME: Enable realtime for key tables
-- =============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE peers;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE bans;

-- =============================================================
-- VIEWS: Dashboard statistics
-- =============================================================

CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM peers) AS total_peers,
    (SELECT COUNT(*) FROM peers WHERE status = 'online') AS peers_online,
    (SELECT COUNT(*) FROM peers WHERE status = 'offline') AS peers_offline,
    (SELECT COUNT(*) FROM peers WHERE status = 'banned') AS peers_banned,
    (SELECT COUNT(*) FROM sessions WHERE connected_at >= CURRENT_DATE) AS sessions_today,
    (SELECT COALESCE(AVG(duration_seconds), 0)::INTEGER FROM sessions WHERE duration_seconds IS NOT NULL AND connected_at >= CURRENT_DATE - INTERVAL '7 days') AS avg_session_duration,
    (SELECT MAX(last_seen) FROM peers) AS last_activity;
