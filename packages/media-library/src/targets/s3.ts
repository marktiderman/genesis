/**
 * Any S3-compatible store (S3, B2, MinIO, R2's S3 API) over fetch, with
 * AWS Signature Version 4 on WebCrypto. Every part is signed with its own
 * SHA-256 (`x-amz-content-sha256`), so the store itself refuses a part that
 * arrived changed. With `objectLock`, each object gets a retention
 * (`PutObjectRetention`) after it verifies, never before; the bucket must
 * have Object Lock enabled, and no default retention (that would lock an
 * object before it is checked).
 */
import { toBase64, toHex } from "../protocol";
import type { ObjectLock, PartReceipt, UploadTarget } from "./target";

/** @stability Experimental */
export interface S3TargetOptions {
  /** `https://s3.us-east-1.amazonaws.com`, `https://s3.us-west-004.backblazeb2.com`, a MinIO URL. */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Retention for each object once it verifies. */
  objectLock?: { mode: ObjectLock["mode"]; days: number } | undefined;
  /** A storage class (`DEEP_ARCHIVE`), where the store has them. */
  storageClass?: string | undefined;
  fetch?: typeof fetch;
  /** The time, in ms. Default the clock. */
  now?: () => number;
}

/** A store's refusal: its HTTP status and S3 error code. */
export class S3Error extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "S3Error";
    this.status = status;
    this.code = code;
  }
}

const utf8 = new TextEncoder();
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** RFC 3986 encoding, as SigV4 wants it (also `!'()*`). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? utf8.encode(data) : data;
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)));
}

async function hmac(key: Uint8Array, text: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as Uint8Array<ArrayBuffer>, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, utf8.encode(text)));
}

/** What `signS3Request` signs. */
export interface S3RequestToSign {
  method: string;
  url: URL;
  /** Headers to send and sign (lowercase names); `host` is added. */
  headers: Record<string, string>;
  /** The body's SHA-256 (hex). Default the empty body's. */
  payloadSha256?: string | undefined;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  /** The signing time. */
  date: Date;
}

/**
 * The headers for one SigV4-signed request: the given ones plus `host`,
 * `x-amz-date`, `x-amz-content-sha256` and `authorization`. The URL's path
 * must already be encoded (each segment with RFC 3986 rules).
 */
export async function signS3Request(r: S3RequestToSign): Promise<Record<string, string>> {
  const amzDate = r.date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const payload = r.payloadSha256 ?? EMPTY_SHA256;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) headers[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  headers.host = r.url.host;
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = payload;
  const names = Object.keys(headers).sort();
  const query = [...r.url.searchParams.entries()]
    .map(([k, v]) => [enc(k), enc(v)] as const)
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [r.method, r.url.pathname || "/", query, names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payload].join("\n");
  const service = r.service ?? "s3";
  const scope = `${day}/${r.region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");
  let key = await hmac(utf8.encode(`AWS4${r.secretAccessKey}`), day);
  for (const part of [r.region, service, "aws4_request"]) key = await hmac(key, part);
  const signature = toHex(await hmac(key, toSign));
  const { host: _host, ...sent } = headers;
  return { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${r.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}

const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];

/** @stability Experimental */
export function createS3Target(options: S3TargetOptions): UploadTarget {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const root = options.endpoint.replace(/\/+$/, "");
  const urlFor = (key: string, query: Record<string, string> = {}) => {
    const url = new URL(`${root}/${enc(options.bucket)}/${key.split("/").map(enc).join("/")}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url;
  };
  let lockChecked: Promise<void> | undefined;

  async function send(method: string, url: URL, init: { headers?: Record<string, string>; body?: Uint8Array | string } = {}): Promise<Response> {
    const body = typeof init.body === "string" ? utf8.encode(init.body) : init.body;
    const headers = await signS3Request({
      method,
      url,
      headers: init.headers ?? {},
      payloadSha256: body ? await sha256Hex(body) : undefined,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: options.region,
      date: new Date(now()),
    });
    const res = await doFetch(url, { method, headers, body: body as Uint8Array<ArrayBuffer> | undefined });
    if (res.ok) return res;
    if (res.status === 404 && (method === "GET" || method === "HEAD")) return res;
    const text = method === "HEAD" ? "" : await res.text();
    throw new S3Error(`S3 ${method} ${url.pathname}: ${res.status} ${tag(text, "Message") ?? ""}`.trim(), res.status, tag(text, "Code"));
  }

  /** Once: the bucket must have Object Lock on, or nothing could be locked. */
  function checkLock(): Promise<void> {
    lockChecked ??= (async () => {
      const url = new URL(`${root}/${enc(options.bucket)}`);
      url.searchParams.set("object-lock", "");
      const res = await send("GET", url);
      const xml = res.ok ? await res.text() : "";
      if (tag(xml, "ObjectLockEnabled") !== "Enabled") {
        throw new S3Error(`S3 bucket ${options.bucket} doesn't have Object Lock enabled, so this target's objectLock can't be honoured.`, 409, "ObjectLockNotEnabled");
      }
    })().catch((e) => {
      lockChecked = undefined;
      throw e;
    });
    return lockChecked;
  }

  return {
    // S3's limits: 5 MiB to 5 GiB a part.
    minPart: 5 * 1024 * 1024,
    maxPart: 5 * 1024 * 1024 * 1024,
    async start(key, meta) {
      if (options.objectLock) await checkLock();
      const headers: Record<string, string> = { "content-type": meta.contentType };
      if (options.storageClass) headers["x-amz-storage-class"] = options.storageClass;
      const res = await send("POST", urlFor(key, { uploads: "" }), { headers });
      const id = tag(await res.text(), "UploadId");
      if (!id) throw new S3Error(`S3 start ${key}: no UploadId in the answer`, 502);
      return id;
    },
    async part(key, uploadId, n, body) {
      const res = await send("PUT", urlFor(key, { partNumber: String(n), uploadId }), { body });
      const etag = res.headers.get("etag");
      if (!etag) throw new S3Error(`S3 part ${n} of ${key}: no ETag`, 502);
      return { n, etag } satisfies PartReceipt;
    },
    async finish(key, uploadId, parts) {
      const xml = `<CompleteMultipartUpload>${parts
        .slice()
        .sort((a, b) => a.n - b.n)
        .map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${p.etag.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</ETag></Part>`)
        .join("")}</CompleteMultipartUpload>`;
      const res = await send("POST", urlFor(key, { uploadId }), { headers: { "content-type": "application/xml" }, body: xml });
      // S3 can answer 200 and put the error in the body.
      const text = await res.text();
      if (text.includes("<Error>")) throw new S3Error(`S3 finish ${key}: ${tag(text, "Message") ?? "error"}`, 500, tag(text, "Code"));
    },
    async abort(key, uploadId) {
      await send("DELETE", urlFor(key, { uploadId }));
    },
    async read(key) {
      const res = await send("GET", urlFor(key));
      return res.status === 404 ? null : res.body;
    },
    async head(key) {
      const res = await send("HEAD", urlFor(key));
      return res.status === 404 ? null : { size: Number(res.headers.get("content-length")) };
    },
    async delete(key) {
      await send("DELETE", urlFor(key));
    },
    async lock(key) {
      if (!options.objectLock) return undefined;
      const lock: ObjectLock = { mode: options.objectLock.mode, retainUntil: new Date(now() + options.objectLock.days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z") };
      const xml = `<Retention xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Mode>${lock.mode}</Mode><RetainUntilDate>${lock.retainUntil}</RetainUntilDate></Retention>`;
      const checksum = toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(xml))));
      // PutObjectRetention needs an integrity checksum; SHA-256 stands in for Content-MD5 (WebCrypto has no MD5).
      await send("PUT", urlFor(key, { retention: "" }), {
        headers: { "content-type": "application/xml", "x-amz-sdk-checksum-algorithm": "SHA256", "x-amz-checksum-sha256": checksum },
        body: xml,
      });
      return lock;
    },
  };
}
