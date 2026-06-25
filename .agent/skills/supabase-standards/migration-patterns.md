# Migration Patterns

## Template Usage

Always refer to `supabase/migrations/_TEMPLATE_migration.sql` when starting a new migration.

### Key Components of a Migration:

1. **Table Structure**: Standard `CREATE TABLE`.
2. **RLS**: Mandatory `ENABLE ROW LEVEL SECURITY`.
3. **Policies**: Granular access control using `auth.uid()` or role-check functions.
4. **Explicit GRANTs**: Mandatory block for `anon`, `authenticated`, and `service_role`.
5. **Indexes**: Crucial for performance (FKs and common filters).
6. **Sequence Grants**: If using `SERIAL`, remember to grant usage on the sequence.

```sql
-- Sequence Grant Pattern
GRANT USAGE, SELECT ON SEQUENCE public.my_table_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.my_table_id_seq TO service_role;
```
