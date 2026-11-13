// `genesis client init`: give an app its client layer (ADR 0020), the one folder where its own
// layer over Genesis lives: the provider and defaults, its ResourceView wrapper, and a folder per
// record type with its view and its appearance. Pure planning, so it is tested on a fake project.

/** The client layer's folder when genesis.config.json doesn't name one. */
export const DEFAULT_CLIENT_DIR = "src/client";

export interface ClientInitOptions {
  /** The layer's folder, relative to the app. Default `src/client` (or genesis.config.json's `client.dir`). */
  dir?: string;
  /** A record type to start: `<dir>/<type>/view.ts` and `appearance.tsx`. Lowercase words and dashes. */
  type?: string;
}

export interface ClientFile {
  path: string;
  content: string;
}

export interface ClientInitPlan {
  dir: string;
  files: ClientFile[];
  /** What the person still has to do. */
  steps: string[];
}

const TYPE = /^[a-z][a-z0-9-]{0,39}$/;

/** `tasks` → `tasks`, `client-notes` → `clientNotes`. */
const camel = (name: string) => name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function layerFile(): string {
  return `// The app's client layer (ADR 0020): one provider for what every list and record page in the
// app shares. Mount <ClientLayer> once, near the root, inside GenesisProvider.
import type { ReactNode } from "react";
import { createLocalSavedViewStore, type SavedViewStore } from "@marktiderman/genesis-core/resource-view";
import { useBrowserSearchParams } from "@marktiderman/genesis-ui";
import { ResourceViewDefaultsProvider } from "@marktiderman/genesis-ui/data";

/**
 * Where saved views live. The device store keeps them in this browser; swap in a store over the
 * app's own table (list, save, remove, under row-level security) to share them across devices
 * and with a team.
 */
export const savedViews: SavedViewStore = createLocalSavedViewStore();

export function ClientLayer({ children }: { children: ReactNode }) {
  // The router's search-params adapter: a TanStack or React Router app passes its own hook's.
  const urlState = useBrowserSearchParams();
  return (
    <ResourceViewDefaultsProvider sizeColumns clipCells pagerJumps savedViews={savedViews} urlState={urlState} rowActions>
      {children}
    </ResourceViewDefaultsProvider>
  );
}
`;
}

function resourceViewFile(): string {
  return `// The app's ResourceView (ADR 0020): Genesis's, with the app's defaults. Screens render this one,
// never Genesis's directly, so a default the app changes reaches every list at once.
import { ResourceView as GenesisResourceView, type ResourceViewProps } from "@marktiderman/genesis-ui/data";

type Row = Record<string, unknown>;

export function ResourceView<T extends Row = Row>(props: ResourceViewProps<T>) {
  return <GenesisResourceView<T> createdToast {...props} />;
}

export type { ResourceViewProps };
`;
}

function viewFile(type: string): string {
  const name = camel(type);
  return `// The ${type} view (ADR 0020): what a ${type} record means to people. One view per resource; every
// screen of ${type} renders this one, narrowed by its own props.
import { defineView } from "@marktiderman/genesis-core/resource-view";
// import { contracts } from "../../lib/resources.genesis";

export const ${name}View = defineView(/* contracts["public.${type.replace(/-/g, "_")}"] */ undefined as never, {
  // fields: { status: { tones: { active: "success" } } },
  // segments: [{ id: "all", label: "All" }],
  // filters: [{ field: "status" }],
  // actions: [{ name: "archive", label: "Archive", bulk: true }],
  // export: true,
});
`;
}

function appearanceFile(type: string): string {
  const name = camel(type);
  return `// How a ${type} record looks (ADR 0020): its own cells, its card and its record page. Keep the
// rules in view.ts; this file draws.
import type { ReactNode } from "react";

type ${name[0]!.toUpperCase()}${name.slice(1)}Row = Record<string, unknown>;

/** Cells this type draws its own way, by column key (ResourceView's \`cells\`). */
export const ${name}Cells: Partial<Record<string, (row: ${name[0]!.toUpperCase()}${name.slice(1)}Row) => ReactNode>> = {};
`;
}

/**
 * The files `genesis client init` writes. Existing files are the caller's to keep: it lists them
 * and writes only what isn't there unless forced.
 */
export function planClientInit(options: ClientInitOptions = {}): ClientInitPlan {
  const dir = (options.dir ?? DEFAULT_CLIENT_DIR).replace(/^\.\//, "").replace(/\/+$/, "");
  if (!dir || dir.startsWith("/") || dir.split("/").includes("..")) throw new Error(`client init: "${options.dir}" isn't a folder inside the app`);
  if (options.type !== undefined && !TYPE.test(options.type)) throw new Error(`client init: the type "${options.type}" is lowercase letters, digits and dashes`);
  const files: ClientFile[] = [
    { path: `${dir}/client-layer.tsx`, content: layerFile() },
    { path: `${dir}/resource-view.tsx`, content: resourceViewFile() },
    { path: `${dir}/cells/index.ts`, content: "// Cells the app draws its own way, shared by its types (ADR 0020).\nexport {};\n" },
    { path: `${dir}/components/index.ts`, content: "// The app's own parts (ADR 0020): name each element's data-slot app-<name>.\nexport {};\n" },
    {
      path: `${dir}/view-types/index.ts`,
      content: "// View types the app registers (ADR 0021): defineViewType, then registerViewType once at start-up.\nexport {};\n",
    },
  ];
  if (options.type) {
    files.push({ path: `${dir}/${options.type}/view.ts`, content: viewFile(options.type) });
    files.push({ path: `${dir}/${options.type}/appearance.tsx`, content: appearanceFile(options.type) });
  }
  const steps = [
    `Mount <ClientLayer> from ${dir}/client-layer.tsx once, inside GenesisProvider.`,
    `Render ResourceView from ${dir}/resource-view.tsx in screens; genesis doctor warns (client/layer) where a screen renders Genesis's directly.`,
    ...(dir !== DEFAULT_CLIENT_DIR ? [`genesis.config.json now names the folder: { "client": { "dir": "${dir}" } }.`] : []),
  ];
  return { dir, files, steps };
}
