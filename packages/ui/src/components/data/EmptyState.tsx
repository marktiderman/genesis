/**
 * Deprecated alias of the canonical `EmptyState`.
 *
 * SOURCE-compatible, not PIXEL-compatible. Every prop this `/data` variant
 * offered — `icon` / `message` / `action` / `hasFilters` / `onClearFilters` —
 * still compiles and still means the same thing, so no call site needs to
 * change. What consumers WILL see change is the rendered markup, because this
 * is now literally the root component: convergence means one look, and the
 * root component's look won.
 *
 * Concretely, versus the implementation this alias replaced:
 * - default icon `Search` -> `FileQuestion`, now inside a 16x16 `bg-muted`
 *   circle rather than bare at 10x10;
 * - the message renders as a bold `<h3>` heading, not a muted `<p>`;
 * - default message copy "No items found" -> "No results found";
 * - container `py-16 animate-fade-in` -> `flex ... py-12 px-4` (the
 *   fade-in animation is gone);
 * - the action/clear-filters spacing moves from `mt-2`/`mt-4` to `mt-6`.
 *
 * Anything pinned to those exact class names or to the old copy should expect
 * a visual diff on upgrade. That is the intended outcome of the convergence,
 * not an accident — but it is a visual change, so it is called out here and
 * in the changeset rather than described as a no-op.
 *
 * @deprecated Use `EmptyState` from `@marktiderman/genesis-ui` (the package
 * root export) instead — it is the same component this file re-exports, plus
 * `title` / `description`. This re-export is kept for source compatibility
 * and will be removed at the next major version (2.0) — see
 * `docs/MIGRATION.md` when that lands.
 * @stability Deprecated
 */
export { EmptyState, type EmptyStateProps } from "../patterns/empty-state";
