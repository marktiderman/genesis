// @marktiderman/genesis-studio-server/auth — the identity half on its own: verify a token, then
// switch a transaction to the signed-in user. For an app's own API (NestJS, Express, a socket
// server) that doesn't use the studio handler. Ships as ESM and CommonJS, so a server that
// builds to CommonJS can `require` it. Nothing here opens a database connection.

export {
  jwtAuth,
  jwtVerifier,
  supabaseAuth,
  supabaseVerifier,
  bearerToken,
  type StudioAuth,
  type StudioClaims,
  type StudioTokenVerifier,
  type JwtAuthOptions,
  type SupabaseAuthOptions,
} from "./auth";
export {
  switchToUser,
  IdentitySwitchError,
  DEFAULT_SWITCH_ROLES,
  type SwitchOptions,
  type TaggedQuery,
} from "./switch";
export type { Identity } from "./db";
