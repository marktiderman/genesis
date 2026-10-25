/**
 * @marktiderman/genesis-support — support and feedback, in the app's own Supabase.
 *
 * Platform-neutral core: the wire contract, the feedback record with its
 * collector and sink seams, the Supabase support client (reports, replies,
 * screenshots, the idea board), the intake HTTP client, the copy catalog and
 * the block declaration. Web: `@marktiderman/genesis-support/web`. Native:
 * `@marktiderman/genesis-support/native`.
 *
 * @stability Beta
 */
export * from "./contract";
export * from "./record";
export * from "./client";
export * from "./intake";
export * from "./copy";
export * from "./block";
