---
name: react-best-practices
description: Compatibility skill that routes to the canonical React/Next.js performance guidance in `nextjs-react-expert`.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 1.0.0
---

# React Best Practices (Compatibility Alias)

This skill exists to preserve compatibility with agents that declare `react-best-practices`.

## Canonical Source
- Primary skill: `../nextjs-react-expert/SKILL.md`
- Scripts: `../nextjs-react-expert/scripts/`
- Reference docs: `../nextjs-react-expert/*.md`

## Loading Rule
When this skill is requested, load and apply `nextjs-react-expert` as the source of truth.
Do not duplicate or fork rules here.

## Why this file exists
- Keeps existing agents stable without renaming their `skills:` entries.
- Avoids conflicts with current skill content.
- Centralizes performance guidance in one canonical location.
