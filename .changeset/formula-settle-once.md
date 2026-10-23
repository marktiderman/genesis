---
"@marktiderman/genesis-forms": patch
---

Calculated fields settle in linear time. A settle copies the answers once rather than once per changed field, and formula props and column lists are set up once per calculator. During a replay, back and next skip the formulas when no logic rule reads a calculated field. A list or table now counts once toward `MAX_SETTLE_ITEMS`, however many of its columns a formula reads. Caches belong to each calculator, so each engine and each `validateSubmission` call reads its answers afresh, and `setValue` with the array the engine already holds recomputes.
