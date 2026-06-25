---
name: supabase-standards
description: Project-specific standards for Supabase deployment, security (GRANTs/RLS), and implementation as of May 2026.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Supabase Standards (May 2026)

> **Mandatory patterns for projects created after 2026-05-30 and existing projects hardening.**

## 🎯 Selective Reading Rule

**Read ONLY files relevant to the request!**

| File | Description | When to Read |
|------|-------------|--------------|
| `grants-and-roles.md` | Explicit GRANTs policy for anon/authenticated | Implementing new tables |
| `security-hardening.md` | RLS enforcement, anon restrictions | Auditing or hardening |
| `migration-patterns.md` | Template usage and default privileges | Creating migrations |
| `functions-security.md` | SECURITY DEFINER best practices | Creating RPC/Trigger functions |

---

## ⚠️ Core Mandatory Rules

1. **Explicit GRANTs**: Every table in `public` MUST have explicit GRANTs for `anon`, `authenticated`, and `service_role`.
2. **Hardened Anon**: `anon` role MUST be restricted to `SELECT` only on most tables. Write operations are forbidden.
3. **RLS First**: No table exists without `ENABLE ROW LEVEL SECURITY`.
4. **Migration Consistency**: Use the provided `_TEMPLATE_migration.sql`.

---

## Decision Checklist

Before applying changes to Supabase:

- [ ] Included `GRANT SELECT ON ... TO anon`?
- [ ] Included `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated`?
- [ ] Included `GRANT ALL ON ... TO service_role`?
- [ ] Enabled RLS and defined at least one policy?
- [ ] Restricted `EXECUTE` on SECURITY DEFINER functions to `authenticated`/`service_role`?

---

## Anti-Patterns

❌ Relying on implicit GRANTs (will break after Oct 2026).
❌ Leaving `anon` with `INSERT/UPDATE/DELETE` permissions.
❌ Creating functions as `SECURITY DEFINER` without revoking `public` execute.
❌ Forgetting to grant sequence usage for serial columns.
