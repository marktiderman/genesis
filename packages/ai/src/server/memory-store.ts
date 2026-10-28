import type { AiStore, AiVendor, BeginInput, FinishInput, VendorKey } from "../types";

export interface MemoryStoreOptions {
  /** USD per tenant (or per person, without a tenant) for the life of the store. Default: none. */
  budgetUsd?: number | undefined;
  /** USD one person may spend of their tenant's budget. Default: no cap. */
  perPersonUsd?: number | undefined;
  /** Who has agreed to which vendor, or `"all"`. Default: nobody. */
  consents?: "all" | Iterable<readonly [personId: string, vendor: AiVendor]> | undefined;
  /** Calls one tenant may have open at once. Default: no limit. */
  concurrencyPerTenant?: number | undefined;
}

export type UsageRow = Omit<BeginInput, "model"> & FinishInput & { id: string; requestedModel: string };

export interface MemoryStore extends AiStore {
  /** Finished calls, in order. `model` is the one that answered; `requestedModel` the task's. */
  readonly rows: ReadonlyArray<UsageRow>;
  grant(personId: string, vendor: AiVendor, policyVersion?: string): void;
  revoke(personId: string, vendor: AiVendor): void;
  /** A tenant's (`tenant:<id>`) or person's (`person:<id>`) own key for a vendor; null removes it. */
  setKey(scope: string, vendor: AiVendor, apiKey: string | null): void;
  spentUsd(tenantOrPerson: string): number;
}

/**
 * An {@link AiStore} in memory, for tests and local work. It admits a call while platform spend
 * plus the estimates of calls still open stays within the budget, the same bounded overshoot as
 * the database store. Calls on a tenant's or person's own key don't spend the budget.
 */
export function memoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  const consents = new Map<string, string | null>();
  const all = options.consents === "all";
  if (options.consents && options.consents !== "all") for (const [p, v] of options.consents) consents.set(`${p}\u0000${v}`, null);
  const keys = new Map<string, string>();
  const open = new Map<string, BeginInput>();
  const spent = new Map<string, number>();
  const rows: UsageRow[] = [];
  let seq = 0;
  const keyOf = (input: { tenantId: string | null; personId: string }) => input.tenantId ?? `person:${input.personId}`;
  const personKey = (input: { tenantId: string | null; personId: string }) => `${keyOf(input)}\u0000${input.personId}`;

  return {
    rows,
    grant: (p, v, version) => void consents.set(`${p}\u0000${v}`, version ?? null),
    revoke: (p, v) => void consents.delete(`${p}\u0000${v}`),
    setKey: (scope, vendor, apiKey) => void (apiKey ? keys.set(`${scope}\u0000${vendor}`, apiKey) : keys.delete(`${scope}\u0000${vendor}`)),
    spentUsd: (key) => spent.get(key) ?? 0,
    async hasConsent(personId, vendor, policyVersion) {
      if (all) return true;
      const k = `${personId}\u0000${vendor}`;
      return consents.has(k) && (policyVersion === undefined || consents.get(k) === policyVersion);
    },
    async keyFor({ tenantId, personId, vendor }): Promise<VendorKey | null> {
      const mine = keys.get(`person:${personId}\u0000${vendor}`);
      if (mine) return { apiKey: mine, source: "person" };
      const theirs = tenantId ? keys.get(`tenant:${tenantId}\u0000${vendor}`) : undefined;
      return theirs ? { apiKey: theirs, source: "tenant" } : null;
    },
    async begin(input) {
      const key = keyOf(input);
      const mine = [...open.values()].filter((c) => keyOf(c) === key && !c.budgetExempt);
      if (!input.budgetExempt) {
        if (options.concurrencyPerTenant !== undefined && mine.length >= options.concurrencyPerTenant) return null;
        if (input.keySource === "platform") {
          const reserved = (calls: BeginInput[]) => calls.filter((c) => c.keySource === "platform").reduce((sum, c) => sum + c.estimateUsd, 0);
          if (options.budgetUsd !== undefined && (spent.get(key) ?? 0) + reserved(mine) + input.estimateUsd > options.budgetUsd) return null;
          if (options.perPersonUsd !== undefined && input.tenantId) {
            const theirs = mine.filter((c) => c.personId === input.personId);
            if ((spent.get(personKey(input)) ?? 0) + reserved(theirs) + input.estimateUsd > options.perPersonUsd) return null;
          }
        }
      }
      const callId = `call_${++seq}`;
      open.set(callId, input);
      return { callId };
    },
    async finish(input) {
      const began = open.get(input.callId);
      if (!began) throw new Error(`memoryStore: no open call ${input.callId}.`);
      open.delete(input.callId);
      if (began.keySource === "platform") {
        spent.set(keyOf(began), (spent.get(keyOf(began)) ?? 0) + input.costUsd);
        spent.set(personKey(began), (spent.get(personKey(began)) ?? 0) + input.costUsd);
      }
      const id = `usage_${rows.length + 1}`;
      const { model: requestedModel, ...rest } = began;
      rows.push({ ...rest, ...input, requestedModel, id });
      return id;
    },
  };
}
