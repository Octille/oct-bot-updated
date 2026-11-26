# OctBot 3.0

## Project status

- Done: phases 1–6 (6b: role panels, autorole, tickets, welcome, misc commands, `/settings` dashboard; music panel redesign).
- Phase 7: **7a done** (migration + on-demand import; dry run on a local copy matches 445/64/23), **7b done** (`/eco`, legacy reaction roles, prefix notice). Next: **7c** Docker + Google Cloud against a copy, then **7d** cutover with the owner. Later: Phase 8 (Premium), Phase 9 (Growth).
- Key docs: `PLAN.md` (architecture, phase checklist §5, migration §6, Veteran set §9, Premium §10, Growth §12), `BALANCE.md` (economy numbers), `scripts/income-report.ts` and `scripts/balance-report.ts` (economy checks).

## Working style

- Keep reports short: what changed, what to test (max 8 bullets), open questions. No big tables unless asked.
- While working, run only the related tests; run the full suite once before pushing.
- Use the reviewer subagent once per phase, focused on money, exploits and migration.
- Read only the section of `PLAN.md` / `BALANCE.md` you need, not the whole file.
- Batch small fixes into one pass.
