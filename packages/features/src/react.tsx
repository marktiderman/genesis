import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { AppWindow, Users } from "lucide-react";
import { Badge, StatusBadge } from "@marktiderman/genesis-ui";
import {
  DataGrid,
  KanbanBoard,
  ResourcePage,
  type ColumnStatus,
  type DataFilterConfig,
  type ResourcePageProps,
} from "@marktiderman/genesis-ui/data";
import { FEATURE_STATUSES, toRecords, type FeatureRecord, type FeatureStatus, type Features, type Flags } from "./model";

const BOARD_STATUS: Record<FeatureStatus, ColumnStatus> = {
  planned: "neutral",
  building: "info",
  beta: "warning",
  live: "success",
  retired: "neutral",
};

const LABEL: Record<FeatureStatus, string> = {
  planned: "Planned",
  building: "Building",
  beta: "Beta",
  live: "Live",
  retired: "Retired",
};

/**
 * A feature's status as a badge. `StatusBadge` covers the active states;
 * planned and retired have no status there, so they use the muted and outline
 * `Badge`.
 *
 * @stability Beta
 */
export function FeatureStatusBadge({ status }: { status: FeatureStatus }) {
  if (status === "building") return <StatusBadge status="inProgress">{LABEL[status]}</StatusBadge>;
  if (status === "beta") return <StatusBadge status="atRisk">{LABEL[status]}</StatusBadge>;
  if (status === "live") return <StatusBadge status="done">{LABEL[status]}</StatusBadge>;
  return <Badge variant={status === "planned" ? "muted" : "outline"}>{LABEL[status]}</Badge>;
}

/** @stability Beta */
export interface FeatureListProps {
  features: Features;
  /** The repo's flags, so each feature shows its own. */
  flags?: Flags;
  /** Default "Features". */
  title?: string;
  subtitle?: string;
  /**
   * The view before the user picks one: `"table"` (default) or `"board"`. The
   * page's grid view is the board, grouped by status.
   */
  defaultView?: "table" | "board";
  /** Persist the user's view, page size and density under this key. */
  viewSettingsKey?: string;
  /** A link for a repo path in `links.code` / `links.docs`, e.g. to GitHub. Default: shown as text. */
  pathHref?: (path: string) => string | undefined;
  /** Anything else for the underlying `ResourcePage` (e.g. `urlState`). */
  resourcePageProps?: Partial<ResourcePageProps<FeatureRecord>>;
  className?: string;
}

const unique = (values: string[]) => [...new Set(values)].sort();

function facet(
  key: string,
  label: string,
  icon: DataFilterConfig["icon"],
  values: string[],
  selected: string[],
  onChange: (values: string[]) => void,
): DataFilterConfig {
  return { key, label, icon, options: unique(values).map((value) => ({ value })), selected, onChange };
}

function FeatureCard({ feature }: { feature: FeatureRecord }) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3 text-card-foreground" data-feature-id={feature.id}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-tight">{feature.name}</p>
        <FeatureStatusBadge status={feature.status} />
      </div>
      <p className="text-sm text-muted-foreground">{feature.summary}</p>
      <p className="text-xs text-muted-foreground">
        {feature.owner} · {feature.apps.join(", ")} · {feature.audience.join(", ")}
      </p>
    </div>
  );
}

/** The page's grid view as a board, one column per status, over the rows ResourcePage has filtered. */
function FeatureBoard(props: ComponentProps<typeof DataGrid<FeatureRecord>>) {
  if (props.viewMode !== "grid") return <DataGrid<FeatureRecord> {...props} />;
  const { items, renderCard, onItemClick, getItemLabel } = props;
  const columns = FEATURE_STATUSES.map((status) => ({
    key: status,
    label: LABEL[status],
    status: BOARD_STATUS[status],
    items: items.filter((item) => item.status === status),
  }));
  return (
    <KanbanBoard<FeatureRecord>
      columns={columns}
      getKey={(item) => item.id}
      emptyMessage="None"
      renderCard={(item) => {
        const card = renderCard(item, items.indexOf(item));
        return onItemClick ? (
          <button
            type="button"
            className="block w-full rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={getItemLabel?.(item)}
            onClick={() => onItemClick(item)}
          >
            {card}
          </button>
        ) : (
          card
        );
      }}
    />
  );
}

function PathList({ paths, href }: { paths: readonly string[]; href?: (path: string) => string | undefined }) {
  return (
    <ul className="space-y-1">
      {paths.map((path) => {
        const url = /^https?:\/\//.test(path) ? path : href?.(path);
        return (
          <li key={path} className="font-mono text-xs">
            {url ? (
              <a className="underline underline-offset-2" href={url} target="_blank" rel="noreferrer">
                {path}
              </a>
            ) : (
              path
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function FeatureDetail({ feature, pathHref }: { feature: FeatureRecord; pathHref?: FeatureListProps["pathHref"] }) {
  const { links } = feature;
  return (
    <dl className="space-y-4">
      <Row label="Status">
        <FeatureStatusBadge status={feature.status} />
      </Row>
      <Row label="Summary">{feature.summary}</Row>
      <Row label="Owner">{feature.owner}</Row>
      <Row label="Apps">{feature.apps.join(", ")}</Row>
      <Row label="Audience">{feature.audience.join(", ")}</Row>
      {feature.since ? <Row label="Since">{feature.since}</Row> : null}
      {feature.flags.length ? <Row label="Flags">{feature.flags.join(", ")}</Row> : null}
      {links?.code?.length ? (
        <Row label="Code">
          <PathList paths={links.code} href={pathHref} />
        </Row>
      ) : null}
      {links?.docs?.length ? (
        <Row label="Docs">
          <PathList paths={links.docs} href={pathHref} />
        </Row>
      ) : null}
      {links?.issue ? <Row label="Issue">{links.issue}</Row> : null}
    </dl>
  );
}

/**
 * A repo's features as a ResourcePage over static data: a table, and a board
 * grouped by status in the grid view, with status chips, filters by app and
 * audience, search, and a detail panel with the feature's links and flags.
 *
 * @stability Beta
 */
export function FeatureList({
  features,
  flags,
  title = "Features",
  subtitle,
  defaultView = "table",
  viewSettingsKey,
  pathHref,
  resourcePageProps,
  className,
}: FeatureListProps) {
  const records = useMemo(() => toRecords(features, flags), [features, flags]);
  const [apps, setApps] = useState<string[]>([]);
  const [audience, setAudience] = useState<string[]>([]);
  const data = useMemo(
    () =>
      records.filter(
        (r) =>
          (apps.length === 0 || r.apps.some((a) => apps.includes(a))) &&
          (audience.length === 0 || r.audience.some((a) => audience.includes(a))),
      ),
    [records, apps, audience],
  );
  const filters = [
    facet("apps", "App", AppWindow, records.flatMap((r) => r.apps), apps, setApps),
    facet("audience", "Audience", Users, records.flatMap((r) => r.audience), audience, setAudience),
  ];

  return (
    <ResourcePage<FeatureRecord>
      title={title}
      subtitle={subtitle}
      data={data}
      total={data.length}
      getKey={(r) => r.id}
      getTitle={(r) => r.name}
      getSubtitle={(r) => r.id}
      columns={[
        { key: "name", header: "Feature" },
        { key: "status", header: "Status", render: (r) => <FeatureStatusBadge status={r.status} /> },
        { key: "owner", header: "Owner", hideBelow: "md" },
        { key: "apps", header: "Apps", hideBelow: "lg", accessor: (r) => r.apps.join(", ") },
        { key: "audience", header: "Audience", hideBelow: "lg", accessor: (r) => r.audience.join(", ") },
        { key: "summary", header: "Summary", hideBelow: "xl" },
      ]}
      searchFields={["id", "name", "summary", "owner"]}
      searchPlaceholder="Search features"
      statusFilter={{ field: "status", options: [...FEATURE_STATUSES] }}
      filters={filters}
      detail="panel"
      renderDetail={(r) => <FeatureDetail feature={r} pathHref={pathHref} />}
      renderCard={(r) => <FeatureCard feature={r} />}
      openOnCardClick
      defaultView={defaultView === "board" ? "grid" : "table"}
      viewSettingsKey={viewSettingsKey}
      emptyMessage="No features match"
      className={className}
      {...resourcePageProps}
      slots={{ grid: FeatureBoard, ...resourcePageProps?.slots }}
    />
  );
}
