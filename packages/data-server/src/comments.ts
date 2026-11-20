// ---------------------------------------------------------------------------
// Comments on a record. Stored by the studio's own security definer
// functions (setup SQL), only ever for a row the user can see right now; the
// author is always the session's verified `sub`, never something sent.
// ---------------------------------------------------------------------------

import type { RecordComment } from "@marktiderman/genesis-core/schema";
import type { ResolvedResource } from "./access";
import type { Query, SqlRow } from "./db";
import { storedKey } from "./history";
import { BadRequestError } from "./rows";
import { ADD_COMMENT_FUNCTION, COMMENTS_FUNCTION } from "./setup-sql";
import { WriteRejected } from "./write";

const MAX_BODY = 10_000;

function toComment(row: SqlRow): RecordComment {
  return {
    id: String(row.id),
    author: String(row.author),
    body: String(row.body),
    createdAt: String(row.created_at),
  };
}

export async function readComments(
  query: Query,
  resolved: ResolvedResource,
  key: Record<string, unknown>,
  resourceName: string,
): Promise<RecordComment[]> {
  if (resolved.commentsBlocked) throw new WriteRejected("forbidden", resolved.commentsBlocked);
  const recordKey = await storedKey(query, resolved, key);
  const rows = await query(
    `select id::text as id, author, body, created_at::text as created_at
       from ${COMMENTS_FUNCTION}($1::text, $2::text::jsonb, 500)`,
    [resourceName, recordKey],
  );
  return rows.map(toComment);
}

export async function addComment(
  query: Query,
  resolved: ResolvedResource,
  key: Record<string, unknown>,
  resourceName: string,
  body: unknown,
): Promise<RecordComment> {
  if (resolved.commentsBlocked) throw new WriteRejected("forbidden", `Not posted: ${resolved.commentsBlocked}`);
  if (typeof body !== "string" || body.trim().length === 0) throw new BadRequestError('"body" must be the comment text.');
  if (body.length > MAX_BODY) throw new BadRequestError(`A comment may be at most ${MAX_BODY} characters.`);
  const recordKey = await storedKey(query, resolved, key);
  const [row] = await query(
    `select id::text as id, author, body, created_at::text as created_at
       from ${ADD_COMMENT_FUNCTION}($1::text, $2::text::jsonb, $3::text)`,
    [resourceName, recordKey, body],
  );
  if (!row) throw new WriteRejected("error", "Not posted: the comment wasn't stored.");
  return toComment(row);
}
