---
"@marktiderman/genesis-studio-server": minor
---

New `@marktiderman/genesis-studio-server/auth` entry: the token checks (`jwtAuth`, `jwtVerifier`, `supabaseAuth`, `supabaseVerifier`, `bearerToken`) and the identity switch (`switchToUser`, `IdentitySwitchError`, `DEFAULT_SWITCH_ROLES`), with no database connection, handler or browser client. It ships as ESM and CommonJS (`import` and `require` conditions, `.d.cts` types, `typesVersions` for TypeScript's `node` resolution), so a server that builds to CommonJS, such as NestJS, can use it instead of copying the code. The CommonJS build loads `jose` with Node's `require(esm)` (Node 20.19+ or 22.12+). The package root is unchanged and still exports the same names.
