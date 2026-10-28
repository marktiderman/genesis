---
"@marktiderman/genesis-studio-server": minor
---

New `@marktiderman/genesis-studio-server/auth` entry: the token checks (`jwtAuth`, `jwtVerifier`, `supabaseAuth`, `supabaseVerifier`, `bearerToken`) and the identity switch (`switchToUser`, `IdentitySwitchError`, `DEFAULT_SWITCH_ROLES`), with no database connection, handler or browser client. It ships as ESM and CommonJS (`import` and `require` conditions, `.d.cts` types, `typesVersions` for TypeScript's `node` resolution), so a server that builds to CommonJS, such as NestJS, can use it instead of copying the code. The CommonJS build loads `jose` (ESM-only) with Node's `require(esm)`, unflagged from Node 20.19 and 22.12, so the package's `engines` is now `^20.19.0 || >=22.12.0` (was `>=20`; Node 20 reached end of life in April 2026). The package root is unchanged and still exports the same names.
