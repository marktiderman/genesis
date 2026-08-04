// =====================================================================
// Registry — one declaration of every Resource + its bindings.
//
// The Registry is the ONE place that knows:
//   • every Resource's provider-agnostic contract (field schema + `key`),
//   • the Tier A environment default (one provider for ALL resources),
//   • Tier B resource overrides (one resource → one provider),
//   • Tier C field bindings (one resource's fields → many providers),
//   • the concrete Adapter instance for each provider kind.
//
// The app reads the registry; nothing else knows where data lives. The
// Registry RESOLVES — per resource and per field — which provider serves it,
// applying precedence C > B > A. A Tier-B binding may name a SINGLE provider
// OR an ORDERED LIST of providers that read-time MERGE (union → dedup by key →
// consolidate fields → last-source-wins on a field conflict).
// =====================================================================

import type { Adapter } from "./adapters/adapter";
import { isMergeBinding } from "./types";
import type {
  Binding,
  EnvironmentBinding,
  FieldBinding,
  MergeBinding,
  ProviderKind,
  ResolvedPlan,
  ResourceBinding,
  ResourceContract,
} from "./types";

export class Registry {
  private readonly contracts = new Map<string, ResourceContract>();
  private readonly adapters = new Map<ProviderKind, Adapter>();

  private environment: EnvironmentBinding | null = null; // Tier A
  private readonly resourceBindings = new Map<string, ResourceBinding>(); // Tier B (single)
  private readonly mergeBindings = new Map<string, MergeBinding>(); // Tier B (merge)
  private readonly fieldBindings = new Map<string, FieldBinding>(); // Tier C

  // -- registration ----------------------------------------------------

  /** Declare a Resource's contract (field schema + identity `key`). */
  register(contract: ResourceContract): this {
    this.contracts.set(contract.name, contract);
    return this;
  }

  /** Wire a concrete adapter instance for a provider kind. */
  useAdapter(adapter: Adapter): this {
    this.adapters.set(adapter.kind, adapter);
    return this;
  }

  /**
   * Attach a binding (Tier A/B/C). Overloaded `bind()` is the owner-facing
   * verb from the design ("the registry resolves … which provider serves it").
   */
  bind(binding: Binding): this {
    switch (binding.tier) {
      case "A":
        this.environment = binding;
        break;
      case "B":
        if (isMergeBinding(binding)) {
          this.assertResource(binding.resource, "Tier B merge bind");
          this.assertMergeBinding(binding);
          // A merge and a single-provider binding both override the SAME
          // resource — they're mutually exclusive. Last bind wins; clear the
          // other so resolution is unambiguous.
          this.resourceBindings.delete(binding.resource);
          this.mergeBindings.set(binding.resource, binding);
        } else {
          this.assertResource(binding.resource, "Tier B bind");
          this.mergeBindings.delete(binding.resource);
          this.resourceBindings.set(binding.resource, binding);
        }
        break;
      case "C":
        this.assertResource(binding.resource, "Tier C bind");
        this.fieldBindings.set(binding.resource, binding);
        break;
    }
    return this;
  }

  // -- convenience binders (read nicer at call sites) ------------------

  /** Tier A — set the environment default provider for ALL resources. */
  setEnvironmentDefault(provider: ProviderKind): this {
    return this.bind({ tier: "A", provider });
  }

  /** Tier B — override ONE resource to a single provider. */
  bindResource(resource: string, provider: ProviderKind): this {
    return this.bind({ tier: "B", resource, provider });
  }

  /**
   * Tier B (MERGE) — bind ONE resource to an ORDERED LIST of providers that
   * read-time merge. Field-conflict precedence is LAST-WINS, so the most-
   * authoritative source goes LAST. Writes route to `writeTo` (default: the
   * last source). See {@link MergeBinding} for the full union/dedup/consolidate
   * semantics.
   */
  bindMerge(resource: string, sources: readonly ProviderKind[], writeTo?: ProviderKind): this {
    return this.bind({ tier: "B", merge: true, resource, sources, ...(writeTo ? { writeTo } : {}) });
  }

  /** Tier C — federate ONE resource's fields across providers. */
  bindFields(resource: string, base: ProviderKind, fields: Record<string, ProviderKind>): this {
    return this.bind({ tier: "C", resource, base, fields });
  }

  // -- lookups ---------------------------------------------------------

  getContract(resource: string): ResourceContract {
    const c = this.contracts.get(resource);
    if (!c) throw new Error(`Registry: no contract registered for "${resource}".`);
    return c;
  }

  getAdapter(provider: ProviderKind): Adapter {
    const a = this.adapters.get(provider);
    if (!a) {
      throw new Error(`Registry: no adapter wired for provider "${provider}". Call useAdapter() first.`);
    }
    return a;
  }

  listResources(): string[] {
    return [...this.contracts.keys()];
  }

  // -- RESOLUTION (precedence C > B > A) -------------------------------

  /**
   * Resolve which provider serves a resource's row identity (base) and which
   * specific fields are federated to other providers (Tier C). Precedence:
   *   C (field) > B (resource / merge) > A (environment default).
   * Tier C's `base` provider supplies identity + any unclaimed field; the
   * `fields` map routes named fields elsewhere. A Tier-B MERGE returns the
   * ordered `mergeSources` (the resolver fetches + merges them) and the
   * `writeProvider` write sink; its `base` is the LAST source (conflict winner).
   */
  resolve(resource: string): ResolvedPlan {
    this.assertResource(resource, "resolve");

    const fieldBinding = this.fieldBindings.get(resource);
    if (fieldBinding) {
      return {
        resource,
        base: fieldBinding.base,
        baseTier: "C",
        federated: { ...fieldBinding.fields },
      };
    }

    // Tier B — merge (ordered multi-source) takes the B rung when present.
    const mergeBinding = this.mergeBindings.get(resource);
    if (mergeBinding) {
      const sources = [...mergeBinding.sources];
      // base = last source (the conflict winner); a non-merge-aware caller
      // treats it as "the" provider. writeProvider = explicit writeTo or last.
      const last = sources[sources.length - 1]!;
      return {
        resource,
        base: last,
        baseTier: "B",
        federated: {},
        mergeSources: sources,
        writeProvider: mergeBinding.writeTo ?? last,
      };
    }

    const resourceBinding = this.resourceBindings.get(resource);
    if (resourceBinding) {
      return {
        resource,
        base: resourceBinding.provider,
        baseTier: "B",
        federated: {},
      };
    }

    if (this.environment) {
      return {
        resource,
        base: this.environment.provider,
        baseTier: "A",
        federated: {},
      };
    }

    throw new Error(
      `Registry: cannot resolve "${resource}" — no Tier A/B/C binding applies. ` +
        `Set an environment default (Tier A) or bind the resource (Tier B/C).`,
    );
  }

  private assertResource(resource: string, ctx: string): void {
    if (!this.contracts.has(resource)) {
      throw new Error(`Registry: ${ctx} references unknown resource "${resource}". register() it first.`);
    }
  }

  /** Validate a merge binding's sources + writeTo up front (fail loud at bind). */
  private assertMergeBinding(binding: MergeBinding): void {
    if (binding.sources.length === 0) {
      throw new Error(`Registry: merge bind for "${binding.resource}" needs ≥1 source; got an empty list.`);
    }
    const seen = new Set<ProviderKind>();
    for (const s of binding.sources) {
      if (seen.has(s)) {
        throw new Error(
          `Registry: merge bind for "${binding.resource}" lists provider "${s}" twice; sources must be distinct.`,
        );
      }
      seen.add(s);
    }
    if (binding.writeTo && !seen.has(binding.writeTo)) {
      throw new Error(
        `Registry: merge bind for "${binding.resource}" has writeTo="${binding.writeTo}" not in sources [${binding.sources.join(", ")}].`,
      );
    }
  }
}
