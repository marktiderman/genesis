/**
 * The HTTP client for the `genesis-support-intake` Edge Function: the wire
 * contract (boot, submit, list) for code that doesn't hold a supabase-js
 * client, such as a script-tag web loader or another backend. Zero
 * dependencies, global `fetch`.
 */
import {
  CONTRACT_VERSION,
  WIDGET_HEADERS,
  type BootConfig,
  type FeedbackOp,
  type FeedbackReportSummary,
  type SubmitFeedbackInput,
  type SubmitFeedbackResult,
} from "./contract";
import type { FeedbackSink } from "./record";

export interface IntakeClientConfig {
  /** The app's Supabase URL (`https://<project>.supabase.co`, or the local one). */
  endpoint: string;
  /** The publishable key, sent as `apikey` and `x-genesis-key` (an identifier, not a secret). */
  publishableKey: string;
  /** The signed-in person's access token, read per request. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** The function's name, if you deployed it under another. */
  functionName?: string;
  fetchImpl?: typeof fetch;
}

/** A non-2xx answer (`status` 0: it never arrived). `code` is the function's `error`. */
export class IntakeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "IntakeError";
  }
}

export interface IntakeClient {
  boot(signal?: AbortSignal): Promise<BootConfig>;
  submit(input: SubmitFeedbackInput, signal?: AbortSignal): Promise<SubmitFeedbackResult>;
  list(signal?: AbortSignal): Promise<FeedbackReportSummary[]>;
}

export function createIntakeClient(config: IntakeClientConfig): IntakeClient {
  const url = `${config.endpoint.replace(/\/$/, "")}/functions/v1/${config.functionName ?? "genesis-support-intake"}`;
  const f = config.fetchImpl ?? fetch;

  async function headers(): Promise<Record<string, string>> {
    const token = await config.getAccessToken?.();
    return {
      apikey: config.publishableKey,
      [WIDGET_HEADERS.key]: config.publishableKey,
      [WIDGET_HEADERS.contract]: String(CONTRACT_VERSION),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  async function send<T>(init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await f(url, init);
    } catch (error) {
      throw new IntakeError(error instanceof Error ? error.message : "network request failed", 0, "transport_error");
    }
    if (!res.ok) {
      let code: string | undefined;
      try {
        code = ((await res.json()) as { error?: string }).error;
      } catch {
        // not JSON
      }
      throw new IntakeError(code ?? `${res.status} ${res.statusText}`, res.status, code);
    }
    return (await res.json()) as T;
  }

  const post = async <T,>(op: FeedbackOp, args: object, signal?: AbortSignal) =>
    // `op` last, so an `op` in args can never pick the operation.
    send<T>({ method: "POST", headers: { ...(await headers()), "content-type": "application/json" }, body: JSON.stringify({ ...args, op }), signal });

  return {
    boot: async (signal) => send<BootConfig>({ method: "GET", headers: await headers(), signal }),
    submit: (input, signal) => post<SubmitFeedbackResult>("submit", input, signal),
    list: (signal) => post<FeedbackReportSummary[]>("list", {}, signal),
  };
}

/**
 * A sink over the intake function. The function takes no screenshots (they
 * go to storage with a session), so attachments are reported as dropped.
 */
export function createIntakeSink(client: IntakeClient): FeedbackSink {
  return {
    async submit(record) {
      const result = await client.submit({
        type: record.type,
        title: record.title,
        body: record.message,
        route: record.context.route,
        appVersion: record.context.appVersion,
        envType: record.context.platform,
        context: record.context.extra,
      });
      return { id: result.reportId, attachmentsDropped: record.attachments?.length ?? 0 };
    },
  };
}
