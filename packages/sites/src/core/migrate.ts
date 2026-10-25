/**
 * Props migrations. A section node records the props version it was written
 * at (`v`); its definition declares the current `version` and a pure
 * function per step. `migrateNode` runs `migrations[v + 1 .. version]` and
 * checks the result against the section's schema. The editor and the
 * renderer both read through it, and a publish writes the migrated props
 * into the release, so old drafts keep working after a section changes.
 */
import type { PageDoc, SectionNode, SiteDoc } from "./schemas";
import { getSection, type AnySectionDefinition } from "./registry";

export interface MigrationIssue {
  severity: "error" | "warning";
  code: "unknown-section" | "newer-version" | "migration-failed" | "invalid-props" | "unknown-variant";
  sectionId: string;
  type: string;
  message: string;
}

export interface MigratedNode {
  /** The node at the current version with parsed props, or null when it can't be rendered. */
  node: (SectionNode & { variant: string }) | null;
  /** Whether anything changed (the version, the props or the variant). */
  changed: boolean;
  issues: MigrationIssue[];
}

/** Bring one node up to its section's current version and check its props. */
export function migrateNode(node: SectionNode, lookup: (type: string) => AnySectionDefinition | undefined = getSection): MigratedNode {
  const def = lookup(node.type);
  const where = { sectionId: node.id, type: node.type };
  if (!def) {
    return {
      node: null,
      changed: false,
      issues: [{ ...where, severity: "error", code: "unknown-section", message: `No section "${node.type}" is registered; section ${node.id} can't be shown.` }],
    };
  }
  if (node.v > def.version) {
    return {
      node: null,
      changed: false,
      issues: [
        {
          ...where,
          severity: "error",
          code: "newer-version",
          message: `Section ${node.id} was saved by a newer "${node.type}" (v${node.v}) than this code knows (v${def.version}).`,
        },
      ],
    };
  }
  let props: Record<string, unknown> = node.props;
  for (let n = node.v + 1; n <= def.version; n++) {
    const step = def.migrations?.[n];
    try {
      props = step ? step(structuredClone(props)) : props;
    } catch (err) {
      return {
        node: null,
        changed: false,
        issues: [{ ...where, severity: "error", code: "migration-failed", message: `Migrating section ${node.id} to v${n} failed: ${(err as Error).message}` }],
      };
    }
  }
  const parsed = def.schema.safeParse(props);
  if (!parsed.success) {
    return {
      node: null,
      changed: false,
      issues: [
        {
          ...where,
          severity: "error",
          code: "invalid-props",
          message: `Section ${node.id} (${def.label}): ${parsed.error.issues.map((i) => `${i.path.join(".") || "props"}: ${i.message}`).join("; ")}`,
        },
      ],
    };
  }
  const issues: MigrationIssue[] = [];
  let variant = node.variant ?? def.defaultVariant;
  if (!def.variants.some((v) => v.id === variant)) {
    issues.push({ ...where, severity: "warning", code: "unknown-variant", message: `Section ${node.id} asks for variant "${variant}", which "${node.type}" doesn't have; showing "${def.defaultVariant}".` });
    variant = def.defaultVariant;
  }
  const next = { ...node, v: def.version, variant, props: parsed.data as Record<string, unknown> };
  const changed = node.v !== def.version || variant !== node.variant || JSON.stringify(parsed.data) !== JSON.stringify(node.props);
  return { node: next, changed, issues };
}

export interface MigratedPage {
  doc: PageDoc;
  changed: boolean;
  issues: MigrationIssue[];
}

/**
 * Migrate every node of a page. Nodes that can't be shown stay in the
 * document unchanged (an editor must not lose them) and are reported.
 */
export function migratePage(doc: PageDoc, lookup?: (type: string) => AnySectionDefinition | undefined): MigratedPage {
  const issues: MigrationIssue[] = [];
  let changed = false;
  const content = doc.content.map((node) => {
    const m = migrateNode(node, lookup);
    issues.push(...m.issues);
    if (m.node && m.changed) changed = true;
    return m.node ?? node;
  });
  return { doc: changed ? { ...doc, content } : doc, changed, issues };
}

export function migrateSite(site: SiteDoc, lookup?: (type: string) => AnySectionDefinition | undefined): { site: SiteDoc; changed: boolean; issues: MigrationIssue[] } {
  const issues: MigrationIssue[] = [];
  let changed = false;
  const run = (nodes: SectionNode[]) =>
    nodes.map((node) => {
      const m = migrateNode(node, lookup);
      issues.push(...m.issues);
      if (m.node && m.changed) changed = true;
      return m.node ?? node;
    });
  const header = run(site.header);
  const footer = run(site.footer);
  return { site: changed ? { ...site, header, footer } : site, changed, issues };
}
