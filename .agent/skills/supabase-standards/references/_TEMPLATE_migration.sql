-- =============================================================================
-- Migration Template - Ce Valente Projects
-- =============================================================================
-- USAGE: Copy this file and rename following the convention:
--        YYYYMMDD_short_description.sql (e.g., 20260515_create_orders.sql)
--
-- IMPORTANT: Since May 30, 2026, Supabase no longer grants implicit access to
-- tables in the "public" schema. ALL new tables MUST include explicit GRANTs
-- to be accessible via supabase-js, PostgREST, or GraphQL.
-- =============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.your_table_name (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Add your columns here
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security (MANDATORY)
ALTER TABLE public.your_table_name ENABLE ROW LEVEL SECURITY;

-- 3. Explicit GRANTs (MANDATORY for Data API access)
-- See supabase/SUPABASE_SECURITY.md for the full standard.
--   anon:          SELECT only (unauthenticated users — restricted)
--   authenticated: Full CRUD for logged-in users
--   service_role:  Server-side / admin access (bypasses RLS)
GRANT SELECT ON public.your_table_name TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table_name TO authenticated;
GRANT ALL ON public.your_table_name TO service_role;

-- 4. RLS Policies (MANDATORY - define who can access what)

-- Read: Authenticated users can view their own rows
CREATE POLICY "Users can read own rows"
  ON public.your_table_name
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: Users can create their own rows
CREATE POLICY "Users can insert own rows"
  ON public.your_table_name
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update: Users can modify their own rows
CREATE POLICY "Users can update own rows"
  ON public.your_table_name
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Delete: Users can remove their own rows
CREATE POLICY "Users can delete own rows"
  ON public.your_table_name
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 5. Indexes (add as needed for performance)
CREATE INDEX idx_your_table_name_user_id ON public.your_table_name(user_id);
CREATE INDEX idx_your_table_name_created_at ON public.your_table_name(created_at DESC);

-- =============================================================================
-- SEQUENCE GRANTS (only if table uses serial/bigserial columns)
-- Uncomment if needed:
-- GRANT USAGE, SELECT ON SEQUENCE public.your_table_name_id_seq TO authenticated;
-- GRANT USAGE, SELECT ON SEQUENCE public.your_table_name_id_seq TO service_role;
-- =============================================================================
