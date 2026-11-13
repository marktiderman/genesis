"use client";

// View types (ADR 0021): how a view shows. ResourceView dispatches `type` through this registry,
// so an app adds its own (a timeline, a map) beside Genesis's table, list, grid, board, calendar
// and gallery, and every screen picks it the same way: <ResourceView view={v} type="timeline" />.

import type { ComponentType } from "react";
import type { ResourceViewProps } from "./ResourceView";

type Row = Record<string, unknown>;

/**
 * The view types Genesis ships. An app's own are any other lowercase name it registers.
 *
 * @stability Beta
 */
export type BuiltInViewType = "table" | "list" | "grid" | "board" | "calendar" | "gallery" | "inbox" | "sheet";

/**
 * A view type's name: a built-in one, or one an app registered (`"timeline"`). An unregistered
 * name throws when the view renders, naming the registered ones.
 *
 * @stability Beta
 */
export type ViewTypeName = BuiltInViewType | (string & {});

/** What `defineViewType` accepts. @stability Beta */
export interface ViewTypeDefinition {
  /** Lowercase letters, digits and hyphens: `"timeline"`. */
  id: string;
  /** Its name in words, for a type switcher. Default the id in title case. */
  label?: string;
  /**
   * Draws a view as this type. It gets the screen's ResourceView props (the view, `filter`,
   * `preset`, `open`, `cells`…); `useViewListParams`, `useViewList`, `useViewBoard` and
   * `useViewCalendarRange` give it the view's data, scope and permissions, and `<CustomView>`
   * its loading, empty and error states.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any row type
  render: ComponentType<ResourceViewProps<any>>;
}

/** A defined view type: frozen. @stability Beta */
export interface ViewType {
  readonly id: string;
  readonly label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any row type
  readonly render: ComponentType<ResourceViewProps<any>>;
  /** Genesis's own (table, list, grid, board, calendar, gallery, inbox). */
  readonly builtIn: boolean;
}

const ID = /^[a-z][a-z0-9-]{0,39}$/;
const registry = new Map<string, ViewType>();

function titleCase(id: string): string {
  return id.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * A view type an app adds (ADR 0021): a name and the component that draws a view that way.
 * Register it once at start-up with {@link registerViewType}.
 *
 * ```tsx
 * export const timelineType = defineViewType({ id: "timeline", label: "Timeline", render: Timeline });
 * registerViewType(timelineType);
 * <ResourceView view={sessionsView} type="timeline" />;
 * ```
 *
 * Throws for an id that isn't lowercase letters, digits and hyphens, or a `render` that isn't a component.
 *
 * @stability Beta
 */
export function defineViewType(definition: ViewTypeDefinition): ViewType {
  return makeViewType(definition, false);
}

function makeViewType(definition: ViewTypeDefinition, builtIn: boolean): ViewType {
  const problems: string[] = [];
  if (typeof definition?.id !== "string" || !ID.test(definition.id)) problems.push(`id "${String(definition?.id)}" is lowercase letters, digits and hyphens, starting with a letter`);
  if (typeof definition?.render !== "function" && !(typeof definition?.render === "object" && definition.render !== null)) problems.push("render isn't a component");
  if (definition?.label !== undefined && (typeof definition.label !== "string" || !definition.label.trim())) problems.push("label is empty");
  if (problems.length) throw new Error(`defineViewType: ${problems.join("; ")}`);
  return Object.freeze({ id: definition.id, label: definition.label ?? titleCase(definition.id), render: definition.render, builtIn });
}

/**
 * Make a view type available to every `<ResourceView type>` in the app. Returns a function that
 * removes it again (tests, a module unloaded). Registering a second type under a taken id throws
 * unless `replace` is set; a built-in type can't be replaced.
 *
 * @stability Beta
 */
export function registerViewType(type: ViewType, options: { replace?: boolean } = {}): () => void {
  if (!type || typeof type.id !== "string" || typeof type.render === "undefined") throw new Error("registerViewType: pass a view type from defineViewType");
  const existing = registry.get(type.id);
  if (existing && existing !== type) {
    if (existing.builtIn) throw new Error(`registerViewType: "${type.id}" is a built-in view type; give yours another name`);
    if (!options.replace) throw new Error(`registerViewType: "${type.id}" is already registered; pass { replace: true } to replace it`);
  }
  registry.set(type.id, type);
  return () => {
    if (registry.get(type.id) === type && !type.builtIn) registry.delete(type.id);
  };
}

/** Genesis's own types, registered by ResourceView. @internal */
export function registerBuiltInViewType(definition: ViewTypeDefinition): ViewType {
  const type = makeViewType(definition, true);
  registry.set(type.id, type);
  return type;
}

/** A registered view type by name, or undefined. @stability Beta */
export function resolveViewType(id: string): ViewType | undefined {
  return registry.get(id);
}

/** Every registered view type, built-ins first, in the order registered. @stability Beta */
export function listViewTypes(): readonly ViewType[] {
  const all = [...registry.values()];
  return Object.freeze([...all.filter((t) => t.builtIn), ...all.filter((t) => !t.builtIn)]);
}
