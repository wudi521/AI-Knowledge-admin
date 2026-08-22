# vben-admin-monorepo — Claude Memory
> Last analyzed: 2026-08-22 (updated)
> Re-analysis needed: NO — read .claude/rules/ files instead of source files

## What this project is
# 严肃声明：现在、未来都不会有商业版本，所有代码全部开源  **「我喜欢写代码，乐此不疲」**  

## Quick reference
- **Stack**: JavaScript + Vue.js + Tailwind CSS + Vitest + Playwright + Vite + Turborepo + ESLint
- **Dev**: `turbo-run dev`
- **Test**: `N/A`
- **Build**: `cross-env NODE_OPTIONS=--max-old-space-size=8192 turbo build`

## Memory files (read these, not source files)
- @.claude/rules/architecture.md — folder map, entry points, data flow
- @.claude/rules/stack.md — tech stack, versions, all commands
- @.claude/rules/modules.md — every module and what it does
- @.claude/rules/models.md — DB schemas and data types
- @.claude/rules/api.md — all routes and endpoints
- @.claude/rules/conventions.md — naming, patterns, testing approach
- @.claude/rules/gotchas.md — quirks, workarounds, do-not-touch
- @.claude/rules/changelog.md — what changed and when

## Instruction
You have full codebase knowledge from the files above.
Do NOT re-read source files to understand structure — use memory files.
If something seems outdated, flag it rather than re-analyzing.
