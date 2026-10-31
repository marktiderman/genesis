---
"@marktiderman/genesis-design-system": patch
---

`brandRoleVariables` picks muted text that reads: the brand's neutral 500 when it reaches 4.5:1 on the background, else the first darker neutral that does, else the text color. A warm neutral 500 below 4.5:1 no longer becomes `--muted-foreground`. The docs say plainly that dark mode is the Genesis dark theme, since a brand declares no dark colors.
