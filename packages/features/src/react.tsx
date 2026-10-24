import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { AppWindow, Eye, Users } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Section, StatusBadge } from "@marktiderman/genesis-ui";
import {
  DataGrid,
  KanbanBoard,
  ResourcePage,
  type ColumnStatus,
  type DataFilterConfig,
  type ResourcePageProps,
} from "@marktiderman/genesis-ui/data";
import { marketingRecords } from "./generate";
import {
  FEATURE_HORIZONS,
  FEATURE_STATUSES,
  toRecords,
  type FeatureHorizon,
  type FeatureRecord,
  type FeatureStatus,
  type Features,
  type Flags,
} from "./model";

const BOARD_STATUS: Record<FeatureStatus, ColumnStatus> = {
  idea: "neutral",
  planned: "neutral",
  building: "info",
  beta: "warning",
  live: "success",
  deprecated: "destructive",
  retired: "neutral",
};

const LABEL: Record<FeatureStatus, string> = {
  idea: "Idea",
  planned: "Planned",
  building: "Building",
  beta: "Beta",
  live: "Live",
  deprecated: "Deprecated",
  retired: "Retired",
};

const HORIZON_LABEL: Record<FeatureHorizon, string> = { now: "Now", next: "Next", later: "Later" };

/** The statuses the main list shows. Ideas and planned work are on the roadmap instead. */
const SHIPPING = FEATURE_STATUSES.filter((s) => s !== "idea" && s !== "planned");

/**
 * A feature's status as a badge. `StatusBadge` covers the active states and
 * deprecated; idea, planned and retired have no status there, so they use the
 * secondary and outline `Badge`.
 *
 * @stability Beta
 */
export function FeatureStatusBadge({ status }: { status: FeatureStatus }) {
  if (status === "building") return <StatusBadge status="inProgress">{LABEL[status]}</StatusBadge>;
  if (status === "beta") return <StatusBadge status="atRisk">{LABEL[status]}</StatusBadge>;
  if (status === "live") return <StatusBadge status="done">{LABEL[status]}</StatusBadge>;
  if (status === "deprecated") return <StatusBadge status="offTrack">{LABEL[status]}</StatusBadge>;
  return <Badge variant={status === "planned" || status === "idea" ? "secondary" : "outline"}>{LABEL[status]}</Badge>;
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
  /**
   * `"admin"` (default): the full list, a status board and the roadmap.
   * `"marketing"`: public, shipped features with a tagline as benefit cards,
   * highlights first, grouped by category.
   */
  variant?: "admin" | "marketing";
  /** Show the roadmap (features with a `horizon`) under the list. Default true. */
  roadmap?: boolean;
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

/** A feature as a card. With `onOpen` it is a button that opens the detail, from the keyboard too. */
function FeatureCard({ feature, onOpen }: { feature: FeatureRecord; onOpen?: () => void }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="font-medium leading-tight">{feature.name}</span>
        <FeatureStatusBadge status={feature.status} />
      </span>
      <span className="block text-sm text-muted-foreground">{feature.summary}</span>
      <span className="block text-xs text-muted-foreground">
        {feature.owner} · {feature.apps.join(", ")} · {feature.audience.join(", ")}
      </span>
    </>
  );
  const look = "block w-full space-y-2 rounded-lg border bg-card p-3 text-left text-card-foreground";
  if (!onOpen) return <div className={look} data-feature-id={feature.id}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${feature.name}`}
      data-feature-id={feature.id}
      className={`${look} focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {body}
    </button>
  );
}

/** The page's grid view as a board, one column per status, over the rows ResourcePage has filtered. */
function FeatureBoard(props: ComponentProps<typeof DataGrid<FeatureRecord>>) {
  if (props.viewMode !== "grid") return <DataGrid<FeatureRecord> {...props} />;
  const { items, renderCard } = props;
  const columns = SHIPPING.map((status) => ({
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
      renderCard={(item) => renderCard(item, items.indexOf(item))}
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
      <Row label="Visibility">{feature.visibility}</Row>
      <Row label="Access">{feature.access === "all" ? "Everyone" : `The ${feature.access.plan} plan`}</Row>
      {feature.horizon ? <Row label="Roadmap">{HORIZON_LABEL[feature.horizon]}</Row> : null}
      {feature.claimedBy ? <Row label="Being built by">{feature.claimedBy}</Row> : null}
      {feature.tagline ? <Row label="Tagline">{feature.tagline}</Row> : null}
      {feature.acceptance?.length ? (
        <Row label="Acceptance">
          <ul className="list-disc space-y-1 pl-4">
            {feature.acceptance.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Row>
      ) : null}
      {feature.reviewedAt ? <Row label="Reviewed">{feature.reviewedAt}</Row> : null}
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

/** The roadmap: planned and building features with a horizon, in Now / Next / Later columns. No dates. */
function Roadmap({ records }: { records: FeatureRecord[] }) {
  const columns = FEATURE_HORIZONS.map((horizon) => ({
    key: horizon,
    label: HORIZON_LABEL[horizon],
    status: (horizon === "now" ? "info" : "neutral") as ColumnStatus,
    items: records.filter((r) => r.horizon === horizon),
  }));
  return (
    <Section title="Roadmap" description="What's coming, in order. No dates." testID="feature-roadmap">
      <KanbanBoard<FeatureRecord>
        columns={columns}
        getKey={(r) => r.id}
        emptyMessage="Nothing yet"
        className="xl:grid-cols-3"
        renderCard={(r) => <FeatureCard feature={r} />}
      />
    </Section>
  );
}

/** Public, shipped features as benefit cards: highlights first, then by category. */
function MarketingList({ features, title }: { features: Features; title: string }) {
  const records = marketingRecords(features);
  const groups = [...new Set(records.map((r) => (r.highlight ? "" : (r.category ?? "More"))))];
  return (
    <Section title={title} testID="feature-marketing">
      {groups.map((group) => (
        <div key={group || "highlights"} className="space-y-3">
          {group ? <h3 className="text-lg font-semibold">{group}</h3> : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {records
              .filter((r) => (r.highlight ? "" : (r.category ?? "More")) === group)
              .map((r) => (
                <Card key={r.id} data-feature-id={r.id} className={r.highlight ? "border-primary" : undefined}>
                  {r.media?.image ? <img src={r.media.image} alt={r.media.alt} className="aspect-video w-full rounded-t-lg object-cover" /> : null}
                  <CardHeader>
                    <CardTitle>
                      {r.name}
                      {r.status === "beta" ? <Badge variant="secondary" className="ml-2">Beta</Badge> : null}
                    </CardTitle>
                    <CardDescription>{r.tagline}</CardDescription>
                  </CardHeader>
                  {r.media?.video ? (
                    <CardContent>
                      <a className="text-sm underline underline-offset-2" href={r.media.video} target="_blank" rel="noreferrer">
                        Watch: {r.media.alt}
                      </a>
                    </CardContent>
                  ) : null}
                </Card>
              ))}
          </div>
        </div>
      ))}
    </Section>
  );
}

/**
 * A repo's features as a page. The default (`variant="admin"`) is a
 * ResourcePage over static data: a table, and in its grid view a board grouped
 * by status, with status chips, filters by app, audience and visibility,
 * search, and a detail panel with the feature's links, acceptance and flags.
 * Planned work is kept off the list and shown on the roadmap below it.
 * `variant="marketing"` shows only public, shipped features with a tagline.
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
  variant = "admin",
  roadmap = true,
  resourcePageProps,
  className,
}: FeatureListProps) {
  const records = useMemo(() => toRecords(features, flags), [features, flags]);
  const [apps, setApps] = useState<string[]>([]);
  const [audience, setAudience] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<string[]>([]);
  const data = useMemo(
    () =>
      records.filter(
        (r) =>
          r.status !== "planned" &&
          r.status !== "idea" &&
          (apps.length === 0 || r.apps.some((a) => apps.includes(a))) &&
          (audience.length === 0 || r.audience.some((a) => audience.includes(a))) &&
          (visibility.length === 0 || visibility.includes(r.visibility)),
      ),
    [records, apps, audience, visibility],
  );
  if (variant === "marketing") {
    return (
      <div className={className}>
        <MarketingList features={features} title={title} />
      </div>
    );
  }
  const filters = [
    facet("apps", "App", AppWindow, records.flatMap((r) => r.apps), apps, setApps),
    facet("audience", "Audience", Users, records.flatMap((r) => r.audience), audience, setAudience),
    facet("visibility", "Visibility", Eye, records.map((r) => r.visibility), visibility, setVisibility),
  ];
  const planned = records.filter((r) => r.horizon);

  return (
    <div className={className ? `space-y-8 ${className}` : "space-y-8"}>
      <ResourcePage<FeatureRecord>
        title={title}
        subtitle={subtitle}
        data={data}
        total={data.length}
        getKey={(r) => r.id}
        titleField="name"
        subtitleField="id"
        columns={[
          { key: "name", header: "Feature" },
          { key: "status", header: "Status", render: (r) => <FeatureStatusBadge status={r.status} /> },
          { key: "owner", header: "Owner", hideBelow: "md" },
          { key: "apps", header: "Apps", hideBelow: "lg", accessor: (r) => r.apps.join(", ") },
          { key: "audience", header: "Audience", hideBelow: "lg", accessor: (r) => r.audience.join(", ") },
          { key: "visibility", header: "Visibility", hideBelow: "xl" },
          { key: "summary", header: "Summary", hideBelow: "xl" },
        ]}
        searchFields={["id", "name", "summary", "owner", "tagline", "category"]}
        searchPlaceholder="Search features"
        statusFilter={{ field: "status", options: [...SHIPPING] }}
        filters={filters}
        detail="panel"
        renderDetail={(r) => <FeatureDetail feature={r} pathHref={pathHref} />}
        renderCard={(r, _index, actions) => <FeatureCard feature={r} onOpen={actions.open} />}
        defaultView={defaultView === "board" ? "grid" : "table"}
        viewSettingsKey={viewSettingsKey}
        emptyMessage="No features match"
        {...resourcePageProps}
        slots={{ grid: FeatureBoard, ...resourcePageProps?.slots }}
      />
      {roadmap && planned.length ? <Roadmap records={planned} /> : null}
    </div>
  );
}
