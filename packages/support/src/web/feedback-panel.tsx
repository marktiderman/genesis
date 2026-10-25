/**
 * The web feedback panel, built from Genesis UI: a "New" tab (type, message,
 * an optional screenshot of the tab with pen marks and hidden areas, an
 * optional pin on the page) and a "My reports" tab (the person's reports and
 * their status). Loading, empty and failed reads are told apart.
 *
 * Put it anywhere (a page, a Sheet); `FeedbackLauncher` puts it in a Sheet
 * behind a floating button.
 */
import { useEffect, useMemo, useState, type PointerEvent } from "react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@marktiderman/genesis-ui";
import type { SupportClient, SupportReport } from "../client";
import { resolveSupportCopy, type SupportCopyOverrides } from "../copy";
import { cleanRoute } from "../contract";
import { createContextCollector, FEEDBACK_TYPES, type ContextCollector, type FeedbackDelivery, type FeedbackSink, type FeedbackType } from "../record";
import { annotateScreenshot, canCaptureScreenshot, captureScreenshot, type Redaction, type Stroke, type WebCapture } from "./capture";
import { pickPin, type FeedbackPin } from "./pin";

/** The default web collector: the path (never the query string), `web`, and the viewport and language. */
export function webContextCollector(options: { appVersion?: string } = {}): ContextCollector {
  return createContextCollector({
    appVersion: options.appVersion,
    platform: "web",
    route: () => (typeof location === "undefined" ? undefined : cleanRoute(location.pathname)),
    device: () =>
      typeof window === "undefined"
        ? undefined
        : { viewport: { width: window.innerWidth, height: window.innerHeight }, pixelRatio: window.devicePixelRatio, language: navigator.language },
  });
}

export interface FeedbackPanelProps {
  /** Where feedback goes. A support client also fills "My reports". */
  client: FeedbackSink & Partial<Pick<SupportClient, "myReports">>;
  collector?: ContextCollector;
  copy?: SupportCopyOverrides;
  /** Offer a screenshot of the tab. Default: when the browser can capture. */
  screenshots?: boolean;
  /** Offer a pin on the page. Default on. */
  pins?: boolean;
  defaultType?: FeedbackType;
  onSent?: (delivery: FeedbackDelivery) => void;
  /** Hidden while the person picks a pin or the browser asks to capture, so the page shows. */
  onHide?: (hidden: boolean) => void;
}

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; dropped: number } | { kind: "error"; message: string };

export function FeedbackPanel({ client, collector, copy: overrides, screenshots, pins = true, defaultType = "bug", onSent, onHide }: FeedbackPanelProps) {
  const copy = useMemo(() => resolveSupportCopy(overrides), [overrides]);
  const collect = useMemo(() => collector ?? webContextCollector(), [collector]);
  const [type, setType] = useState<FeedbackType>(defaultType);
  const [message, setMessage] = useState("");
  const [shot, setShot] = useState<WebCapture | null>(null);
  const [pin, setPin] = useState<FeedbackPin | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const canShoot = screenshots ?? canCaptureScreenshot();

  const takeScreenshot = async () => {
    onHide?.(true);
    try {
      setShot(await captureScreenshot());
    } finally {
      onHide?.(false);
    }
  };

  const placePin = async () => {
    onHide?.(true);
    try {
      setPin(await pickPin());
    } finally {
      onHide?.(false);
    }
  };

  const send = async () => {
    if (!message.trim()) {
      setStatus({ kind: "error", message: copy.feedback.messageRequired });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const context = await collect.collect();
      if (pin) context.extra = { ...context.extra, pin };
      const delivery = await client.submit({
        type,
        message: message.trim(),
        context,
        attachments: shot ? [{ kind: "screenshot", contentType: shot.contentType, base64: shot.dataUrl, width: shot.width, height: shot.height }] : [],
      });
      setStatus({ kind: "sent", dropped: delivery.attachmentsDropped });
      setMessage("");
      setShot(null);
      setPin(null);
      onSent?.(delivery);
    } catch (error) {
      const limited = (error as { code?: string }).code === "GS429";
      setStatus({ kind: "error", message: limited ? copy.feedback.rateLimited : copy.feedback.failedBody });
    }
  };

  return (
    <Tabs defaultValue="new" className="flex flex-col gap-4" data-testid="genesis-support-panel">
      <TabsList>
        <TabsTrigger value="new">{copy.feedback.title}</TabsTrigger>
        {client.myReports ? <TabsTrigger value="mine">{copy.inbox.sectionTitle}</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="new" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>{copy.feedback.typeLabel}</Label>
          <ToggleGroup type="single" value={type} onValueChange={(v: string) => v && setType(v as FeedbackType)} aria-label={copy.feedback.typeLabel}>
            {FEEDBACK_TYPES.map((t) => (
              <ToggleGroupItem key={t} value={t} data-testid={`genesis-support-type-${t}`}>
                {copy.feedback.types[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="genesis-support-message">{copy.feedback.messageLabel}</Label>
          <Textarea
            id="genesis-support-message"
            data-testid="genesis-support-message"
            value={message}
            maxLength={20000}
            rows={5}
            placeholder={copy.feedback.messagePlaceholder}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        {canShoot || pins ? (
          <div className="flex flex-wrap gap-2">
            {canShoot && !shot ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void takeScreenshot()} data-testid="genesis-support-capture">
                {copy.feedback.screenshotLabel}
              </Button>
            ) : null}
            {pins ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void placePin()} data-testid="genesis-support-pin">
                {pin ? copy.feedback.pinned : copy.feedback.pin}
              </Button>
            ) : null}
          </div>
        ) : null}
        {shot ? <ScreenshotEditor shot={shot} onChange={setShot} onRemove={() => setShot(null)} copy={copy} /> : null}
        {status.kind === "error" ? (
          <Alert variant="destructive" data-testid="genesis-support-error">
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        ) : null}
        {status.kind === "sent" ? (
          <Alert data-testid="genesis-support-sent">
            <AlertDescription>{status.dropped ? copy.feedback.sentWithoutScreenshot : copy.feedback.sentBody}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="button" onClick={() => void send()} disabled={status.kind === "sending"} data-testid="genesis-support-send">
          {status.kind === "sending" ? copy.feedback.sending : copy.feedback.send}
        </Button>
      </TabsContent>
      {client.myReports ? (
        <TabsContent value="mine">
          <MyReports load={client.myReports} copy={copy} refreshKey={status.kind === "sent" ? 1 : 0} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

function MyReports({ load, copy, refreshKey }: { load: NonNullable<SupportClient["myReports"]>; copy: ReturnType<typeof resolveSupportCopy>; refreshKey: number }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; reports: SupportReport[] }>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    load()
      .then((reports) => alive && setState({ kind: "ok", reports }))
      .catch(() => alive && setState({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [load, refreshKey]);
  if (state.kind === "loading") return <p className="text-sm text-muted-foreground" data-testid="genesis-support-mine-loading">…</p>;
  if (state.kind === "error")
    return (
      <Alert variant="destructive" data-testid="genesis-support-mine-error">
        <AlertDescription>{copy.feedback.failedBody}</AlertDescription>
      </Alert>
    );
  if (!state.reports.length)
    return (
      <div data-testid="genesis-support-mine-empty" className="flex flex-col gap-1">
        <p className="font-medium">{copy.inbox.emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{copy.inbox.emptyBody}</p>
      </div>
    );
  return (
    <ul className="flex flex-col divide-y" data-testid="genesis-support-mine">
      {state.reports.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2">
          <span className="truncate">{r.title || r.message}</span>
          <span className="flex shrink-0 items-center gap-2">
            {r.unread ? <Badge>{copy.inbox.unread}</Badge> : null}
            <Badge variant="secondary">{copy.status[r.status]}</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The captured tab, with pen strokes and hidden (solid) areas drawn on it. */
function ScreenshotEditor({ shot, onChange, onRemove, copy }: { shot: WebCapture; onChange: (s: WebCapture) => void; onRemove: () => void; copy: ReturnType<typeof resolveSupportCopy> }) {
  const [tool, setTool] = useState<"pen" | "hide">("pen");
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; points: Stroke } | null>(null);
  const point = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const finish = async (end: { x: number; y: number }) => {
    if (!drag) return;
    const strokes: Stroke[] = tool === "pen" ? [[...drag.points, end]] : [];
    const redactions: Redaction[] =
      tool === "hide"
        ? [{ x: Math.min(drag.start.x, end.x), y: Math.min(drag.start.y, end.y), width: Math.abs(end.x - drag.start.x), height: Math.abs(end.y - drag.start.y) }]
        : [];
    setDrag(null);
    onChange(await annotateScreenshot(shot, { strokes, redactions }));
  };
  return (
    <div className="flex flex-col gap-2" data-testid="genesis-support-screenshot">
      <div className="flex items-center justify-between gap-2">
        <Label>{copy.feedback.screenshotLabel}</Label>
        <div className="flex gap-2">
          <ToggleGroup type="single" size="sm" value={tool} onValueChange={(v: string) => v && setTool(v as "pen" | "hide")}>
            <ToggleGroupItem value="pen">{copy.annotate.pen}</ToggleGroupItem>
            <ToggleGroupItem value="hide">{copy.annotate.hide}</ToggleGroupItem>
          </ToggleGroup>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} data-testid="genesis-support-remove-screenshot">
            {copy.feedback.removeScreenshot}
          </Button>
        </div>
      </div>
      <div
        className="relative cursor-crosshair touch-none overflow-hidden rounded-md border"
        onPointerDown={(e) => {
          const p = point(e);
          setDrag({ start: p, points: [p] });
        }}
        onPointerMove={(e) => drag && tool === "pen" && setDrag({ ...drag, points: [...drag.points, point(e)] })}
        onPointerUp={(e) => void finish(point(e))}
      >
        <img src={shot.dataUrl} alt={copy.feedback.screenshotLabel} className="block w-full select-none" draggable={false} />
      </div>
      <p className="text-xs text-muted-foreground">{copy.feedback.screenshotHint}</p>
    </div>
  );
}
