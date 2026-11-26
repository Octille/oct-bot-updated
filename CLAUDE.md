# OctBot 3.0

## Project status

- Done: phases 1–6 (6b: role panels, misc commands, `/settings` dashboard; music panel redesign; welcome, autorole, tickets, invite filter and the prefix notice were removed before launch: no privileged intents).
- Phase 7: **7a done** (migration + on-demand import; dry run on a local copy matches 445/64/23), **7b done** (`/eco`, legacy reaction roles, prefix notice), **7c done** (Docker, staging on the Google Cloud VM). **7d**: pre-cutover code built (PLAN.md §5); the cutover itself follows docs/DEPLOY.md "Going live" with the owner. Later: Phase 8 (Premium), Phase 9 (Growth).
- Key docs: `PLAN.md` (architecture, phase checklist §5, migration §6, Veteran set §9, Premium §10, Growth §12), `BALANCE.md` (economy numbers), `scripts/income-report.ts` and `scripts/balance-report.ts` (economy checks).

## Working style

- Keep reports short: what changed, what to test (max 8 bullets), open questions. No big tables unless asked.
- While working, run only the related tests; run the full suite once before pushing.
- Self-review money, exploit and migration risks; ask before spawning a reviewer subagent (it costs too many tokens).
- Read only the section of `PLAN.md` / `BALANCE.md` you need, not the whole file.
- Batch small fixes into one pass.
