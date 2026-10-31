# ADR 0009: One resource contract drives every surface

- Status: accepted as direction (approved by the maintainer, 2026-10-29)
- Date: 2026-10-29
- Features: `resource-contract`, `data-views`, `genesis-mcp`, `agent-operable-apps`
- Related: ADR 0004 (workspaces), ADR 0006 (AI direction), docs/RESOURCE-VIEW.md

## Context

A Genesis app already describes a data source once. `genesis introspect` writes its contracts
(`contracts`, keyed `schema.table`, with columns, types and relations), and `defineView` and
`defineRecordView` (genesis-core) describe what a resource means to people on top of them:
fields, columns, actions, `can` rules, scope. `ResourceView`, `RecordView` and
`NativeResourceView` render the same description on web and native. But the other surfaces that
touch the same data are still written by hand: an API route, an AI tool, an MCP tool, an import
or export. Each is a second description that drifts from the first, and each is a place a rule
(`can`, scope) can be forgotten.

## Decision

1. **The contract is the source.** A resource is defined once: its contract (generated from the
   database) plus its view description. Every surface is derived from that pair, never written
   beside it:
   - the list view and the record view (today);
   - the form (the view's fields and the contract's types);
   - the API: one handler per resource, reading and writing through the resource's provider
     and the person's row-level security;
   - AI tools (`defineTool`, planned in ADR 0006), one per view action and per read, with `risk`
     from the action;
   - the app's MCP server (`genesis-mcp`, planned), which serves those tools, read-only first.
2. **Rules travel with it.** `can`, scope and field visibility are part of the description, so
   a derived surface cannot skip them. Row-level security stays the boundary under all of them,
   and every derived server function gets a pgTAP test.
3. **Hand-written stays possible**, as an escape hatch beside a derived surface (a custom tool,
   a custom route), the same way `ResourcePage` sits inside a component that renders
   `ResourceView`.

## Consequences

- New surfaces are generators over the contract and the view, not new descriptions: AI tools and
  MCP come first (Phase 2), then the API handler and imports.
- A view description grows the few fields those surfaces need (an action's risk, a tool's
  description), additively.
- The doctor's existing rule against screens calling `supabase.from` extends to tools and routes
  that read a resource another way.
