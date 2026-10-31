---
"@marktiderman/genesis-ui": patch
---

The chart (`ChartTooltipContent`, `ChartLegendContent`) type-checks against Recharts 3 as well as 2, as its peer range (`^2.12.0 || ^3.0.0`) already said. Its props are written out rather than taken from Recharts' own types, which changed in 3. `ChartPayloadItem` and `ChartTooltipContentProps` are exported, and Genesis now develops against Recharts 3.
