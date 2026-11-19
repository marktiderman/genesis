/**
 * The context dump on the web: `webSections()` reads the browser (user
 * agent, viewport, screen, language, time zone, connection), the page's path
 * and whether the tab is in front, and the last console lines from a ring
 * buffer (`captureConsole`, started once when the sections are made).
 *
 *   const diagnostics = createDiagnostics({
 *     app: { id: "acme", name: "Acme", platform: "web" },
 *     transport: supabaseTransport(supabase),
 *     sections: webSections(),
 *     user: () => ({ id: session?.user.id, role }),
 *   });
 *   <FeedbackPanel client={support} diagnostics={diagnostics} />   // a dump with every report
 */
import { cleanRoute } from "../contract";
import { captureConsole, type ConsoleBuffer } from "../diagnostics/console";
import { defineDiagnosticSection, type DiagnosticSection } from "../diagnostics/report";

export interface WebSectionsOptions {
  /**
   * The console ring buffer: `true` (default) starts `captureConsole()` (the last 200 lines,
   * 1 KB each, scrubbed as they arrive); a buffer of your own; or `false` for none.
   */
  console?: boolean | ConsoleBuffer;
  /** The current route, if the router knows it better than `location.pathname`. */
  route?: () => string | null | undefined;
  /** The app's flags in effect. */
  flags?: () => Readonly<Record<string, unknown>> | null | undefined;
  /** The build: version, commit, release (from the bundler's env). */
  build?: () => Readonly<Record<string, unknown>> | null | undefined;
  /** The server's base URL (sent without its query). */
  baseUrl?: string | null;
}

interface ConnectionLike {
  effectiveType?: string;
  type?: string;
}

/** The browser's sections: `device`, `session`, `logs.console`, and `flags`, `build`, `server` when given. */
export function webSections(options: WebSectionsOptions = {}): DiagnosticSection[] {
  const buffer = options.console === false ? null : options.console === true || options.console === undefined ? captureConsole() : options.console;
  const sections: DiagnosticSection[] = [
    defineDiagnosticSection("device", () => {
      if (typeof window === "undefined" || typeof navigator === "undefined") return null;
      let timeZone: string | null = null;
      try {
        timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
      } catch {
        // no Intl here
      }
      const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection;
      return {
        os: "web",
        osVersion: null,
        model: null,
        userAgent: navigator.userAgent,
        locale: navigator.language ?? null,
        languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 5) : null,
        timeZone,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        screen: typeof screen === "undefined" ? null : { width: screen.width, height: screen.height, scale: window.devicePixelRatio },
        fontScale: null,
        network: { type: connection?.effectiveType ?? connection?.type ?? null, connected: typeof navigator.onLine === "boolean" ? navigator.onLine : null, reachable: null },
        permissions: null,
      };
    }),
    defineDiagnosticSection("session", () => {
      const path = options.route?.() ?? (typeof location === "undefined" ? null : location.pathname);
      return {
        route: cleanRoute(path ?? undefined) ?? null,
        foreground: typeof document === "undefined" ? null : document.visibilityState === "visible",
      };
    }),
  ];
  if (buffer) sections.push(defineDiagnosticSection("logs", () => ({ console: buffer.lines() })));
  if (options.flags) sections.push(defineDiagnosticSection("flags", () => ({ ...(options.flags?.() ?? {}) })));
  if (options.build) sections.push(defineDiagnosticSection("build", () => ({ ...(options.build?.() ?? {}) })));
  if (options.baseUrl) sections.push(defineDiagnosticSection("server", () => ({ baseUrl: options.baseUrl ?? null })));
  return sections;
}
