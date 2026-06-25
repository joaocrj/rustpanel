---
name: refactoring-patterns
description: Safe refactoring patterns for legacy and evolving codebases, focused on incremental change and behavior preservation.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 1.0.0
---

# Refactoring Patterns

Use this skill when modernizing or cleaning code without changing expected behavior.

## Core Principles
- Behavior first: preserve external behavior before internal cleanup.
- Small steps: refactor in incremental, reversible changes.
- Safety net: prefer adding tests before structural changes when feasible.
- One concern at a time: separate refactor commits from feature changes.

## Practical Workflow
1. Identify code smells and coupling hot spots.
2. Add or confirm coverage around current behavior.
3. Apply one focused refactor step.
4. Re-run validation (lint/types/tests).
5. Repeat until target quality is achieved.

## Common Patterns
- Extract function/class for long blocks.
- Replace conditionals with named guards.
- Introduce parameter objects for long argument lists.
- Move shared logic to cohesive modules.
- Remove dead code only after verifying no active references.

## Guardrails
- Do not mix broad redesign with urgent bugfixes.
- Avoid large-scale renames without tooling support.
- Keep public interfaces stable unless explicitly requested.

## Related Skills
- `clean-code`
- `code-review-checklist`
- `testing-patterns`
