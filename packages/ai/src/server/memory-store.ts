import type { AiStore, AiVendor, BeginInput, FinishInput } from "../types";

export interface MemoryStoreOptions {
  /** USD per tenant (or per person, without a tenant) for the life of the store. Default: none. */
  budgetUsd?: number | undefined;
  /** Who has agreed to which vendor, or `"all"`. Default: nobody. */
  consents?: "all" | Iterable<readonly [personId: string, vendor: AiVendor]> | undefined;
  /** Calls one tenant may have open at once. Default: no limit. */
  concurrencyPerTenant?: number | undefined;
}

export type UsageRow = Omit<BeginInput, "model"> & FinishInput & { id: string; requestedModel: string };

export interface MemoryStore extends AiStore {
  /** Finished calls, in order. `model` is the one that answered; `requestedModel` the task's. */
  readonly rows: ReadonlyArray<UsageRow>;
  grant(personId: string, vendor: AiVendor): void;
  revoke(personId: string, vendor: AiVendor): void;
  spentUsd(tenantOrPerson: string): number;
}

/**
 * An {@link AiStore} in memory, for tests and local work. It admits a call while spend plus the
 * estimates of calls still open stays within the budget, the same bounded overshoot as the
 * database store.
 */
export function memoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  const consents = new Set<string>();
  const all = options.consents === "all";
  if (options.consents && options.consents !== "all") for (const [p, v] of options.consents) consents.add(`${p}\u0000${v}`);
  const open = new Map<string, BeginInput>();
  const spent = new Map<string, number>();
  const rows: UsageRow[] = [];
  let seq = 0;
  const keyOf = (input: { tenantId: string | null; personId: string }) => input.tenantId ?? `person:${input.personId}`;

  return {
    rows,
    grant: (p, v) => void consents.add(`${p}\u0000${v}`),
    revoke: (p, v) => void consents.delete(`${p}\u0000${v}`),
    spentUsd: (key) => spent.get(key) ?? 0,
    async hasConsent(personId, vendor) {
      return all || consents.has(`${personId}\u0000${vendor}`);
    },
    async begin(input) {
      const key = keyOf(input);
      const mine = [...open.values()].filter((c) => keyOf(c) === key);
      if (!input.budgetExempt) {
        if (options.concurrencyPerTenant !== undefined && mine.length >= options.concurrencyPerTenant) return null;
        if (options.budgetUsd !== undefined) {
          const reserved = mine.filter((c) => !c.budgetExempt).reduce((sum, c) => sum + c.estimateUsd, 0);
          if ((spent.get(key) ?? 0) + reserved + input.estimateUsd > options.budgetUsd) return null;
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
      const key = keyOf(began);
      spent.set(key, (spent.get(key) ?? 0) + input.costUsd);
      const id = `usage_${rows.length + 1}`;
      const { model: requestedModel, ...rest } = began;
      rows.push({ ...rest, ...input, requestedModel, id });
      return id;
    },
  };
}
