// @feat:chat
/**
 * Speech-to-text providers behind `Transcriber`. A failed call throws with
 * the HTTP status only (an error body can echo the request), so the runner
 * retries it.
 */
import type { TranscribeInput, TranscribeResult, Transcriber } from "./types";

const TIMEOUT_MS = 120_000;

async function failed(name: string, response: Response): Promise<never> {
  await response.body?.cancel().catch(() => {});
  throw new Error(`${name} answered HTTP ${response.status}`);
}

export interface DeepgramOptions {
  apiKey: string;
  /** Default `nova-3`. */
  model?: string | undefined;
  fetch?: typeof fetch | undefined;
}

/**
 * Deepgram pre-recorded transcription by URL
 * (https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded):
 * `POST /v1/listen?model=…&smart_format=true&detect_language=true` with
 * `{ url }` and `Authorization: Token <key>`; Deepgram fetches the file itself.
 */
export function deepgramTranscriber(options: DeepgramOptions): Transcriber {
  const fetchFn = options.fetch ?? fetch;
  const model = options.model ?? "nova-3";
  return {
    name: "deepgram",
    async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
      const params = new URLSearchParams({ model, smart_format: "true" });
      if (input.language) params.set("language", input.language);
      else params.set("detect_language", "true");
      const response = await fetchFn(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: { authorization: `Token ${options.apiKey}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ url: input.url }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return failed("Deepgram", response);
      const json = (await response.json()) as {
        results?: { channels?: { detected_language?: string; alternatives?: { transcript?: string }[] }[] };
      };
      const channel = json.results?.channels?.[0];
      const text = channel?.alternatives?.[0]?.transcript;
      if (typeof text !== "string") throw new Error("Deepgram answered without a transcript");
      return { text: text.trim(), language: channel?.detected_language ?? input.language };
    },
  };
}

export interface OpenAiTranscriberOptions {
  apiKey: string;
  /** Default `gpt-4o-mini-transcribe`. */
  model?: string | undefined;
  fetch?: typeof fetch | undefined;
}

const EXTENSIONS: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** OpenAI's limit for one upload. */
const OPENAI_MAX_BYTES = 25 * 1024 * 1024;

/**
 * OpenAI `POST /v1/audio/transcriptions` (multipart: file, model, language):
 * the file is downloaded from the signed URL first, as OpenAI takes no URL.
 * Files over 25 MB are refused by OpenAI, so they fail here without the upload.
 */
export function openAiTranscriber(options: OpenAiTranscriberOptions): Transcriber {
  const fetchFn = options.fetch ?? fetch;
  const model = options.model ?? "gpt-4o-mini-transcribe";
  return {
    name: "openai",
    async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
      const file = await fetchFn(input.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!file.ok) return failed("Storage", file);
      const blob = await file.blob();
      if (blob.size > OPENAI_MAX_BYTES) throw new Error("OpenAI transcription: file over 25 MB");
      const mime = input.mime ?? (blob.type || "audio/mp4");
      const form = new FormData();
      form.set("file", new Blob([blob], { type: mime }), `audio.${EXTENSIONS[mime] ?? "m4a"}`);
      form.set("model", model);
      form.set("response_format", "json");
      if (input.language) form.set("language", input.language);
      const response = await fetchFn("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: `Bearer ${options.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return failed("OpenAI", response);
      const json = (await response.json()) as { text?: string };
      if (typeof json.text !== "string") throw new Error("OpenAI answered without a transcript");
      return { text: json.text.trim(), language: input.language };
    },
  };
}
