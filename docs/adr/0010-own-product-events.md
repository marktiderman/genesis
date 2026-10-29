# ADR 0010: Genesis owns product events; analytics vendors are sinks

- Status: accepted (the maintainer, 2026-10-29; replaces the plan's G5 recommendation of PostHog as the default sink)
- Date: 2026-10-29
- Features: `product-events`, `product-analytics`, `observability`
- Related: ADR 0001 (one feature gate), ADR 0007 (tenancy)

## Context

Genesis apps report errors, breadcrumbs, timings and typed analytics events through
vendor-neutral sinks (genesis-native's observability: Sentry, EAS Observe, console). No sink keeps
product events anywhere a product decision can read them: who used a feature, whether a new
person reached first use, which features nobody touches. The product lifecycle (signals, board,
rollout, usage, release notes) is keyed on the feature id, in the app's own Supabase, so the
events it needs belong next to features, tickets and releases.

The plan recommended PostHog as the default sink. Genesis already owns its feature flags (the
registry, the gate, per-tenant switches) and treats vendors as adapters; events follow the same
rule.

## Decision

1. **The app's own Postgres is the source of truth for product events**: one table,
   `public.genesis_events` (genesis-supabase migration 0018), with the tenant, the person, the
   feature id, a short event name, small flat properties (no content; identifiers only), the flags that
   were on, the platform and the time.
2. **Writes go through functions, never the table**: `genesis_track_events(events)` for a
   signed-in person (their own tenants only, checked through `private.genesis_viewer_person_ids()`;
   a batch of at most 100, sizes capped, 2,000 an hour per login), `genesis_track_server_events(events)` for server code.
   Nobody but the service role reads the table; summaries such as `genesis_feature_usage` are
   service-role functions the product hub calls.
3. **Clients send through one tracker**: `createEventTracker` (genesis-supabase `/events`) batches,
   retries and flushes; on native, `createEventsSink` makes it an observability sink beside Sentry.
4. **Vendors are sinks, later**: a PostHog, Amplitude or warehouse adapter reads the same events
   (fan-out from the tracker, or an export job from the table). Genesis flags stay the source of
   truth; an event records which flags were on, so a vendor can split by them without deciding
   anything.
5. **Retention is the app's call**: `genesis_prune_events(older_than)` deletes old rows (default
   400 days), run from a schedule.

## Consequences

- Product analytics cost nothing per event and stay under the app's row-level security and its
  privacy terms; the product hub joins usage to features directly.
- Funnels, retention charts and session replay are not built in. They are a vendor sink's job when
  an app wants them, or product-hub views over the table later.
- Rejected: PostHog as the default (a second home for the data, and per-event cost at scale), and
  a vendor-only design (the lifecycle couldn't read usage without leaving the database).
