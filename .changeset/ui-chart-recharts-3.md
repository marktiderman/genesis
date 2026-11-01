---
"@marktiderman/genesis-ui": minor
---

The chart's `ChartTooltipContent` and `ChartLegendContent` type-check against Recharts 2 and 3 (the peer range stays `^2.12.0 || ^3.0.0`). `<Tooltip>`'s own props on the content keep the types of the installed Recharts, and payload entries take every field either version sets, so code that compiled before still does. New exported types: `ChartPayloadItem`, `ChartTooltipContentProps`.
