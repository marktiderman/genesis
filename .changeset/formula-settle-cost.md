---
"@marktiderman/genesis-forms": patch
---

Calculated fields stay fast when an answer a formula reads keeps changing. Each list or table column is read once per answer (kept by the answer's array) and its numbers are added up once, so a step that changes the tax rate no longer walks an unchanged 10,000-row table again. New `MAX_SETTLE_ITEMS` (50,000): the list items and table rows all of a form's formulas read together, each answer and column counted once in form order; an answer past it reads as blank, as one over `MAX_FORMULA_ITEMS` does. A number written with letters (`1e6`, `2x`) now says "Write a number in digits only".
