# Functions Security

## SECURITY DEFINER vs INVOKER

- **SECURITY INVOKER** (Default): Function runs with the permissions of the user who calls it. Safe by default.
- **SECURITY DEFINER**: Function runs with the permissions of the user who created it (usually `postgres` admin). Use ONLY when the function needs to access data that the caller cannot access directly (e.g., checking a user's role in a private metadata table).

## Hardening SECURITY DEFINER

When using `SECURITY DEFINER`, you MUST prevent unauthorized execution:

```sql
-- 1. Create the function
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER -- Runs as admin
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid();
$$;

-- 2. Revoke public execution
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM public;

-- 3. Grant specific execution
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO service_role;
```

## Search Path Security

Always set the `search_path` to an empty string for `SECURITY DEFINER` functions to prevent search path injection attacks.

```sql
ALTER FUNCTION public.my_secure_func() SET search_path = '';
```
