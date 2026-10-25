/**
 * Between Genesis documents and Puck's data.
 *
 * A Genesis section node is `{ id, type, v, variant, hidden, hideOn,
 * placeholder, props }`; a Puck item is `{ type, props: { id, ...props } }`.
 * The node's own fields travel in the Puck props under `_` keys (`_variant`,
 * `_hidden`, `_hideOn`, `_v`, `_placeholder`) that no section schema may use,
 * and come back out on save. A page's header and footer (site parts) are
 * slots on Puck's root, so the canvas shows and edits the whole page.
 *
 * The editor's Add picker offers each section's presets: a preset after the
 * first is its own Puck component, `type@n`, and turns back into `type` on
 * save, so stored documents only ever name registered types.
 */
import { getSection, type AnySectionDefinition } from "../core/registry";
import type { PageDoc, SectionNode, Seo, SiteDoc } from "../core/schemas";
import { stableHash } from "../core/theme";

/** Puck's item shape, as far as the editor needs it. */
export interface PuckItem {
  type: string;
  props: Record<string, unknown> & { id: string };
}

/** Puck's page data as the editor builds it. */
export interface EditorData {
  root: { props: EditorRootProps };
  content: PuckItem[];
}

export interface EditorRootProps {
  title: string;
  hideSiteChrome?: boolean;
  seo?: Seo;
  /** The site header's sections (slot). */
  header: PuckItem[];
  /** The site footer's sections (slot). */
  footer: PuckItem[];
  [key: string]: unknown;
}

/** Keys a section schema may not use: they carry the node's own fields. */
export const NODE_KEYS = ["_variant", "_hidden", "_hideOn", "_v", "_placeholder"] as const;

/** The Puck component name of a section's preset: `hero` for the first, `hero@1` for the second. */
export const presetComponentName = (type: string, index: number) => (index === 0 ? type : `${type}@${index}`);

/** The section type a Puck component name stands for. */
export const sectionTypeOf = (componentName: string) => componentName.split("@")[0]!;

type Lookup = (type: string) => AnySectionDefinition | undefined;
type SlotKeys = (type: string) => readonly string[];

const noSlots: SlotKeys = () => [];

const hideOnValue = (hideOn: readonly string[]): string => (hideOn.includes("mobile") && hideOn.includes("desktop") ? "both" : (hideOn[0] ?? "none"));

/** A node as a Puck item. Unknown types keep their props, so nothing is lost. */
export function nodeToItem(node: SectionNode, slotKeys: SlotKeys = noSlots): PuckItem {
  const props: Record<string, unknown> = { ...structuredClone(node.props) };
  for (const key of slotKeys(node.type)) {
    const nested = props[key];
    if (Array.isArray(nested)) props[key] = nested.map((n) => nodeToItem(n as SectionNode, slotKeys));
  }
  return {
    type: node.type,
    props: {
      ...props,
      id: node.id,
      _v: node.v,
      ...(node.variant ? { _variant: node.variant } : {}),
      _hidden: node.hidden === true,
      _hideOn: node.hideOn?.length ? hideOnValue(node.hideOn) : "none",
      ...(node.placeholder ? { _placeholder: true } : {}),
    },
  };
}

/**
 * Empty optional values out: `""`, and objects left with nothing in them
 * (an optional button whose fields were cleared). A required field that
 * empties is then reported by the section's schema, never saved as `""`.
 * Strings inside arrays stay (a list of lines keeps its blank line).
 */
export function pruneEmpty(value: unknown): unknown {
  if (typeof value === "string") return value === "" ? undefined : value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : (pruneEmpty(v) ?? {})));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const pruned = pruneEmpty(v);
      if (pruned !== undefined) out[k] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

const ARRAY_BOOKKEEPING = new Set(["_arrayId", "_originalIndex", "_currentIndex"]);

/** Puck's internal array bookkeeping, which never belongs in a document. */
function stripArrayIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripArrayIds);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!ARRAY_BOOKKEEPING.has(k)) out[k] = stripArrayIds(v);
    return out;
  }
  return value;
}

export interface FromItemOptions {
  lookup?: Lookup;
  slotKeys?: SlotKeys;
  /**
   * A hash of the props each template placeholder had when the editor
   * opened it (`placeholderSnapshot`), by section id. A placeholder stays one only while its props are unchanged:
   * editing it clears the flag.
   */
  placeholders?: ReadonlyMap<string, string>;
}

/** A Puck item as a node. */
export function itemToNode(item: PuckItem, options: FromItemOptions = {}): SectionNode {
  const lookup = options.lookup ?? getSection;
  const type = sectionTypeOf(item.type);
  const def = lookup(type);
  const { id, _variant, _hidden, _hideOn, _v, _placeholder, ...rest } = item.props as Record<string, unknown> & { id: string };
  const slotKeys = options.slotKeys ?? noSlots;
  const slots = new Set(slotKeys(type));
  const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !slots.has(k)));
  const props = (stripArrayIds(pruneEmpty(plain)) ?? {}) as Record<string, unknown>;
  for (const key of slots) {
    const nested = rest[key];
    props[key] = Array.isArray(nested) ? nested.map((n) => itemToNode(n as PuckItem, options)) : [];
  }
  const hideOn: ("mobile" | "desktop")[] | undefined =
    _hideOn === "both" ? ["mobile", "desktop"] : _hideOn === "mobile" || _hideOn === "desktop" ? [_hideOn] : undefined;
  const original = options.placeholders?.get(String(id));
  const placeholder = _placeholder === true && original !== undefined && original === placeholderHash(props);
  return {
    id: String(id),
    type,
    v: typeof _v === "number" ? _v : (def?.version ?? 1),
    ...(typeof _variant === "string" ? { variant: _variant } : def ? { variant: def.defaultVariant } : {}),
    ...(_hidden === true ? { hidden: true } : {}),
    ...(hideOn ? { hideOn } : {}),
    ...(placeholder ? { placeholder: true } : {}),
    props,
  };
}

/** A placeholder's props as `itemToNode` sees them (empty values out), in any key order. */
const placeholderHash = (props: Record<string, unknown>) => stableHash(stripArrayIds(pruneEmpty(props)) ?? {});

/** A hash of every placeholder node's props, to tell later whether it was edited. */
export function placeholderSnapshot(nodes: readonly SectionNode[], into = new Map<string, string>()): Map<string, string> {
  for (const n of nodes) if (n.placeholder) into.set(n.id, placeholderHash(n.props));
  return into;
}

/** A page (and its site's header and footer) as the editor's Puck data. */
export function toEditorData(page: PageDoc, site: Pick<SiteDoc, "header" | "footer">, slotKeys: SlotKeys = noSlots): EditorData {
  const { title, hideSiteChrome, ...restRoot } = page.root.props;
  return {
    root: {
      props: {
        ...restRoot,
        title,
        ...(hideSiteChrome ? { hideSiteChrome: true } : {}),
        ...(page.seo ? { seo: structuredClone(page.seo) } : {}),
        header: site.header.map((n) => nodeToItem(n, slotKeys)),
        footer: site.footer.map((n) => nodeToItem(n, slotKeys)),
      },
    },
    content: page.content.map((n) => nodeToItem(n, slotKeys)),
  };
}

export interface FromEditorResult {
  page: PageDoc;
  header: SectionNode[];
  footer: SectionNode[];
}

/** The editor's Puck data back as a page and the site's header and footer. */
export function fromEditorData(data: { root?: { props?: Record<string, unknown> }; content?: unknown[] }, options: FromItemOptions = {}): FromEditorResult {
  const rootProps = (data.root?.props ?? {}) as Partial<EditorRootProps>;
  const { header, footer, seo, title, hideSiteChrome, ...restRoot } = rootProps;
  const items = (list: unknown) => (Array.isArray(list) ? (list as PuckItem[]).map((i) => itemToNode(i, options)) : []);
  const cleanSeo = stripArrayIds(pruneEmpty(seo)) as Seo | undefined;
  const extra = (pruneEmpty(restRoot) ?? {}) as Record<string, unknown>;
  const page: PageDoc = {
    schemaVersion: 1,
    root: { props: { ...extra, title: typeof title === "string" ? title : "", ...(hideSiteChrome === true ? { hideSiteChrome: true } : {}) } },
    content: items(data.content),
    ...(cleanSeo ? { seo: cleanSeo } : {}),
  };
  return { page, header: items(header), footer: items(footer) };
}

/** The id of the section that gets the page's `h1`: the first visible one that provides it. */
export function h1SectionId(content: readonly PuckItem[], lookup: Lookup = getSection): string | null {
  for (const item of content) {
    if (item.props._hidden === true) continue;
    if (lookup(sectionTypeOf(item.type))?.providesH1) return item.props.id;
  }
  return null;
}

/** How many sections of each type the page holds, in every zone (for the Add picker's limits). */
export function countTypes(data: Pick<EditorData, "content"> & { root?: { props?: Partial<EditorRootProps> } }): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (items: readonly PuckItem[] | undefined) => {
    for (const item of items ?? []) {
      const type = sectionTypeOf(item.type);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  };
  add(data.content);
  add(data.root?.props?.header);
  add(data.root?.props?.footer);
  return counts;
}
