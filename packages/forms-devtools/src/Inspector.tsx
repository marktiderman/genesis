import type { ReactNode } from "react";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";
import { cn } from "@marktiderman/genesis-ui/utils";
import type { FormEngine, FormEvent, Json } from "@marktiderman/genesis-forms";
import { useFormSelector } from "@marktiderman/genesis-forms-react";
import { ServerPanel, StatePanel, TimelinePanel } from "./panels";

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

/** The Genesis Forms inspector: state, event timeline with time travel, and the server check. */
export function Inspector({ engine, context = {}, onFork, extraTabs = [], defaultTab = "state", className }: InspectorProps) {
  const status = useFormSelector(engine, (s) => s.status);
  const count = useFormSelector(engine, (s) => s.events.length);
  return (
    <section className={cn("space-y-3", className)} aria-label="Form inspector">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Inspector</h2>
        <Badge variant="outline">{status === "completed" ? "completed" : "in progress"}</Badge>
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
        <TabsContent value="state">
          <StatePanel engine={engine} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelinePanel engine={engine} onFork={onFork} />
        </TabsContent>
        <TabsContent value="server">
          <ServerPanel engine={engine} context={context} />
        </TabsContent>
        {extraTabs.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
