import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHref, useLocation, useParams } from "react-router";
import { parseForm, replay, type FormDefinition, type FormEvent, type Json as JsonValue } from "@marktiderman/genesis-forms";
import {
  ContextEditor,
  CoveragePanel,
  FlowMapPanel,
  Inspector,
  JsonView,
  LogicTracePanel,
  decodeShare,
  encodeShare,
  pretty,
} from "@marktiderman/genesis-forms-devtools";
import { Button } from "@marktiderman/genesis-ui/button";
import { Card, CardContent } from "@marktiderman/genesis-ui/card";
import { Label } from "@marktiderman/genesis-ui/label";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@marktiderman/genesis-ui/toggle-group";
import { cn } from "@marktiderman/genesis-ui/utils";
import { scenarios } from "../lib/forms";
import { isFrameMessage, type ShellToFrame } from "../lib/forms-frame-protocol";

type Layout = "focus" | "classic";
type Device = "phone" | "tablet" | "desktop";

// Spelled out so Tailwind's scanner sees every class.
const DEVICE_CLASS: Record<Device, string> = {
  phone: "w-[390px] h-[780px]",
  tablet: "w-[820px] h-[900px]",
  desktop: "w-full h-[780px]",
};

export default function FormsScenario() {
  const { scenario: id } = useParams();
  const { hash } = useLocation();
  const scenario = scenarios.find((s) => s.id === id) ?? scenarios[0]!;
  const frameSrc = useHref("/forms-frame");

  const [definition, setDefinition] = useState<FormDefinition>(scenario.form.definition);
  const [context, setContext] = useState<Record<string, JsonValue>>(scenario.context);
  const [layout, setLayout] = useState<Layout>(scenario.form.definition.layout?.mode ?? "focus");
  const [device, setDevice] = useState<Device>("phone");
  const [events, setEvents] = useState<FormEvent[]>([]);
  const [draft, setDraft] = useState(pretty(scenario.form.definition));
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [contextVersion, setContextVersion] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const startEvents = useRef<FormEvent[]>([]);

  // Reset when the scenario changes, or load a shared link.
  useEffect(() => {
    let cancelled = false;
    const reset = (def: FormDefinition, ctx: Record<string, JsonValue>, evts: FormEvent[], lay?: Layout) => {
      setDefinition(def);
      setDraft(pretty(def));
      setContext(ctx);
      setLayout(lay ?? def.layout?.mode ?? "focus");
      startEvents.current = evts;
      setEvents(evts);
      setLoadKey((k) => k + 1);
    };
    if (hash.startsWith("#d=")) {
      void decodeShare(hash).then((p) => {
        if (!cancelled && p) reset(p.definition, p.context ?? {}, p.events ?? [], p.layout);
      });
    } else {
      reset(scenario.form.definition, scenario.context, []);
    }
    return () => {
      cancelled = true;
    };
  }, [scenario, hash]);

  const send = useCallback(() => {
    const message: ShellToFrame = { type: "gf:load", definition, context, layout, events: startEvents.current };
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, [definition, context, layout]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      if (!isFrameMessage(e.data)) return;
      if (e.data.type === "gf:ready") send();
      else setEvents(e.data.events);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send]);

  // Push a new load whenever what the frame renders changes.
  useEffect(() => {
    send();
  }, [send, loadKey]);

  const restart = (evts: FormEvent[]) => {
    startEvents.current = evts;
    setEvents(evts);
    setLoadKey((k) => k + 1);
  };

  const loadWitness = (evts: FormEvent[], hidden?: Record<string, JsonValue>) => {
    if (hidden) {
      setContext((c) => ({ ...c, ...hidden }));
      setContextVersion((v) => v + 1);
    }
    restart(evts);
  };

  // The inspector reads a mirror engine rebuilt from the frame's event log.
  const mirror = useMemo(() => replay(definition, events, { hidden: context }), [definition, events, context]);
  const parsed = useMemo(() => {
    try {
      return parseForm(JSON.parse(draft));
    } catch (e) {
      return { ok: false as const, issues: [{ path: "", message: (e as Error).message }], warnings: [] };
    }
  }, [draft]);

  const share = async () => {
    // Playground data is made up, so links carry the context and meta too.
    const encoded = await encodeShare(
      { v: 1, definition, events, context, layout },
      { includeContext: true, includeMeta: true },
    );
    const url = `${window.location.origin}${window.location.pathname}#d=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied.");
    } catch {
      setShareStatus(url);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{scenario.title}</h2>
        <p className="text-sm text-muted-foreground">{scenario.description}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Layout</Label>
          <ToggleGroup type="single" variant="outline" value={layout} onValueChange={(v) => v && setLayout(v as Layout)}>
            <ToggleGroupItem value="focus">One at a time</ToggleGroupItem>
            <ToggleGroupItem value="classic">All on one page</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-1">
          <Label>Device</Label>
          <ToggleGroup type="single" variant="outline" value={device} onValueChange={(v) => v && setDevice(v as Device)}>
            <ToggleGroupItem value="phone">Phone</ToggleGroupItem>
            <ToggleGroupItem value="tablet">Tablet</ToggleGroupItem>
            <ToggleGroupItem value="desktop">Desktop</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Button variant="outline" onClick={() => restart([])}>
          Start over
        </Button>
        <Button variant="outline" onClick={() => void share()}>
          Copy share link
        </Button>
        {shareStatus ? (
          <span className="max-w-xs truncate text-sm text-muted-foreground" role="status">
            {shareStatus}
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[auto_minmax(0,1fr)]">
        <div className="overflow-auto">
          <iframe
            key={frameSrc}
            ref={frameRef}
            src={frameSrc}
            title={`${scenario.title} on a ${device}`}
            className={cn("rounded-xl border bg-background shadow-sm", DEVICE_CLASS[device])}
          />
        </div>
        <Card>
          <CardContent className="pt-6">
            <Inspector
              engine={mirror}
              context={context}
              onFork={restart}
              extraTabs={[
                { id: "flow", label: "Flow map", content: <FlowMapPanel engine={mirror} /> },
                { id: "trace", label: "Logic trace", content: <LogicTracePanel engine={mirror} /> },
                {
                  id: "coverage",
                  label: "Coverage",
                  content: <CoveragePanel definition={definition} onFork={loadWitness} />,
                },
                {
                  id: "context",
                  label: "Server context",
                  content: (
                    <ContextEditor
                      key={`${scenario.id}-${loadKey === 0 ? 0 : "x"}-${contextVersion}`}
                      value={context}
                      onChange={(next) => {
                        setContext(next);
                        restart(startEvents.current);
                      }}
                    />
                  ),
                },
                {
                  id: "definition",
                  label: "Definition",
                  content: (
                    <div className="space-y-2">
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={18}
                        className="font-mono text-xs"
                        aria-label="Form definition JSON"
                      />
                      <p className="text-sm text-muted-foreground">
                        {parsed.ok
                          ? `Valid${parsed.warnings.length ? `, ${parsed.warnings.length} warning(s)` : ""}.`
                          : `${parsed.issues.length} problem(s).`}
                      </p>
                      <JsonView value={parsed.ok ? parsed.warnings : parsed.issues} />
                      <Button
                        disabled={!parsed.ok}
                        onClick={() => {
                          if (!parsed.ok) return;
                          setDefinition(parsed.form);
                          restart([]);
                        }}
                      >
                        Apply definition
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
