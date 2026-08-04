"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useOne } from "@marktiderman/genesis-core/hooks";
import type { BaseRecord, Identifier } from "@marktiderman/genesis-core/provider";
import { DetailPage } from "../layout/detail-page";
import { EmptyState } from "../patterns/empty-state";
import { PageLoading } from "../patterns/page-loading";

export interface ResourceDetailPageProps<T extends BaseRecord = BaseRecord> {
  /** Resource name, resolved through the mounted `DataProvider`. */
  resource: string;
  /**
   * Record id. Nullish means "not resolved yet" — no request goes out and the
   * page shows its loading state, which is what a route param that hasn't
   * arrived should look like. It is deliberately NOT the not-found state:
   * nothing has been asked, so nothing is missing.
   */
  id: Identifier | undefined | null;
  /**
   * Field used as the page title. Defaults to `name`, then `title`, then the
   * id — the same fallback chain `ResourcePage` uses for a row's label.
   */
  titleField?: string;
  /** Field used as the line under the title. */
  subtitleField?: string;
  /** Provider select/join syntax, e.g. `"*, owner:profiles(name)"`. */
  select?: string;
  /** Slot above the title: a `Breadcrumb`, a back link, a `StatusBadge`. */
  breadcrumb?: ReactNode;
  /** Record-scoped controls, built from the loaded record. */
  actions?: (record: T) => ReactNode;
  /** Metadata column, built from the loaded record. */
  sidebar?: (record: T) => ReactNode;
  /** The primary content region. */
  children: (record: T) => ReactNode;
  className?: string;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/** `name` -> `title` -> id. Mirrors `ResourcePage`'s row-label fallback. */
function pick(record: BaseRecord, field: string | undefined): string {
  const value = field ? record[field] : record.name ?? record.title ?? record.id;
  return value == null ? "" : String(value);
}

/**
 * Does this error mean "no such row" rather than "the request failed"?
 *
 * Every provider Genesis ships reports a missing record by THROWING, not by
 * resolving with empty data, so without this the not-found state would be
 * dead code and a deleted record would show a generic failure carrying a raw
 * database string. Verified against each provider's `getOne` rather than
 * assumed:
 *
 * - `packages/core/src/provider/supabase-provider.ts` — `.single()`, whose
 *   PostgREST error for zero rows is code `PGRST116`; `throwIfError` copies
 *   `code` onto the thrown Error.
 * - `packages/core/src/provider/mock-provider.ts` — throws
 *   `[MockProvider] Record not found: <resource>#<id>`.
 * - `packages/data-switchboard/src/data-provider.ts` — throws
 *   `switchboard-data-provider: no "<resource>" row with id "<id>".`
 *
 * Deliberately narrow: anything it does not recognise falls through to the
 * error state, which is the safe direction. A custom provider that instead
 * resolves with no data is also handled — see the `!data` branch below.
 */
/** The absent-record state, reached from two directions — see below. */
function NotFound() {
  return (
    <EmptyState
      title="Not found"
      description="This record no longer exists, or you don't have access to it."
    />
  );
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as { code?: unknown }).code === "PGRST116") return true;
  return (
    /\[MockProvider\] Record not found/i.test(error.message) ||
    /switchboard-data-provider: no ".*" row with id/i.test(error.message)
  );
}

/**
 * ResourceDetailPage — `DetailPage` with a record bound to it: fetches one
 * record by id through the mounted `DataProvider` and hands it to the title,
 * the actions, the sidebar and the content.
 *
 * ```tsx
 * <ResourceDetailPage
 *   resource="people"
 *   id={params.id}
 *   subtitleField="role"
 *   actions={(person) => <Button testID="edit">Edit {person.name}</Button>}
 *   sidebar={(person) => <StatCard label="Sessions" value={person.session_count} />}
 * >
 *   {(person) => <Section title="Timeline"><Timeline personId={person.id} /></Section>}
 * </ResourceDetailPage>
 * ```
 *
 * This is the detail-route counterpart to `ResourcePage`, which is the list
 * one. Both are **data-bound**, not layouts: they need a resource contract
 * to be useful, which is the layers table's admission test for this tier.
 * The structure they render is a layout and lives one layer down —
 * `DetailPage` in `@marktiderman/genesis-ui/layout` — so an app with its own
 * fetching keeps the page shape without inheriting the provider. That
 * layout/data-bound pairing is the same one `AppShell` and `ResourcePage`
 * already have.
 *
 * The three non-record states are rendered here rather than left to the
 * caller, because a per-app "loading…" is exactly the hand-written code a
 * template exists to remove:
 * - loading, or no id yet -> `PageLoading`
 * - absent -> `EmptyState` saying so, distinct from the error state, since a
 *   deleted record and a broken query need different words. Every provider
 *   Genesis ships signals "no such row" by throwing rather than by resolving
 *   empty, so this state is reached by classifying the error (see
 *   `isNotFoundError`) as well as by a falsy `data`
 * - any other failure -> `EmptyState` carrying the provider's message, which
 *   is kept verbatim: an error state that hides what went wrong is the one
 *   nobody can act on
 *
 * `titleField` is exact: name a field and you get that field, empty string
 * included. The `name` -> `title` -> id chain is the DEFAULT, not a fallback
 * layered under an explicit choice — a page silently titled by a different
 * column than the one asked for is worse than a blank one.
 *
 * @stability Beta
 */
export function ResourceDetailPage<T extends BaseRecord = BaseRecord>({
  resource,
  id,
  titleField,
  subtitleField,
  select,
  breadcrumb,
  actions,
  sidebar,
  children,
  className,
  testID,
}: ResourceDetailPageProps<T>) {
  const { data, isLoading, isError, error } = useOne<T>(resource, id, {
    select,
    // `useOne` defaults to `enabled: !!id`, which is wrong for a numeric
    // primary key: id `0` is falsy, so the query would never run and the page
    // would report a record that exists as missing, without ever asking the
    // provider. `Identifier` is `string | number`, so this is reachable.
    // Presence is the question, not truthiness.
    enabled: id != null,
  });

  // A disabled query reports neither loading nor error nor data, so the
  // "no id yet" case has to be named explicitly or it falls through to
  // not-found — nothing was asked, so nothing is missing.
  if (id == null || isLoading) {
    return <PageLoading testID={testID ? `${testID}-loading` : undefined} />;
  }

  // Order matters: `isError` implies `data` is undefined, so testing `!data`
  // first would swallow every failure into the not-found state.
  if (isError) {
    if (isNotFoundError(error)) return <NotFound />;
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load this record"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  }

  // A provider that answers successfully with nothing. None of the three
  // Genesis ships does this, but the `DataProvider` contract permits it and
  // a custom adapter is free to.
  if (!data) return <NotFound />;

  return (
    <DetailPage
      className={className}
      testID={testID}
      breadcrumb={breadcrumb}
      title={pick(data, titleField)}
      subtitle={subtitleField ? pick(data, subtitleField) : undefined}
      actions={actions?.(data)}
      sidebar={sidebar?.(data)}
    >
      {children(data)}
    </DetailPage>
  );
}
