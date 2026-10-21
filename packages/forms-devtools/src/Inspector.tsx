import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Label } from "@marktiderman/genesis-ui/label";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";
import { cn } from "@marktiderman/genesis-ui/utils";
import type { FormEngine, FormEvent, Json } from "@marktiderman/genesis-forms";
import { useFormSelector } from "@marktiderman/genesis-forms-react";
import { ErrorBoundary } from "./ErrorBoundary";
import { ServerPanel, StatePanel, TimelinePanel } from "./panels";
import { sensitiveIds } from "./util";

export interface InspectorTab {
  id: string;
  label: string;
  content: ReactNode;
}

export interface InspectorProps {
  engine: FormEngine;
  /** Server-resolved context passed to the server check. */
  context?: Record<string, Json>;
  /** Restart the form from an event prefix (timeline "Continue from here"). */
  onFork?: (events: FormEvent[]) => void;
  /** Extra tabs from the host: definition editor, flow map, coverage… */
  extraTabs?: InspectorTab[];
  defaultTab?: string;
  className?: string;
}

// A stable default, so the server check is not recomputed on every render.
const EMPTY: Record<string, Json> = {};

/**
 * The Genesis Forms inspector: state, event timeline with time travel, and the
 * server check. Answers to sensitive fields are masked until "Reveal sensitive
 * values" is switched on. Each tab renders inside an error boundary, so a
 * hostile value shows a message instead of taking the page down.
 */
export function Inspector({ engine, context = EMPTY, onFork, extraTabs = [], defaultTab = "state", className }: InspectorProps) {
  const status = useFormSelector(engine, (s) => s.status);
  const count = useFormSelector(engine, (s) => s.events.length);
  const hasSensitive = useMemo(() => sensitiveIds(engine.definition).size > 0, [engine.definition]);
  const [reveal, setReveal] = useState(false);
  const guard = (content: ReactNode) => (
    <ErrorBoundary resetKey={engine} label="This panel">
      {content}
    </ErrorBoundary>
  );
  return (
    <section className={cn("space-y-3", className)} aria-label="Form inspector">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Inspector</h2>
        <Badge variant="outline">{status === "completed" ? "completed" : "in progress"}</Badge>
        {hasSensitive ? (
          <span className="ml-auto flex items-center gap-2">
            <Switch id="gf-reveal" checked={reveal} onCheckedChange={setReveal} />
            <Label htmlFor="gf-reveal">Reveal sensitive values</Label>
          </span>
        ) : null}
      </div>
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="state">State</TabsTrigger>
          <TabsTrigger value="timeline">Timeline ({count})</TabsTrigger>
          <TabsTrigger value="server">Server check</TabsTrigger>
          {extraTabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="state">{guard(<StatePanel engine={engine} reveal={reveal} />)}</TabsContent>
        <TabsContent value="timeline">{guard(<TimelinePanel engine={engine} onFork={onFork} reveal={reveal} />)}</TabsContent>
        <TabsContent value="server">{guard(<ServerPanel engine={engine} context={context} reveal={reveal} />)}</TabsContent>
        {extraTabs.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            {guard(t.content)}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
