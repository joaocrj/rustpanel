# GRANTs and Roles Standards

## The "New Normal" (Post-May 2026)

Supabase projects no longer grant automatic access to the `public` schema. All tables require explicit permissions.

### Role Definition and Permissions

| Role | Responsibility | Standard Privileges |
|------|----------------|---------------------|
| `anon` | Unauthenticated web traffic | `SELECT` only. |
| `authenticated` | Logged-in application users | `SELECT`, `INSERT`, `UPDATE`, `DELETE`. |
| `service_role` | Administrative/Server tasks | `ALL`. |

### Implementation Example

```sql
-- Always include these at the end of your table creation migration
GRANT SELECT ON public.my_table TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_table TO authenticated;
GRANT ALL ON public.my_table TO service_role;
```

### Why SELECT only for anon?
In this project, we have hardened the security. Even if a table is "publicly readable" via RLS, we want to ensure no anonymous user can ever perform a write operation (INSERT/UPDATE/DELETE) even if an RLS policy is accidentally misconfigured.
