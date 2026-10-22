---
"@marktiderman/genesis-cli": minor
---

Add `genesis doctor`: checks an app against the installed Genesis. Components, exports and
tokens are read from the installed `genesis-ui` declarations and theme CSS (both
`genesis.css` and the Tailwind v4 bridge `genesis-tailwind4.css` by default; `themeCss`
takes one path or a list). It flags local primitive folders, direct Radix and starter-utils
imports, raw tags Genesis has components for, palette, arbitrary and raw colors, undefined
tokens and exports that shadow Genesis, and lists components the app never uses. Apps
configure exceptions and add their own rules in `genesis.config.json` (or package.json
`genesis.doctor`): declarative patterns, a markdown rules document, or plugin modules. Also
ships `@marktiderman/genesis-cli/vite` (fails production builds, shows the dev overlay) and
`@marktiderman/genesis-cli/doctor` (programmatic API and plugin types).
