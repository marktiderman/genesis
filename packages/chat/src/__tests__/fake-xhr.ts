/** @feat:chat A scriptable XMLHttpRequest: the test answers each request and reports its progress. */
import { vi } from "vitest";

export class FakeXHR {
  static all: FakeXHR[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = undefined;
  sent = false;
  aborted = false;
  status = 0;
  responseText = "";
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXHR.all.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.body = body;
    this.sent = true;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true } as ProgressEvent);
  }
  respond(status = 200, text = "") {
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}

/** Installs FakeXHR as XMLHttpRequest (undone by vi.unstubAllGlobals). */
export function installFakeXHR(): typeof FakeXHR {
  FakeXHR.all = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  return FakeXHR;
}
