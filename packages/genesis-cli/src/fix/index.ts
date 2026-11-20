/**
 * `genesis fix`: the fix engine (types.ts), its registry (registry.ts, builtin.ts) and the engine
 * that plans and applies (engine.ts).
 */
export type * from "./types.js";
export { manualFixId } from "./types.js";
export { applyPlan, attachFixes, canonicalJson, FileConflictError, fileHash, FixError, fixRef, planFix, planHash, plannedFile, sha256, StalePlanError, toPlan, verifyFix, type ApplyOptions, type ApplyResult } from "./engine.js";
export { allFixes, builtinFixes, defineFix, loadFixes, type BuiltinDeps, type LoadedFixes } from "./registry.js";
