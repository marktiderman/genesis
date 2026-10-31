---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-collab": patch
"@marktiderman/genesis-native": patch
"@marktiderman/genesis-notifications": patch
"@marktiderman/genesis-sites": patch
"@marktiderman/genesis-supabase": patch
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-design-system": patch
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis": patch
"@marktiderman/genesis-cli": patch
"@marktiderman/genesis-switchboard": patch
"@marktiderman/genesis-studio": patch
"@marktiderman/genesis-forms-studio": patch
---

Package housekeeping, no code changes. genesis-ui and genesis-design-system ship a README (their
npm pages were empty). chat, collab, native, notifications, sites and supabase ship the MIT
LICENSE. core, design-system, ui, ui-native, the umbrella and genesis-cli export
`./package.json`, so tools can read a package's metadata through `exports`. genesis-switchboard's
repository folder is now `packages/switchboard` (the package name is unchanged). genesis-studio and
genesis-forms-studio no longer call themselves a "workspace", which in Genesis means where the
viewer is working.
