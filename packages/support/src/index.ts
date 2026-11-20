/**
 * @marktiderman/genesis-support — support and feedback, in the app's own Supabase.
 *
 * Platform-neutral core: the wire contract, the feedback record with its
 * collector and sink seams, the Supabase support client (reports, replies,
 * screenshots, the idea board), the intake HTTP client, the copy catalog and
 * the block declarations, support threads on genesis-chat (`chat`), and the
 * context dump (`createDiagnostics`, `genesis.diagnostics/1`; `/server` takes it in).
 * Web: `@marktiderman/genesis-support/web` (and `/web-chat` for a report's
 * thread on genesis-chat). Native: `@marktiderman/genesis-support/native`.
 *
 * @stability Beta
 */
export * from "./contract";
export * from "./routes";
export * from "./record";
export * from "./client";
export * from "./chat";
export * from "./intake";
export * from "./copy";
export * from "./block";
export * from "./help-pages";
export * from "./inbox";
export * from "./office-hours";
export * from "./diagnostics";
export * from "./settings";
export type { HelpAnswerResponse, HelpAskState } from "./help-ask";
