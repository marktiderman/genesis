---
"@marktiderman/genesis-ui": patch
---

The chart (`ChartTooltipContent`, `ChartLegendContent`) type-checks against Recharts 3; its peer range stays `^2.12.0 || ^3.0.0`. Genesis no longer type-checks against Recharts 2 in CI, so 2 is supported but not checked. Its props are written out rather than taken from Recharts' own types, which changed in 3. `ChartPayloadItem` and `ChartTooltipContentProps` are exported, from the root entry too. Props Recharts passes that the content doesn't use (`cursor`, `wrapperStyle`, …) are still accepted, so no existing code stops compiling. Genesis now develops against Recharts 3.
