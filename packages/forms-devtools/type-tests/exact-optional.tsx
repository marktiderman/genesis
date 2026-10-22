// Compiled against the built .d.ts with exactOptionalPropertyTypes on: a
// host's own optional props pass straight through to the devtools.
import type { ErrorInfo } from "react";
import type { FormDefinition, FormEngine, FormEvent, Json } from "@marktiderman/genesis-forms";
import {
  ContextEditor,
  CoveragePanel,
  ErrorBoundary,
  FlowMapPanel,
  Inspector,
  JsonView,
  LogicTracePanel,
  ServerPanel,
  StatePanel,
  TimelinePanel,
  encodeShare,
  pretty,
  type InspectorTab,
} from "@marktiderman/genesis-forms-devtools";

declare const engine: FormEngine;
declare const definition: FormDefinition;
declare const context: Record<string, Json>;
declare const maybe: {
  label?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
  context?: Record<string, Json>;
  onFork?: (events: FormEvent[]) => void;
  onForkHidden?: (events: FormEvent[], hidden?: Record<string, Json>) => void;
  extraTabs?: InspectorTab[];
  defaultTab?: string;
  className?: string;
  autoRunFields?: number;
  maxStates?: number;
  reveal?: boolean;
  height?: number;
  blockId?: string;
  debounceMs?: number;
  maxDepth?: number;
  includeContext?: boolean;
  events?: FormEvent[];
};

export const views = (
  <>
    <ErrorBoundary label={maybe.label} onError={maybe.onError}>
      <Inspector
        engine={engine}
        context={maybe.context}
        onFork={maybe.onFork}
        extraTabs={maybe.extraTabs}
        defaultTab={maybe.defaultTab}
        className={maybe.className}
      />
    </ErrorBoundary>
    <CoveragePanel definition={definition} onFork={maybe.onForkHidden} autoRunFields={maybe.autoRunFields} maxStates={maybe.maxStates} />
    <JsonView value={definition} className={maybe.className} />
    <StatePanel engine={engine} reveal={maybe.reveal} />
    <TimelinePanel engine={engine} onFork={maybe.onFork} reveal={maybe.reveal} />
    <ServerPanel engine={engine} context={context} reveal={maybe.reveal} />
    <ContextEditor value={context} onChange={() => {}} debounceMs={maybe.debounceMs} />
    <FlowMapPanel engine={engine} height={maybe.height} className={maybe.className} />
    <LogicTracePanel engine={engine} blockId={maybe.blockId} />
  </>
);

export const text = pretty(definition, { maxDepth: maybe.maxDepth });
export const link = encodeShare({ v: 1, definition, events: maybe.events }, { includeContext: maybe.includeContext });
