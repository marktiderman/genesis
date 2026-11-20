/**
 * The context dump on the phone: the sections that read the device and the
 * app (`nativeSections`), the observability block's errors, breadcrumbs and
 * Sentry ids (`observabilitySection`), and "Send diagnostics" for a
 * Development or About screen (`useSendDiagnostics`, `<SendDiagnosticsRow/>`).
 *
 *   const diagnostics = createDiagnostics({
 *     app: { id: "acme", name: "Acme" },
 *     transport: supabaseTransport(supabase),
 *     sections: [
 *       ...nativeSections({ application: Application, updates: Updates, device: Device, netInfo: NetInfo, buildMetadata }),
 *       observabilitySection(observability),
 *     ],
 *     user: () => ({ id: session?.user.id, role }),
 *   });
 *   createSupport({ …, diagnostics });    // a dump on shake and with every piece of feedback
 *
 * The native modules are passed in as the shapes used here (expo-application,
 * expo-updates, expo-device, @react-native-community/netinfo, permission
 * getters), so none is required and tests pass fakes.
 */
import { useCallback, useState } from "react";
import { Dimensions, PixelRatio, Platform, Share } from "react-native";
import { Inline, NativeButton, NativeInlineAlert, NativeText, Stack } from "@marktiderman/genesis-ui-native/components";
import { fill, resolveSupportCopy, type SupportCopy } from "../copy";
import type { Diagnostics, DiagnosticsDelivery } from "../diagnostics/create";
import { defineDiagnosticSection, type DiagnosticSection, type DiagnosticTrigger } from "../diagnostics/report";
import { useOptionalSupport } from "./support";

/** `expo-application`. */
export interface DiagnosticsApplicationLike {
  readonly nativeApplicationVersion: string | null;
  readonly nativeBuildVersion: string | null;
  readonly applicationId?: string | null;
}

/** `expo-updates`' constants. */
export interface DiagnosticsUpdatesLike {
  readonly isEnabled: boolean;
  readonly updateId: string | null;
  readonly channel: string | null;
  readonly runtimeVersion: string | null;
  readonly isEmbeddedLaunch: boolean;
  readonly isEmergencyLaunch?: boolean;
}

/** `expo-device`. */
export interface DiagnosticsDeviceLike {
  readonly modelName?: string | null;
  readonly osName?: string | null;
  readonly osVersion?: string | null;
  readonly brand?: string | null;
  readonly deviceYearClass?: number | null;
  readonly isDevice?: boolean;
}

/** `@react-native-community/netinfo`'s `fetch`. */
export interface DiagnosticsNetInfoLike {
  fetch(): Promise<{ type: string; isConnected: boolean | null; isInternetReachable?: boolean | null }>;
}

/** The commit, OTA number and release the app stamps at publish time (genesis-native's `BuildMetadata`). */
export interface DiagnosticsBuildMetadata {
  /** The app's version at build time (`genesis build-stamp`); the binary's own wins. */
  version?: string | null;
  /** The channel it was built or published for; expo-updates' own wins. */
  channel?: string | null;
  /** When it was built, ISO. */
  builtAt?: string | null;
  commit?: string | null;
  commitMessage?: string | null;
  branch?: string | null;
  otaNumber?: string | number | null;
  release?: string | null;
  publishedAt?: string | null;
}

export interface NativeSectionsOptions {
  application?: DiagnosticsApplicationLike;
  updates?: DiagnosticsUpdatesLike;
  /** The channel picked on this device (the updates block's `channels.requested`). */
  requestedChannel?: () => string | null | Promise<string | null>;
  device?: DiagnosticsDeviceLike;
  netInfo?: DiagnosticsNetInfoLike;
  /**
   * Permission probes by name (`notifications: async () => (await Notifications.getPermissionsAsync()).status`).
   * Each answers a state string (or `{ status }`) within `permissionTimeoutMs`, or reads `timeout` / `error`.
   */
  permissions?: Readonly<Record<string, () => Promise<string | { status: string }>>>;
  /** Default 1000 ms per probe. */
  permissionTimeoutMs?: number;
  buildMetadata?: DiagnosticsBuildMetadata | null;
  /** React Native's `AppState`, for `session.foreground`. */
  appState?: { readonly currentState: string | null | undefined };
  /** The app's flags and switches in effect, read when the dump is made. */
  flags?: () => Readonly<Record<string, unknown>> | null | undefined;
  /** The blocks in effect (`[...useBlocks().ids]`, kept in a ref). */
  blocks?: () => readonly string[] | null | undefined;
  /** The server: its base URL (sent without its query) and, optionally, its commit (a `/health` call). */
  server?: { baseUrl?: string | null; apiCommit?: () => string | null | Promise<string | null> };
  /** Default `Platform.OS`. */
  platform?: string;
}

declare const __DEV__: boolean | undefined;

const given = (value: unknown): string | null => (typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" && value.trim() ? value : null);

function timed<T>(work: () => Promise<T>, ms: number): Promise<T | "timeout"> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    work().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * The phone's sections (support-features 4.2): `build` (version, update, channel, commit, OTA
 * number, release), `device` (OS, model, locale, time zone, screen, font scale, network,
 * permission states, each probed with a timeout), `session` (foreground), `flags`, `blocks` and
 * `server`. The session's route and recent routes come from `createSupport({ diagnostics })`.
 */
export function nativeSections(options: NativeSectionsOptions = {}): DiagnosticSection[] {
  const platform = options.platform ?? Platform.OS;
  const sections: DiagnosticSection[] = [
    defineDiagnosticSection("build", async () => {
      const u = options.updates;
      const on = Boolean(u?.isEnabled);
      const meta = options.buildMetadata ?? null;
      let requested: string | null = null;
      try {
        requested = (await options.requestedChannel?.()) ?? null;
      } catch {
        requested = null;
      }
      return {
        version: given(options.application?.nativeApplicationVersion) ?? given(meta?.version),
        build: given(options.application?.nativeBuildVersion),
        bundleId: given(options.application?.applicationId),
        runtimeVersion: given(u?.runtimeVersion),
        channel: (on ? given(u?.channel) : null) ?? given(meta?.channel),
        requestedChannel: requested,
        updateId: on ? given(u?.updateId) : null,
        launch: !on ? "off" : u?.isEmbeddedLaunch ? "embedded" : "update",
        emergency: on ? u?.isEmergencyLaunch === true : false,
        commit: given(meta?.commit),
        commitMessage: given(meta?.commitMessage),
        branch: given(meta?.branch),
        otaNumber: given(meta?.otaNumber),
        release: given(meta?.release),
        releasePublishedAt: given(meta?.publishedAt),
        builtAt: given(meta?.builtAt),
        jsBundle: typeof __DEV__ !== "undefined" && __DEV__ ? "metro" : "release",
      };
    }),
    defineDiagnosticSection("device", async () => {
      const screen = Dimensions.get("screen");
      let locale: string | null = null;
      let timeZone: string | null = null;
      try {
        const resolved = Intl.DateTimeFormat().resolvedOptions();
        locale = resolved.locale ?? null;
        timeZone = resolved.timeZone ?? null;
      } catch {
        // no Intl here
      }
      let network: { type: string | null; connected: boolean | null; reachable: boolean | null } | null = null;
      const netInfo = options.netInfo;
      if (netInfo) {
        try {
          const state = await timed(() => netInfo.fetch(), options.permissionTimeoutMs ?? 1000);
          network = state === "timeout" ? { type: "timeout", connected: null, reachable: null } : { type: state.type ?? null, connected: state.isConnected ?? null, reachable: state.isInternetReachable ?? null };
        } catch {
          network = { type: "error", connected: null, reachable: null };
        }
      }
      let permissions: Record<string, string> | null = null;
      if (options.permissions) {
        const entries = await Promise.all(
          Object.entries(options.permissions).map(async ([name, probe]) => {
            try {
              const state = await timed(probe, options.permissionTimeoutMs ?? 1000);
              return [name, typeof state === "string" ? state : String(state.status)] as const;
            } catch {
              return [name, "error"] as const;
            }
          }),
        );
        permissions = Object.fromEntries(entries);
      }
      let fontScale: number | null = null;
      try {
        fontScale = PixelRatio.getFontScale();
      } catch {
        fontScale = null;
      }
      return {
        os: options.device?.osName ?? platform,
        osVersion: given(options.device?.osVersion) ?? String(Platform.Version ?? "") ?? null,
        model: given(options.device?.modelName),
        brand: given(options.device?.brand),
        isDevice: options.device?.isDevice ?? null,
        locale,
        timeZone,
        screen: { width: Math.round(screen.width), height: Math.round(screen.height), scale: screen.scale },
        fontScale,
        network,
        permissions,
      };
    }),
  ];
  if (options.appState) sections.push(defineDiagnosticSection("session", () => ({ foreground: options.appState?.currentState === "active" })));
  if (options.flags) sections.push(defineDiagnosticSection("flags", () => ({ ...(options.flags?.() ?? {}) })));
  if (options.blocks) sections.push(defineDiagnosticSection("blocks", () => [...(options.blocks?.() ?? [])]));
  if (options.server) {
    sections.push(
      defineDiagnosticSection("server", async () => ({
        baseUrl: options.server?.baseUrl ?? null,
        apiCommit: options.server?.apiCommit ? ((await options.server.apiCommit()) ?? null) : null,
      })),
    );
  }
  return sections;
}

/** The part of genesis-native's observability block a dump reads (`createObservability(…)`). */
export interface ObservabilityLike {
  readonly recent: {
    getState(): {
      breadcrumbs: readonly { category: string; message?: string; level?: string; data?: Readonly<Record<string, unknown>>; timestamp?: number }[];
      errors: readonly { at: number; name: string; message: string; source: string; fatal: boolean }[];
    };
  };
  lastEventId(): string | undefined;
  replayId(): string | undefined;
}

const iso = (ms: number | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/**
 * The observability block's recent errors and breadcrumbs (already scrubbed there; scrubbed
 * again here) and Sentry's last event id and replay id, so a dump links to the Sentry event.
 */
export function observabilitySection(observability: ObservabilityLike | null | undefined): DiagnosticSection {
  return defineDiagnosticSection(
    "observability",
    () => {
      if (!observability) return null;
      const recent = observability.recent.getState();
      return {
        logs: {
          errors: recent.errors.map((e) => ({ at: iso(e.at), name: e.name, message: e.message, source: e.source, fatal: e.fatal })),
          breadcrumbs: recent.breadcrumbs.map((c) => ({ at: iso(c.timestamp), category: c.category, message: c.message ?? null, level: c.level ?? null, data: c.data ? { ...c.data } : null })),
          console: [],
        },
        sentry: { lastEventId: observability.lastEventId() ?? null, replayId: observability.replayId() ?? null },
      };
    },
    { merge: true },
  );
}

export type SendDiagnosticsStatus = "idle" | "sending" | "sent" | "queued" | "failed";

export interface SendDiagnosticsState {
  status: SendDiagnosticsStatus;
  delivery: DiagnosticsDelivery | null;
  error: Error | null;
  /** Make and send a dump now (default trigger `manual`). Resolves null when it failed. */
  send(trigger?: DiagnosticTrigger): Promise<DiagnosticsDelivery | null>;
  reset(): void;
}

/** "Send diagnostics": the dump from `diagnostics`, or the support block's (`createSupport({ diagnostics })`). */
export function useSendDiagnostics(diagnostics?: Diagnostics | null): SendDiagnosticsState {
  const support = useOptionalSupport();
  const target = diagnostics ?? support?.diagnostics ?? null;
  const [status, setStatus] = useState<SendDiagnosticsStatus>("idle");
  const [delivery, setDelivery] = useState<DiagnosticsDelivery | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const send = useCallback(
    async (trigger: DiagnosticTrigger = "manual") => {
      if (!target) {
        setError(new Error("useSendDiagnostics: no diagnostics. Pass one, or createSupport({ diagnostics })."));
        setStatus("failed");
        return null;
      }
      setStatus("sending");
      setError(null);
      try {
        const result = await target.send({ trigger });
        setDelivery(result);
        setStatus(result.queued ? "queued" : "sent");
        return result;
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus("failed");
        return null;
      }
    },
    [target],
  );
  const reset = useCallback(() => {
    setStatus("idle");
    setDelivery(null);
    setError(null);
  }, []);
  return { status, delivery, error, send, reset };
}

export interface SendDiagnosticsRowProps {
  /** Default the support block's. */
  diagnostics?: Diagnostics | null;
  /** Copies the id (expo-clipboard's `setStringAsync`). Default the share sheet, which has Copy. */
  copy?: (text: string) => unknown;
  /** Default the support block's copy, or English. */
  copyText?: SupportCopy["diagnostics"];
  /** Hide the line under the button that says what is sent. */
  hideHint?: boolean;
  testID?: string;
}

/**
 * A "Send diagnostics" row for a Development or About screen: sends the dump, then shows the
 * short id to quote to support, with "Copy id".
 */
export function SendDiagnosticsRow({ diagnostics, copy, copyText, hideHint = false, testID = "genesis-support-send-diagnostics" }: SendDiagnosticsRowProps) {
  const support = useOptionalSupport();
  const text = copyText ?? support?.copy.diagnostics ?? resolveSupportCopy().diagnostics;
  const { status, delivery, send } = useSendDiagnostics(diagnostics);
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    if (!delivery) return;
    const value = `${delivery.shortId} (${delivery.id})`;
    await (copy ? copy(value) : Share.share({ message: value }));
    setCopied(true);
  };
  return (
    <Stack gap="sm" testID={testID}>
      <NativeButton
        variant="outline"
        size="sm"
        loading={status === "sending"}
        disabled={status === "sending"}
        onPress={() => {
          setCopied(false);
          void send("manual");
        }}
        testID={`${testID}-send`}
      >
        {status === "sending" ? text.sending : text.send}
      </NativeButton>
      {status === "sent" || status === "queued" ? (
        <Inline gap="sm">
          <NativeText preset="body-sm" selectable className="flex-1" testID={`${testID}-id`}>
            {fill(status === "sent" ? text.sent : text.queued, { id: delivery?.shortId ?? "" })}
          </NativeText>
          <NativeButton variant="ghost" size="sm" onPress={() => void doCopy()} testID={`${testID}-copy`}>
            {copied ? text.copied : text.copy}
          </NativeButton>
        </Inline>
      ) : null}
      {status === "failed" ? <NativeInlineAlert variant="destructive" description={text.failed} testID={`${testID}-failed`} /> : null}
      {hideHint ? null : (
        <NativeText preset="body-sm" className="text-muted-foreground">
          {text.hint}
        </NativeText>
      )}
    </Stack>
  );
}
