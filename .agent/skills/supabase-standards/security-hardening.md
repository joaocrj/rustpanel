# Security Hardening Patterns

## 1. Row Level Security (RLS)

Every table MUST have RLS enabled. If a table should be completely private, enable RLS and don't create any policies.

```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;
```

## 2. Table Ownership and Default Privileges

To ensure future tables are protected, we use `ALTER DEFAULT PRIVILEGES`.

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
```

## 3. Revoking Write Access from Anon

If a project has legacy tables with excessive permissions, they must be revved:

```sql
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES 
  ON ALL TABLES IN SCHEMA public 
  FROM anon;
```
