// =====================================================================
// attachGitdata — Node-only. Minimum wiring to bind markdown tables.
// =====================================================================

import type { Registry } from "./registry";
import {
  GitdataAdapter,
  type GitdataAdapterConfig,
  type GitdataResourceMap,
} from "./adapters/gitdata";
import { gitdataMdContract, gitdataResourceName } from "./gitdata-names";

export interface AttachGitdataOptions {
  readonly dataRoot: string;
  readonly tables: readonly string[];
  readonly filenames?: Readonly<Record<string, string>>;
}

export function attachGitdata(registry: Registry, opts: AttachGitdataOptions): string[] {
  const resources: Record<string, GitdataResourceMap> = {};
  const names: string[] = [];

  for (const table of opts.tables) {
    const name = gitdataResourceName(table);
    names.push(name);
    resources[name] = {
      dir: table,
      ...(opts.filenames?.[table] ? { filename: opts.filenames[table] } : {}),
    };
    registry.register(
      gitdataMdContract(name, {
        description: `Gitdata table data/${table}/ (markdown rows).`,
      }),
    );
    registry.bindResource(name, "gitdata");
  }

  const config: GitdataAdapterConfig = {
    dataRoot: opts.dataRoot,
    resources,
  };
  registry.useAdapter(new GitdataAdapter(config));
  return names;
}

export {
  GitdataAdapter,
  type GitdataAdapterConfig,
  type GitdataResourceMap,
} from "./adapters/gitdata";
export { gitdataMdContract, gitdataResourceName } from "./gitdata-names";
