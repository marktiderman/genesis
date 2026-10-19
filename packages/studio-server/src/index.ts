// @marktiderman/genesis-studio-server — the Data Studio's server half.
// The browser half (a DataProvider for this handler) is at `./client`.

export { createStudioHandler, type StudioHandler } from "./handler";
export { byResource, type ResourceRule, type ByResourceOptions } from "./authorize";
export {
  createOutboxWorker,
  backoffDelay,
  PermanentDeliveryError,
  type OutboxWorker,
  type OutboxWorkerOptions,
  type OutboxEntry,
  type DeadLetter,
  type RunSummary,
} from "./outbox";
export {
  jwtAuth,
  supabaseAuth,
  bearerToken,
  type StudioAuth,
  type StudioClaims,
  type JwtAuthOptions,
  type SupabaseAuthOptions,
} from "./auth";
export {
  createPostgresDatabase,
  IdentitySwitchError,
  type StudioDatabase,
  type Identity,
  type Query,
  type SqlRow,
  type PostgresOptions,
} from "./db";
export {
  studioSetupSql,
  AUDIT_FUNCTION,
  OUTBOX_AUDIT_FUNCTION,
  HISTORY_FUNCTION,
  ADD_COMMENT_FUNCTION,
  COMMENTS_FUNCTION,
  type SetupSqlOptions,
} from "./setup-sql";
export type {
  Authorize,
  AuthorizeContext,
  AuthorizeDecision,
  AuditSink,
  ResourceSettings,
  RowActionSettings,
  StudioAction,
  StudioContract,
  StudioHandlerOptions,
} from "./options";
export {
  STUDIO_PROTOCOL_VERSION,
  type StudioRequest,
  type StudioRow,
  type ResourcesResponse,
  type DescribeResponse,
  type ListResponse,
  type ReadResponse,
  type UpdateResponse,
  type CreateResponse,
  type DeleteResponse,
  type HistoryResponse,
  type BulkResponse,
  type UndoResponse,
  type RunActionResponse,
  type CommentsResponse,
  type CommentResponse,
  type ErrorResponse,
} from "./protocol";
