---
"@marktiderman/genesis-ai": minor
---

`evaluate` takes scorers (`{ scorers: [{ name, score(case, result) => { pass, score?, note? } }] }`) and reports every score (`report.scores`); a case passes when its `check`, now optional, and every scorer pass. A case can carry `expected` for scorers to compare against. The target can be a task or any `{ id, version, run(args, ctx) }`, so agents and tool trajectories evaluate the same way once they exist. `EvalReport` gains `scores` (empty without scorers). Two type changes: `EvalReport.scores` is always present, and `EvalCase.check` is optional (code that calls `c.check(...)` directly checks it first).
