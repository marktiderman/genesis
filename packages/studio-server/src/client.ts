// ---------------------------------------------------------------------------
// The browser half: a Genesis `DataProvider` that talks to the studio
// handler. It holds no database credential — only the signed-in user's
// access token, sent as a bearer header.
//
// Browser-safe on purpose: this entry imports nothing from the server
// modules, so bundling it pulls in neither `postgres` nor `jose`.
// ---------------------------------------------------------------------------

import type {
  BaseRecord,
  CreateParams,
  CreateResult,
  DataProvider,
  DeleteParams,
  DeleteResult,
  HistoryParams,
  BulkResult,
  GetManyParams,
  GetManyResult,
  GetOneParams,
  GetOneResult,
  ListParams,
  ListResult,
  UpdateParams,
  UpdateResult,
} from "@marktiderman/genesis-core/provider";
import {
  DataWriteError,
  type AuditEntry,
  type ProviderCapabilities,
  type ResourceSchema,
  type ResourceSummary,
} from "@marktiderman/genesis-core/schema";
import {
  STUDIO_PROTOCOL_VERSION,
  type CreateResponse,
  type DeleteResponse,
  type DescribeResponse,
  type HistoryResponse,
  type BulkResponse,
  type UndoResponse,
  type ErrorResponse,
  type ListResponse,
  type ReadResponse,
  type ResourcesResponse,
  type StudioRequest,
  type StudioRow,
  type UpdateResponse,
} from "./protocol";

export interface StudioProviderOptions {
  /** Where the handler is mounted, e.g. `/api/studio`. */
  url: string;
  /** The signed-in user's access token, or `null` when nobody is signed in. */
  getAccessToken: () => string | null | Promise<string | null>;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/** A `DataProvider` whose optional schema methods are always present. */
export interface StudioProvider extends DataProvider {
  describe(resource: string): Promise<ResourceSchema>;
  listResources(): Promise<ResourceSummary[]>;
  capabilities(resource?: string): Promise<ProviderCapabilities>;
  history(resource: string, params: HistoryParams): Promise<AuditEntry[]>;
  updateMany: NonNullable<DataProvider["updateMany"]>;
  deleteMany: NonNullable<DataProvider["deleteMany"]>;
  importRows: NonNullable<DataProvider["importRows"]>;
  undo: NonNullable<DataProvider["undo"]>;
}

const CAPABILITIES: ProviderCapabilities = {
  search: true,
  sort: true,
  filterOperators: ["eq", "neq", "gt", "lt", "gte", "lte", "contains", "in", "between", "is_null", "is_not_null"],
  bulkWrites: true,
  versionedWrites: true,
  compositeKeys: true,
  multiSort: true,
  create: true,
  delete: true,
  history: true,
  import: true,
  undo: true,
};

function bulkResult(response: BulkResponse): BulkResult {
  return {
    ok: response.ok,
    count: response.count,
    ...(response.failures ? { failures: response.failures } : {}),
    ...(response.audit ? { audit: response.audit } : {}),
  };
}

const OUTCOME_FROM_WIRE = {
  not_found: "gone",
  bad_request: "invalid",
} as const;

export function createStudioProvider(options: StudioProviderOptions): StudioProvider {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  // Remember each resource's version field so rows can carry their exact
  // version token in it (see `asRecord`).
  const versionFields = new Map<string, string | undefined>();

  async function call<T>(body: StudioRequest): Promise<T> {
    const token = await options.getAccessToken();
    if (!token) throw new DataWriteError("unauthenticated", "Sign in to use the studio.");
    let response: Response;
    try {
      response = await doFetch(options.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ v: STUDIO_PROTOCOL_VERSION, ...body }),
      });
    } catch (error) {
      throw new DataWriteError("error", `The studio server couldn't be reached (${error instanceof Error ? error.message : String(error)}).`);
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const error = (payload as ErrorResponse | null)?.error;
      const wire = error?.outcome ?? "error";
      const outcome = wire in OUTCOME_FROM_WIRE ? OUTCOME_FROM_WIRE[wire as keyof typeof OUTCOME_FROM_WIRE] : wire;
      throw new DataWriteError(
        outcome as Exclude<typeof wire, keyof typeof OUTCOME_FROM_WIRE>,
        error?.message ?? `The studio server answered ${response.status}.`,
        { current: error?.current, currentVersion: error?.currentVersion },
      );
    }
    return payload as T;
  }

  async function versionFieldOf(resource: string): Promise<string | undefined> {
    if (!versionFields.has(resource)) await provider.describe(resource);
    return versionFields.get(resource);
  }

  /**
   * A row as a plain record. The version field holds the exact version
   * token, which is what `expectedVersion` must echo back; for a timestamp
   * that is Postgres's own text, with microseconds a JS Date would drop.
   */
  function asRecord(row: StudioRow, versionField: string | undefined): BaseRecord {
    const record = { ...row.values } as BaseRecord;
    if (versionField) (record as Record<string, unknown>)[versionField] = row.version;
    return record;
  }

  const provider: StudioProvider = {
    async describe(resource) {
      const { schema } = await call<DescribeResponse>({ op: "describe", resource });
      versionFields.set(resource, schema.version?.field);
      return schema;
    },

    async listResources() {
      const { resources } = await call<ResourcesResponse>({ op: "resources" });
      return resources;
    },

    async capabilities() {
      return CAPABILITIES;
    },

    async getList<T extends BaseRecord = BaseRecord>(resource: string, params: ListParams): Promise<ListResult<T>> {
      const versionField = await versionFieldOf(resource);
      const { rows, total } = await call<ListResponse>({
        op: "list",
        resource,
        page: params.pagination?.page,
        perPage: params.pagination?.perPage,
        sort: params.sort,
        ...(params.sorts?.length ? { sorts: params.sorts } : {}),
        search: params.search?.query,
        filters: params.filters,
      });
      return { data: rows.map((r) => asRecord(r, versionField) as T), total };
    },

    async getOne<T extends BaseRecord = BaseRecord>(resource: string, params: GetOneParams): Promise<GetOneResult<T>> {
      const versionField = await versionFieldOf(resource);
      const { row } = await call<ReadResponse>({ op: "read", resource, id: params.id });
      return { data: asRecord(row, versionField) as T };
    },

    async getMany<T extends BaseRecord = BaseRecord>(resource: string, params: GetManyParams): Promise<GetManyResult<T>> {
      const rows = await Promise.all(params.ids.map((id) => provider.getOne<T>(resource, { id })));
      return { data: rows.map((r) => r.data) };
    },

    async update<T extends BaseRecord = BaseRecord>(resource: string, params: UpdateParams<T>): Promise<UpdateResult<T>> {
      const versionField = await versionFieldOf(resource);
      const { row, audit } = await call<UpdateResponse>({
        op: "update",
        resource,
        id: params.id,
        data: params.data as Record<string, unknown>,
        expectedVersion: params.expectedVersion ?? null,
      });
      return { data: asRecord(row, versionField) as T, version: row.version, ...(audit ? { audit } : {}) };
    },

    async create<T extends BaseRecord = BaseRecord>(resource: string, params: CreateParams<T>): Promise<CreateResult<T>> {
      const versionField = await versionFieldOf(resource);
      const { row, audit } = await call<CreateResponse>({
        op: "create",
        resource,
        data: params.data as Record<string, unknown>,
      });
      return { data: asRecord(row, versionField) as T, ...(audit ? { audit } : {}) };
    },

    async deleteOne(resource: string, params: DeleteParams): Promise<DeleteResult> {
      const { audit } = await call<DeleteResponse>({
        op: "delete",
        resource,
        id: params.id,
        expectedVersion: params.expectedVersion ?? null,
      });
      return { data: { id: params.id }, ...(audit ? { audit } : {}) };
    },

    async updateMany(resource, params) {
      return bulkResult(
        await call<BulkResponse>({
          op: "updateMany",
          resource,
          changes: params.changes.map((c) => ({ id: c.id, data: c.data, expectedVersion: c.expectedVersion ?? null })),
        }),
      );
    },

    async deleteMany(resource, params) {
      return bulkResult(
        await call<BulkResponse>({
          op: "deleteMany",
          resource,
          items: params.items.map((i) => ({ id: i.id, expectedVersion: i.expectedVersion ?? null })),
        }),
      );
    },

    async importRows(resource, params) {
      return bulkResult(await call<BulkResponse>({ op: "import", resource, rows: params.rows, dryRun: params.dryRun }));
    },

    async undo(resource, params) {
      const { audit } = await call<UndoResponse>({ op: "undo", resource, auditId: params.auditId });
      return audit ? { audit } : {};
    },

    async history(resource, params) {
      const { entries } = await call<HistoryResponse>({
        op: "history",
        resource,
        id: params.id,
        ...(params.limit ? { limit: params.limit } : {}),
      });
      return entries;
    },
  };
  return provider;
}
