# `@marktiderman/genesis-switchboard`

**The Switchboard — a pluggable, cross-runtime data layer for Genesis.** A resource's _backing_ becomes a
configuration choice, not a code rewrite. Your app calls `data.resource('x').list()` and **never knows where
the data lives** — code fixtures, Airtable/Notion, or Supabase Postgres. Move one resource — or even one
_field_ — between a mock, a human-editable middle layer, and production without touching consumer code.

> Consumed the way you consume the Genesis design system: a versioned `@marktiderman/genesis-*` package. Depth
> lives in **[SWITCHBOARD.md](./SWITCHBOARD.md)** (the full design); this README is the quickstart.

---

## Install

```bash
pnpm add @marktiderman/genesis-switchboard
# @supabase/supabase-js is an OPTIONAL peer — add it only if you build a real Supabase (L3) client:
pnpm add @supabase/supabase-js
```

## Quickstart

```ts
import { Registry, Switchboard, CodeAdapter } from "@marktiderman/genesis-switchboard";

// 1. Register resources + the backing that serves each (see switchboard.config.sample.ts).
const registry = new Registry(/* resource contracts */);

// 2. One client. It routes every read to the right backing.
const data = new Switchboard(registry);

// 3. Read a canonical shape — you don't know (or care) where it lives.
const cycles = await data.resource("tickets").list();
const one    = await data.resource("features").get("F-123");
const sorted = await data.resource("ideas").query({ where: { kind: "idea" }, orderBy: "votes", direction: "desc" });
```

The teaching config — a worked example of wiring L1/L2/L3 adapters and A/B/C tiers — is
[`src/switchboard.config.sample.ts`](./src/switchboard.config.sample.ts).

## The mental model — two independent axes

```text
              TIERS  (at what granularity you choose the backing)
              A Environment        B Resource          C Field/Column
  L1 Code  │  dev → all code      features → code      scratch col ← code
  L2 Mid   │  dev → Airtable      features ← Airtable   curated col ← Airtable   (human-editable)
  L3 Prod  │  prod → Supabase     tickets ← Supa         identity+rows ← Supa
              Resolution precedence:  C  >  B  >  A
```

- **LEVELS** = _how_ a resource is backed (persistence + governance). Cost-of-change rises L1 → L3.
- **TIERS** = _at what granularity_ you pick the backing. Field-level (C) beats resource-level (B) beats the
  environment default (A).
- **The frog-hop — Tier-C field federation:** one row's identity from Supabase, a scratch column live-mocked
  in code, a curated column from Airtable — joined by the resource `key` into one canonical shape.

## What's in the box

| Piece | Job |
| --- | --- |
| **Registry** | the map from resource name → its resolution contract (where it lives). |
| **Adapter interface** | the uniform `list/get/query/create/update/delete` contract every backing implements. |
| **Adapters** | `Code` (L1) · `Airtable` / `Notion` (L2, field-ID maps + 429 retry + stale-while-error) · `Supabase` (L3). |
| **Resolver** | the `Switchboard` + `ResourceClient` — `data.resource(x)` → the right adapter. |
| **Reconciler** | compares a resource across two Levels → a **drift report**; generates the **promote** plan (L2→L3). |
| **Staleness** | serves last-known-good on a failed refresh, flags the read degraded so drift/promote won't trust it. |
| **Introspect** | auto-discovers a resource's fields + infers types, so a new source maps without hand-writing the shape. |

## Access & security contract

- **Access by `user_id`.** `org_id` is metadata only — never an access principal. The L3 Supabase adapter
  reads through the caller's session; RLS scopes rows by `user_id`.
- **Modern Supabase keys only** (publishable/secret). Never a legacy anon/service JWT.
- Networking is an injectable `FetchLike` (defaults to global `fetch`) — no Node-only built-ins, so it runs on
  Node 18+, Deno, and React Native.

## Scripts

```bash
pnpm --filter @marktiderman/genesis-switchboard build       # tsup → ESM + CJS + .d.ts
pnpm --filter @marktiderman/genesis-switchboard test        # vitest (the four proof suites + more)
pnpm --filter @marktiderman/genesis-switchboard typecheck   # tsc --noEmit
```

The mixed-source capability is proven by `mixed-source.test.ts` (Tier-B), `precedence.test.ts` (C>B>A +
Tier-C federation), `adapter-maps.test.ts` (field-ID round-trips, 429 retry, stale-while-error), and
`reconcile.test.ts` (drift + promote). See **[SWITCHBOARD.md](./SWITCHBOARD.md)** for the full design and
build-phase status.
