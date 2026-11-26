# OctBot 3.0

## Project status

- Done: phases 1–5 and 6a (music + moderation).
- Next: **6b**: role panels, autorole, tickets, welcome, misc commands, `/settings` dashboard.
- Then **Phase 7**: v2→v3 migration, `/eco` tools, deploy to Google Cloud, cutover. Later: Phase 8 (Premium), Phase 9 (Growth).
- Key docs: `PLAN.md` (architecture, phase checklist §5, migration §6, Veteran set §9, Premium §10, Growth §12), `BALANCE.md` (economy numbers), `scripts/income-report.ts` and `scripts/balance-report.ts` (economy checks).

## Working style

- Keep reports short: what changed, what to test (max 8 bullets), open questions. No big tables unless asked.
- While working, run only the related tests; run the full suite once before pushing.
- Use the reviewer subagent once per phase, focused on money, exploits and migration.
- Read only the section of `PLAN.md` / `BALANCE.md` you need, not the whole file.
- Batch small fixes into one pass.
