/**
 * The Puck config, generated from the section registry: one component per
 * section preset, grouped by category, with fields from each section's JSON
 * Schema and a canvas render that is the section's own server-safe
 * renderer. A section registered tomorrow appears in the editor with no
 * change here.
 */
import * as React from "react";
import type { Config, Fields } from "@puckeditor/core";
import { migrateNode } from "../core/migrate";
import { SECTION_CATEGORIES, listSections, type AnySectionDefinition, type RenderContext, type SectionCategory } from "../core/registry";
import type { MenuItem, PageKind } from "../core/schemas";
import type { ResolvedForm } from "../core/forms";
import { itemToNode, presetComponentName, sectionTypeOf, type PuckItem } from "./data";
import { sectionFields } from "./fields";

/** What the Add picker and its limits know about one Puck component. */
export interface ComponentInfo {
  type: string;
  /** The preset's name (the Add picker's label). */
  label: string;
  /** The section's own label. */
  sectionLabel: string;
  category: SectionCategory;
  placement: "header" | "body" | "footer";
  limit?: number;
}

/** What every section on the canvas is told about the page (Puck metadata). */
export interface CanvasMetadata {
  site: RenderContext["site"];
  pagePath: string;
  /** Plain objects, not Maps: Puck copies its metadata. */
  forms: Readonly<Record<string, ResolvedForm | null>>;
  /** The section that gets the page's h1. */
  h1Id: string | null;
  /** Template placeholders' original props, by section id. */
  placeholders: Readonly<Record<string, string>>;
}

export interface EditorConfigOptions {
  /** The page kind: sections not `enabledOn` it are left out of the picker. */
  kind?: PageKind;
  /** Sections to offer (default: every registered section). */
  sections?: readonly AnySectionDefinition[];
  /** How many of each type the page holds now; read when Puck asks whether one more may be added. */
  counts?: () => ReadonlyMap<string, number>;
  /**
   * Whether the page can't be changed now (a view-only editor, or a publish
   * running). Read with `counts`: a component's own `insert` overrides the
   * global permissions Puck is given, so it has to say no itself.
   */
  readOnly?: () => boolean;
}

export interface EditorConfig {
  config: Config;
  /** Puck component name → what it is. */
  components: ReadonlyMap<string, ComponentInfo>;
  /** The props of a section type that hold nested sections. */
  slotKeys: (type: string) => readonly string[];
}

const CATEGORY_TITLES: Record<SectionCategory, string> = {
  header: "Header",
  intro: "Openings",
  content: "Content",
  "social-proof": "Social proof",
  conversion: "Calls to action",
  footer: "Footer",
};

const META = new Set(["puck", "editMode", "id"]);

class SectionBoundary extends React.Component<{ label: string; children: React.ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error(`[genesis-sites/editor] the ${this.props.label} section failed to draw.`, error);
  }
  override render() {
    if (this.state.error) return <Problem title={`The ${this.props.label} section couldn't be drawn`} lines={[this.state.error.message]} />;
    return this.props.children;
  }
}

/** A notice on the canvas, in plain inline styles: the site stylesheet may not have these classes. */
function Problem({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div role="alert" style={{ margin: "1rem", padding: "1rem 1.25rem", border: "2px dashed currentColor", borderRadius: "0.5rem", fontFamily: "system-ui, sans-serif", fontSize: "0.875rem", lineHeight: 1.5 }}>
      <strong>{title}</strong>
      <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ position: "absolute", top: "0.5rem", right: "0.5rem", zIndex: 5, padding: "0.125rem 0.5rem", borderRadius: "999px", background: "hsl(var(--foreground))", color: "hsl(var(--background))", fontFamily: "system-ui, sans-serif", fontSize: "0.75rem", fontWeight: 600 }}>
      {children}
    </span>
  );
}

function CanvasSection({ def, componentName, input, slotKeys }: { def: AnySectionDefinition; componentName: string; input: Record<string, unknown>; slotKeys: readonly string[] }) {
  const meta = ((input.puck as { metadata?: CanvasMetadata } | undefined)?.metadata ?? {}) as Partial<CanvasMetadata>;
  const id = String(input.id);
  const props: Record<string, unknown> & { id: string } = { id };
  for (const [k, v] of Object.entries(input)) if (!META.has(k) && !slotKeys.includes(k)) props[k] = v;
  const node = itemToNode({ type: componentName, props } as PuckItem, { ...(meta.placeholders ? { placeholders: new Map(Object.entries(meta.placeholders)) } : {}) });
  const migrated = migrateNode(node);
  const slots = slotKeys.map((key) => {
    const Slot = input[key] as React.ComponentType<{ minEmptyHeight?: number }> | undefined;
    return typeof Slot === "function" ? (
      <div key={key} aria-label={`${def.label}: ${key}`} style={{ padding: "0.5rem" }}>
        <Slot minEmptyHeight={64} />
      </div>
    ) : null;
  });
  if (!migrated.node) {
    return <Problem title={`Fix the ${def.label} section to show it`} lines={migrated.issues.map((i) => i.message.replace(/^Section \S+ \([^)]*\): /, ""))} />;
  }
  const ctx: RenderContext = {
    headingLevel: meta.h1Id === id ? 1 : 2,
    site: meta.site ?? { name: "", lang: "en", nav: [] as MenuItem[] },
    pagePath: meta.pagePath ?? "/",
    href: (href) => href,
    forms: new Map(Object.entries(meta.forms ?? {})),
    mode: "preview",
    idPrefix: `gs-${id}`,
  };
  const tags = [node.hidden ? "Hidden: not published" : null, node.hideOn?.includes("mobile") ? "Hidden on phones" : null, node.hideOn?.includes("desktop") ? "Phones only" : null, node.placeholder ? "Sample content: replace it" : null].filter(Boolean);
  return (
    <div style={{ position: "relative", ...(node.hidden ? { opacity: 0.45 } : {}) }} data-gs-section={def.type}>
      {tags.length ? <Tag>{tags.join(" · ")}</Tag> : null}
      <SectionBoundary label={def.label}>{def.render({ props: migrated.node.props, variant: migrated.node.variant, node: migrated.node, ctx })}</SectionBoundary>
      {slots}
    </div>
  );
}

/**
 * The Puck config for one page kind, from the registry.
 *
 * @stability Beta
 */
export function createEditorConfig(options: EditorConfigOptions = {}): EditorConfig {
  const sections = (options.sections ?? listSections()).filter((def) => !options.kind || !def.enabledOn || def.enabledOn.includes(options.kind));
  const components: Config["components"] = {};
  const info = new Map<string, ComponentInfo>();
  const slots = new Map<string, readonly string[]>();
  const byCategory = new Map<SectionCategory, string[]>();
  const names = (placement: ComponentInfo["placement"]) => [...info.entries()].filter(([, i]) => i.placement === placement).map(([n]) => n);
  const bodyTypes = sections.filter((d) => (d.placement ?? "body") === "body").map((d) => d.type);

  for (const def of sections) {
    const { fields, slotKeys } = sectionFields(def, { slotAllow: bodyTypes });
    slots.set(def.type, slotKeys);
    const placement = def.placement ?? "body";
    def.presets.forEach((preset, i) => {
      const name = presetComponentName(def.type, i);
      info.set(name, { type: def.type, label: preset.name, sectionLabel: def.label, category: def.category, placement, ...(def.limit ? { limit: def.limit } : {}) });
      const list = byCategory.get(def.category) ?? [];
      list.push(name);
      byCategory.set(def.category, list);
      const limit = def.limit;
      components[name] = {
        label: i === 0 ? def.label : `${def.label}: ${preset.name}`,
        fields: fields as Fields,
        defaultProps: { ...structuredClone(preset.props as Record<string, unknown>), _v: def.version, _variant: preset.variant, _hidden: false, _hideOn: "none" },
        // Read each time Puck asks (the Add picker), so a section at its limit can't be dragged in.
        permissions: {
          get insert() {
            if (options.readOnly?.()) return false;
            return limit === undefined || (options.counts?.().get(def.type) ?? 0) < limit;
          },
        },
        render: (input: Record<string, unknown>) => <CanvasSection def={def} componentName={name} input={input} slotKeys={slotKeys} />,
      };
    });
  }

  const categories: Record<string, { title: string; components: string[] }> = {};
  for (const category of SECTION_CATEGORIES) {
    const list = byCategory.get(category);
    if (list?.length) categories[category] = { title: CATEGORY_TITLES[category], components: list };
  }

  const config: Config = {
    categories: { ...categories, other: { visible: false } } as Config["categories"],
    components,
    root: {
      fields: {
        title: { type: "text", label: "Page title" },
        hideSiteChrome: {
          type: "radio",
          label: "Site header and footer",
          options: [
            { label: "Show", value: false },
            { label: "Hide (a focused landing page)", value: true },
          ],
        },
        header: { type: "slot", label: "Site header", allow: names("header") },
        footer: { type: "slot", label: "Site footer", allow: names("footer") },
      } as Fields,
      render: ({ children, header: Header, footer: Footer, hideSiteChrome }: { children: React.ReactNode; header?: React.ComponentType<{ minEmptyHeight?: number; style?: React.CSSProperties }>; footer?: React.ComponentType<{ minEmptyHeight?: number; style?: React.CSSProperties }>; hideSiteChrome?: boolean }) => (
        <>
          {!hideSiteChrome && Header ? <Header minEmptyHeight={48} style={{ height: "auto" }} /> : null}
          <main id="main">{children}</main>
          {!hideSiteChrome && Footer ? <Footer minEmptyHeight={48} style={{ height: "auto" }} /> : null}
        </>
      ),
    },
  };
  return { config, components: info, slotKeys: (type) => slots.get(sectionTypeOf(type)) ?? [] };
}
