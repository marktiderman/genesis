/**
 * The small read-only lists the help desk's screens show (collections, agents, mentions, a desk's
 * log, earlier conversations, open tickets by customer) as views: a `defineView` over rows the
 * support client already read, drawn by genesis-ui's `<ResourceView rows>`. One place builds them,
 * so each screen names only its fields and words.
 *
 * @internal
 */
import type { ReactNode } from "react";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";

export interface ListViewField {
  name: string;
  label: string;
  type?: "string" | "number" | "datetime";
  display?: "date" | "datetime" | "number";
}

export interface ListViewWords {
  title: string;
  noun: string;
  nounPlural: string;
  emptyTitle: string;
  emptyBody?: string;
}

/** A read-only view of `fields` (the first is each row's title), keyed by `id`. */
export function listView<Row extends Record<string, unknown>>(name: string, words: ListViewWords, fields: readonly ListViewField[]) {
  const resource = defineResource<Row>()({
    name,
    key: "id",
    label: words.title,
    labelField: fields[0]!.name,
    noun: words.noun,
    fields: [
      { name: "id", type: "string", generated: true, hasDefault: true },
      ...fields.map((f) => ({ name: f.name, type: f.type ?? "string", nullable: true, readOnly: true, label: f.label })),
    ],
  });
  return defineView<typeof resource, Row>(resource, {
    copy: { noun: words.noun, nounPlural: words.nounPlural, title: words.title, empty: { title: words.emptyTitle, ...(words.emptyBody ? { body: words.emptyBody } : {}) } },
    fields: Object.fromEntries(fields.filter((f) => f.display).map((f) => [f.name, { display: f.display }])),
    columns: { default: fields.map((f) => f.name) },
    form: [],
  });
}

export interface ViewListProps<Row extends Record<string, unknown>> {
  view: ReturnType<typeof listView<Row>>;
  rows: readonly Row[] | undefined;
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Cells drawn the screen's own way (a button that opens the row), by field. */
  cells?: Partial<Record<string, (row: Row) => ReactNode>>;
  /** Each row's delete, with its confirm. */
  onDelete?: (row: Row) => void | Promise<void>;
  confirmDelete?: { title: string; description: string; confirmLabel: string; cancelLabel: string };
  testId: string;
}

/** A read-only list in a side panel or a card: the view's rows, no peek, no create or edit. */
export function ViewList<Row extends Record<string, unknown>>({ view, rows, loading = false, error = false, errorMessage, onRetry, cells, onDelete, confirmDelete, testId }: ViewListProps<Row>) {
  return (
    <div data-testid={testId}>
      <ResourceView<Row>
        view={view}
        rows={(rows ?? []) as Row[]}
        loading={loading}
        error={error}
        {...(errorMessage ? { errorMessage } : {})}
        {...(onRetry ? { onRetry } : {})}
        layout="compact"
        type="list"
        detail="none"
        allowCreate={false}
        allowEdit={false}
        export={false}
        switcher={false}
        urlState={false}
        {...(cells ? { cells } : {})}
        {...(onDelete ? { onDelete, ...(confirmDelete ? { confirmDelete } : {}) } : { allowDelete: false })}
      />
    </div>
  );
}
