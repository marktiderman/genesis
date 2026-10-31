# @marktiderman/genesis-media

Images and files for Genesis apps: one image value, responsive images through
your image service, byte sniffing, a server-side fetch that can't be aimed
at your own network, signed links and ZIP bundles for private media, and
resumable, checksummed uploads. It is optional (`genesis.optional`): forms
takes its uploads through its own port, and no primitive imports it.

```bash
pnpm add @marktiderman/genesis-media
```

## Responsive images

```ts
import { responsiveImage, supabaseImageUrl } from "@marktiderman/genesis-media";

const imageUrl = supabaseImageUrl({ url: "https://abc.supabase.co" });

const img = responsiveImage(
  { src: photoUrl, alt: "The front desk", width: 2000, height: 1500, focal: { x: 30, y: 40 } },
  { imageUrl, sizes: "(min-width: 768px) 50vw, 100vw", priority: true },
);
// img.src, img.srcset, img.sizes, img.width, img.height, img.alt,
// img.loading ("eager"), img.fetchpriority ("high"), img.decoding,
// img.objectPosition ("30% 40%"), img.phone, img.placeholder
```

- **`ImageValue`**: `src`, `alt` or `decorative`, `width` and `height` (the
  file's own), `focal` (where the subject is, 0 to 100 from the left and
  top), `phone` (a second crop for narrow screens, with its own size and focal
  point) and `placeholder` (a tiny base64 PNG, JPEG, WebP or GIF `data:` URI;
  anything else is dropped).
- **`ImageUrlBuilder`**: `(src, { width, format, quality }) => string | null`.
  Null means "I can't serve this one": the image keeps its own URL and gets no
  `srcset` (and no `sizes`, which means nothing without one).
  - `supabaseImageUrl({ url, quality? })` turns
    `<url>/storage/v1/object/public/<bucket>/<path>` into
    `<url>/storage/v1/render/image/public/<bucket>/<path>?width=&quality=`
    ([Supabase image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations)).
    Width is capped at 2500 and quality kept within 20 to 100, as Supabase
    requires. Supabase serves WebP to browsers that accept it on its own and
    offers no AVIF yet, so `format: "auto" | "webp" | "avif"` leave the choice
    to it, and `format: "origin"` keeps the file's format. Other hosts,
    private buckets and URLs with a query are left alone.
  - `passThroughImageUrl` serves every image at its own URL.
- **`responsiveImage(value, options)`**: the widths offered are
  `DEFAULT_WIDTHS` (320 to 2400) or your `widths`, never wider than the file
  (the file's own width is offered instead). The fallback `src` is the largest
  offered width up to 1280. `priority` gives `loading="eager"`,
  `fetchpriority="high"` and `decoding="sync"`; `eager` loads at once at
  normal priority; otherwise `loading="lazy"`. Give priority to one image a
  page: its largest above the fold.
- **The phone crop** comes back as `img.phone` (`src`, `srcset`, `sizes`,
  `media: PHONE_MEDIA`, `objectPosition`) for a `<source>` in a `<picture>`.

`responsiveImage` uses `src` as given: check it (an `https:` URL or your own
path) before calling.

## Sniffing

`sniff(bytes)` tells a PNG, JPEG, GIF, WebP, AVIF or PDF by its first bytes
(never its name or Content-Type), with an image's width and height from its
header. Anything else, SVG and HTML included, is `null`.

## Fetching on a server: `@marktiderman/genesis-media/server` (Node)

```ts
import { fetchGuarded, FetchRefusedError } from "@marktiderman/genesis-media/server";

const { bytes, finalUrl } = await fetchGuarded(url, { maxBytes: 15 * 1024 * 1024 });
```

`fetchGuarded` refuses server-side request forgery: http(s) only, ports 80
and 443, no credentials in the URL, only public addresses (checked on every
address a name resolves to, when the socket connects, so DNS rebinding doesn't
get past it), at most three redirects, each checked the same way and never
from https down to http, a size cap and a time limit. A refusal is a
`FetchRefusedError` whose message is safe to show the person who asked. The
pieces are exported too: `urlProblems`, `isPublicAddress`, `guardedLookup`,
`createGuardedTransport` and `readCapped`.

## Signed links: `@marktiderman/genesis-media/signed` (server and edge)

Short-lived links to files in private storage, for people the app has already
checked, so the bytes stream from storage or an edge Worker and never through
the app server. Fetch and WebCrypto only: Node 20+ and Workers. ADR 0012
("media primitives") is the design.

**Server and edge only.** The secret both signs and verifies, so it must never
reach a browser: a browser only ever receives finished signed URLs. The
`/signed` entry resolves to nothing under the `browser` export condition, so a
page bundle that imports it fails to build (Workers bundlers match `workerd`
or `worker` first and resolve it), and `createMediaSigner` throws where there
is a `document`. Neither guard is airtight, and neither replaces keeping the
secret out of client code:

- a webpack build with `target: "webworker"` (a service worker or web worker
  in the page's own bundle) matches the `worker` condition and has no
  `document`, so it gets past both;
- tests of server code that run under jsdom (or happy-dom) have a `document`,
  so `createMediaSigner` throws there: run them in the `node` environment.

The signer never decides access. The app's own rules (RLS, roles) decide who
may see what; the signer only proves "the app said yes, recently". Uploading
is not part of this: never hand out a signed read link for writing.

### Signing

```ts
import { createMediaSigner, mediaScope } from "@marktiderman/genesis-media/signed";

const signer = createMediaSigner({
  secret: env.MEDIA_SIGNING_SECRET, // at least 32 bytes: openssl rand -base64 32
  ttl: { download: "7d" },          // per scope kind; the rest keep two hours
  align: "hour",
});

// After the app has checked the person:
const poster = await signer.signMediaUrl(MEDIA_BASE, "videos/v1/poster.jpg",
  mediaScope.file("videos", "v1", "poster"));
const original = await signer.signMediaUrl(MEDIA_BASE, "videos/v1/original.mov",
  mediaScope.download("videos/v1/original.mov", "Final cut.mov"), { ttl: "3d" });
// https://media.example.com/videos/v1/poster.jpg?e=1800007200&s=v1.…
// https://media.example.com/videos/v1/original.mov?e=…&s=v1.…&d=Final+cut.mov
```

- **Scopes** (`mediaScope`): each names one exact thing, and no kind stands in
  for another.
  - `item(collection, id)`: every interchangeable preview of one item (its
    thumbnail and display sizes);
  - `file(collection, id, variant)`: one file of an item (one video
    rendition, a poster). Sign anything big per file: an item link for a
    poster must never open the film;
  - `download(path, filename)`: one exact file, its download name bound in;
  - `bundle(manifestId)`: a ZIP (below).
- **`sign(scope, { ttl?, align? })`** returns `{ e, s, k? }`: the expiry
  (Unix seconds), the signature (`v1.` and base64url) and, with `keys`, the
  key id. `verify(scope, { e, s, k })` checks the expiry and the signature
  (compared in constant time) and takes the raw query values.
  `signMediaUrl(base, path, scope, options?)` appends them, and `d` for a
  download.
- **TTL** is per call, else per scope kind (`ttl: { item, file, download,
  bundle }`, each defaulting to two hours): from one minute to 30 days
  (`"30m"`, `"2h"`, `"7d"`, or seconds); anything else throws a `RangeError`.
  Hours suit viewing; days suit a lab or a video provider fetching an
  original. `align: "hour"` ends the link at the end of the hour `now + ttl`
  falls in; it lasts between `ttl` and `ttl` plus an hour. With a whole-hour
  TTL (`"2h"`, `"7d"`), every link to the same thing signed within one clock
  hour is the same URL and caches as one; with any other TTL (`"90m"`) the
  URL changes partway through the hour. An aligned link can outlive
  `MAX_MEDIA_TTL` by up to that hour: a `"30d"` link may last 30 days and
  one hour. Hiding an item takes effect when its links expire, so keep
  viewing links short.
- **Key rotation:** `createMediaSigner({ keys: { current: "k2", secrets: { k1, k2 } } })`
  signs with `current` and puts its id in the link (`k`); a link verifies
  with the key its id names. A link without an id (from the single-secret
  form) verifies with any listed key, so moving from `{ secret }` to `keys`
  keeps links in flight working. Drop a key once its longest TTL has passed.
- **Versioned format:** the signed text starts `v1:` and the signature `v1.`.
  A later format is added beside v1, so links already handed out keep
  verifying until they expire.

### Serving

```ts
import { createSignedMediaHandler, mediaScope } from "@marktiderman/genesis-media/signed";

const handle = createSignedMediaHandler({
  storage, // a MediaStorage (below)
  signer,
  // The app maps a path to a storage key and the scope its link must carry.
  route: (path, { download }) => {
    const m = /^(videos|photos)\/([\w-]+)\/([\w-]+)\.(jpg|mp4|mov)$/.exec(path);
    if (!m) return undefined;
    const [, collection, id, variant] = m;
    const key = `media/${path}`;
    if (download) return { key, scope: mediaScope.download(path, download) };
    if (variant === "original") return undefined; // originals only as downloads
    return collection === "photos"
      ? { key, scope: mediaScope.item(collection, id) }
      : { key, scope: mediaScope.file(collection, id, variant) };
  },
});

export default { fetch: (request: Request) => handle(request) };
```

`(request) => Promise<Response>`. It answers `GET` and `HEAD` (405
otherwise) and:

- checks the link **before storage is read**, and keeps `route`'s answer to
  itself until the link checks out, so an unsigned request can't learn what
  exists: a bad, expired or other-scope link and a path `route` doesn't know
  are the same 403 (after the same HMAC); only a valid link to a missing file
  is 404; it never lists anything. `route` runs before the check (its scope
  is what gets checked), so keep it pure and cheap: no storage or database
  reads. A `route` that throws is answered the same 403; pass
  `onError(error, request)` to log it;
- never hands `route` a path with `.` or `..` segments, or a segment that
  decodes to a slash, backslash or NUL, or still holds a percent-escape (so
  a double-encoded `%252e%252e` can't become `..` in a storage URL built from
  the path; a plain `%`, as in `100% done.jpg`, is fine);
- serves one byte `Range` as 206 (`bytes=0-99`, `bytes=100-`, `bytes=-500`;
  an end past the file is cut to it), a start past the end as 416 with
  `content-range: bytes */size`, and several ranges or a malformed header as
  the whole file. `If-Range` is honoured (RFC 9110 §13.1.5): the range is
  sent only while the strong ETag (or the last-modified date) still matches,
  else the whole file as 200. If the ETag changes between the size check
  and the read, the new file is sent whole;
- passes the stored content type, length, ETag and last-modified through, and
  sets `accept-ranges: bytes`, `x-robots-tag: noindex` and
  `x-content-type-options: nosniff`;
- sandboxes every response but a PDF (`content-security-policy: sandbox;
  default-src 'none'`; Chromium's PDF viewer is blank under it, and
  `nosniff` with the declared PDF type can't run as HTML) and shows a file
  inline only when its type is safe to: images
  other than SVG, video, audio and PDF. Anything else (HTML, SVG, XML, text,
  no type) goes out as `content-disposition: attachment`, so a stored file
  that is really a page can't run script on the media origin;
- names a download per RFC 6266 (`attachment; filename="…"` in plain ASCII
  plus `filename*=UTF-8''…`), always with the filename the signature binds;
- caches as `private, max-age=` the link's remaining life, at most an hour,
  unless `cacheControl` says otherwise.

### Bundles: many files as one ZIP

```ts
import { createBundleHandler, createZipManifest, mediaScope } from "@marktiderman/genesis-media/signed";

// When the person asks for the download (after the app has checked them):
const manifest = createZipManifest({
  filename: "Selected files",   // the download name; .zip is added
  entries: [{ key: "media/photos/p1/original.jpg", path: "photos/p1.jpg", size: 4_812_330 }],
  expiresAt: new Date(Date.now() + 86_400_000),
});
await env.BUCKET.put(`bundles/${manifest.id}.json`, JSON.stringify(manifest));
const url = await signer.signMediaUrl(MEDIA_BASE, `bundles/${manifest.id}`, mediaScope.bundle(manifest.id));

// In the Worker:
const bundles = createBundleHandler({
  storage, signer,
  readManifest: async (id) => (await env.BUCKET.get(`bundles/${id}.json`))?.json() ?? null,
});
// bundles(request) reads the id from the path's last segment, or bundles(request, id).
```

- The manifest (JSON, format version 1) has a random 128-bit id, its own
  `filename` and its own expiry (Unix seconds), which wins over a longer
  link. Each entry is `{ key, path, size? }`. Paths that would unzip outside
  their folder, or fail to unzip on Windows, are refused: absolute, `.`,
  `..` or empty segments, any of `\ : < > | ? * "`, control characters and
  DEL, a segment ending in a dot or a space, device names (`CON`, `nul.txt`,
  `COM1`…). So are duplicates ignoring case (after NFC normalisation), a path
  that is both a file and a folder (`a` beside `a/b`), and more than
  `MAX_ZIP_ENTRIES` (65,535) entries.
- The ZIP is store-only (media is already compressed) and built on the fly
  with [`client-zip`](https://github.com/Touffy/client-zip): one file at a
  time as the download is read, so memory stays flat, and ZIP64 past 4 GB.
  At most 65,535 files: `client-zip` 2.5.1 (pinned) writes the count in 16
  bits. When every entry has a `size`, the response carries the exact
  `content-length`, so the browser shows progress; that number comes from
  `client-zip`'s `predictLength`, which must match its writer byte for byte,
  so upgrade the pin only with the bundle tests passing.
- An abandoned download cancels the storage read in progress and opens no
  further file.
- **On Workers**, mind two limits. CPU: the CRC-32 every ZIP entry needs is
  computed in JavaScript, about 10 s of CPU per 4 GB, so a 30 s CPU limit
  tops out near 12 GB per bundle (raise the Worker's `cpu_ms` limit, or split
  the set). Subrequests: each entry is one storage read, a subrequest, so the
  plan's subrequest limit per request caps the files in one bundle.
- A file that has gone missing, or whose size no longer matches, ends the
  stream with an error: the download fails rather than arriving incomplete.
- 403 for a bad link (before the manifest is read), 404 for a missing,
  expired or mismatched manifest, `cache-control: no-store`.

### Storage

The handlers read through a small interface, so any object store works:

```ts
interface MediaStorage {
  head(key: string): Promise<{ size: number; contentType?: string; etag?: string; lastModified?: Date } | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }):
    Promise<{ size: number; contentType?: string; etag?: string; lastModified?: Date; body: ReadableStream<Uint8Array> } | null>;
}
```

`size` is always the whole object's. `createMemoryStorage({ [key]: { body, contentType? } })`
is one in memory, for tests.

**An R2 bucket** (`env.BUCKET` in a Worker):

```ts
const info = (o: R2Object) => ({ size: o.size, contentType: o.httpMetadata?.contentType, etag: o.httpEtag, lastModified: o.uploaded });
const storage: MediaStorage = {
  head: async (key) => {
    const o = await env.BUCKET.head(key);
    return o && info(o);
  },
  get: async (key, options) => {
    const o = await env.BUCKET.get(key, options?.range ? { range: options.range } : undefined);
    return o && { ...info(o), body: o.body };
  },
};
```

**S3-compatible storage** (S3, B2, MinIO) over fetch, with a signing client
such as `aws4fetch`:

```ts
const s3 = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region });
const at = (key: string) => `${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
const read = (res: Response, size: number) => ({
  size, contentType: res.headers.get("content-type") ?? undefined, etag: res.headers.get("etag") ?? undefined,
  lastModified: res.headers.has("last-modified") ? new Date(res.headers.get("last-modified")!) : undefined,
});
const storage: MediaStorage = {
  head: async (key) => {
    const res = await s3.fetch(at(key), { method: "HEAD" });
    return res.ok ? read(res, Number(res.headers.get("content-length"))) : null;
  },
  get: async (key, options) => {
    const r = options?.range;
    const res = await s3.fetch(at(key), r ? { headers: { range: `bytes=${r.offset}-${r.offset + r.length - 1}` } } : {});
    if (!res.ok || !res.body) return null;
    const size = r ? Number(res.headers.get("content-range")?.split("/")[1]) : Number(res.headers.get("content-length"));
    return { ...read(res, size), body: res.body };
  },
};
```

**Supabase Storage** (a private bucket) is the same fetch wrapper with plain
`fetch`, `authorization: Bearer <service role key>`, and
``at = (key) => `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}` ``
(encode every segment, as the S3 example does, so a key can never add a path step).
For `head`, send a `GET` with `range: bytes=0-0`, read the size from
`content-range`, and cancel the body. The service role key stays in the
Worker, like the signing secret.

### Responsive images from private storage

`createSignedImageUrls` gives a private photo a `srcset` like a public one.
It signs every declared derivative of the items you name and resolves to an
`ImageUrlBuilder` for `responsiveImage`:

```ts
import { createSignedImageUrls, finishSizes, mediaSrc } from "@marktiderman/genesis-media/signed";
import { responsiveImage } from "@marktiderman/genesis-media";

const derivatives = finishSizes("color", [800, 2400]); // color/800 and color/2400

// After the app's own rules have chosen what this person may see:
const imageUrl = await createSignedImageUrls(signer, {
  base: "https://media.example.com",
  derivatives,
  items: visible.map((photo) => mediaSrc("photos", photo.id)),
});

const img = responsiveImage(
  { src: mediaSrc("photos", photo.id), alt: photo.alt, width: photo.width, height: photo.height },
  { imageUrl, sizes: "(min-width: 768px) 50vw, 100vw" },
);

// The HTML holds links that expire: never cache it past imageUrl.expires
// (less ten minutes, for a page left open while its lazy images load).
const now = Math.floor(Date.now() / 1000);
const maxAge = imageUrl.expires === undefined ? 3600 : Math.max(0, Math.min(3600, imageUrl.expires - now - 600));
response.headers.set("cache-control", `private, max-age=${maxAge}`);
```

- **It signs; it never decides access.** Pass only the items the person may
  already see. Any other `src` gets `null` from the builder, so
  `responsiveImage` leaves it at its own URL with no `srcset`, and nothing
  unchecked is signed.
- **Render only the items you signed.** For a `mediaSrc`, "its own URL" is
  the relative storage key (`photos/a1`), which loads nothing. Don't render
  an item you didn't pass in `items`, or render a placeholder in its place.
- **One page at a time.** Sign the items being rendered, not the whole
  collection. A call signs at most `maxItems` items (default
  `DEFAULT_MAX_SIGNED_ITEMS`, 1,000) and throws a `RangeError` past it:
  10,000 items take about 400 ms and 150 MB, past a Worker's limits.
- **Derivatives** follow ADR 0012's names: finish × size (`color/800`,
  `bw/2400`, made with `finishSizes`), renditions (`web-1080`, `web-720`) and
  `poster`, each `{ name, width }`. For each width a `srcset` asks for, the
  builder serves the smallest derivative at least that wide, or the widest
  there is. The builder carries the derivative widths (`imageUrl.widths`),
  and `responsiveImage` offers those only, ignoring its own `widths` option,
  so every `w` in the `srcset` is the derivative's own width. It never adds
  the original's width between them (a 1000 px photo gets `color/800 800w`,
  not `color/1600` labelled `1000w`); a photo narrower than every
  derivative gets the smallest. Each width has one derivative: two at the
  same width (`poster` and `color/1920`) are refused, so declare one finish
  at a time. `original` is never a derivative. `format` and `quality` are
  ignored: derivatives are fixed files.
- **One link per derivative.** Each URL is signed for
  `mediaScope.file(collection, id, derivative)`, so a link to `color/800`
  can't open `color/2400`, another item, or the original.
- **Hour-aligned by default** (`align: "hour"`, with the signer's `file`
  TTL), so every `srcset` URL stays the same, and caches, for the clock hour
  when the TTL is whole hours. `sign` is laid over that default:
  `sign: { ttl: "3h" }` stays aligned, `sign: { align: "none" }` drops it.
- **Cached HTML outlives nothing.** The links are signed when the page is
  built and last two to three hours (a two-hour TTL to the end of the hour).
  A page cached longer than that, by ISR, a CDN or the browser, serves links
  that are 403. `imageUrl.expires` is the earliest expiry (Unix seconds):
  keep the page's `cache-control` `max-age` and `s-maxage`, and an ISR
  `revalidate`, below `expires - now`, with a margin for how long a visitor
  keeps the page open (lazy images load late). Cache the image responses
  freely: the handler caches each one for the life of its link.
- **Async.** WebCrypto signs asynchronously, so the links are made when the
  promise resolves and the builder only looks them up. Make one builder per
  response, for that response's items.
- **Ids** go through `mediaSrc(collection, id)`, which refuses what the
  handler would refuse in a path segment (a slash, a backslash, NUL, a
  percent-escape such as `%2e`, `.` or `..`) with a `TypeError`, rather than
  signing a link that is always 403.
- **Paths** default to `<collection>/<id>/<derivative>` under `base`
  (`photos/a1/color/800`); `path(item, derivative)` changes that. The
  handler's `route` reads the default back with `parseSignedImagePath`, and
  must check the derivative is one you declared:

```ts
import { createSignedMediaHandler, mediaScope, parseSignedImagePath } from "@marktiderman/genesis-media/signed";

// The same `derivatives` as above: only declared ones are served.
const names = new Set(derivatives.map((d) => d.name));
const handle = createSignedMediaHandler({
  storage, signer,
  route: (path) => {
    const p = parseSignedImagePath(path);
    if (!p || !names.has(p.derivative)) return undefined;
    return { key: `media/${path}.jpg`, scope: mediaScope.file(p.collection, p.id, p.derivative) };
  },
});
```

### Where an app customizes (ADR 0013)

| Level | Signed links | Bundles |
| --- | --- | --- |
| **Configure** | scopes, TTL per scope kind or per link, hour alignment, `cacheControl`, keys; for images, the derivatives and their path | filename, expiry, entries |
| **Brand** | none: nothing here is seen | none |
| **Compose** | none: there is no UI | none |
| **Adapt** | the `MediaStorage` behind the verifier (R2, S3-compatible, Supabase, memory) | the same storage, and where `readManifest` reads from |
| **Own** (stays in the app) | who may see what (RLS, roles), and the `route` from paths to keys | which files go in |

## Uploads: `@marktiderman/genesis-media/uploads`

Resumable, checksummed uploads: primitive 4 of ADR 0012 ("media primitives").
One protocol for browser, native and server; every operation bound to its owner; skip-if-identical
on the whole object's SHA-256; storage targets as adapters, with fan-out to several stores and a
read-back check on each; and upload sessions in the app's own Supabase, with row level security
on the owner. Fetch and WebCrypto: Node 20+ and Workers.

The design, the protocol messages and the failure cases are in
[docs/media-uploads.md](../../docs/media-uploads.md).

| Entry | Runs on | Holds |
| --- | --- | --- |
| `/uploads` | anywhere | the protocol's shapes, the part plan, `content-digest`, incremental SHA-256 |
| `/uploads/server` | Node 20+, Workers | `createUploadHandler`, the verify and sweep jobs, the session stores |
| `/uploads/targets` | Node 20+, Workers | `createMemoryTarget`, `createR2Target`, `createS3Target` |
| `/uploads/client` | browser, React Native (Hermes), Node | `createUploader`, the sources, resume stores, the Web Worker hasher, `createSupabaseTusTransport`; under the `browser` condition, hashing in the package's worker by default |
| `/uploads/client/hash-worker` | a browser's Web Worker | the hashing worker the uploader starts |
| `/forms` | browser | `createFormsUploadAdapter`, for genesis-forms' upload port |

The session table's migration is `migrations/0001_genesis_media.sql` (schema
`genesis_media`), shipped in the package.

### The route

```ts
import { createSupabaseSessionStore, createUploadHandler, UPLOAD_VERIFY_JOB } from "@marktiderman/genesis-media/uploads/server";
import { createR2Target, createS3Target } from "@marktiderman/genesis-media/uploads/targets";
import { enqueueJob } from "@marktiderman/genesis-supabase";

const handle = createUploadHandler({
  store: createSupabaseSessionStore(admin), // the service-role client
  targets: {
    working: createR2Target(env.BUCKET),
    archive: createS3Target({
      endpoint: "https://s3.us-west-004.backblazeb2.com", region: "us-west-004", bucket: "archive",
      accessKeyId: env.ARCHIVE_KEY_ID, secretAccessKey: env.ARCHIVE_SECRET,
      objectLock: { mode: "COMPLIANCE", days: 3650 },
    }),
  },
  // Who is asking, from the request's own credential. A form respondent without an account is an owner too.
  // The kind is lowercase letters, digits, "_" and "-" (1 to 32); the id 1 to 200 characters.
  owner: async (request) => {
    const user = await userFrom(request);
    return user ? { kind: "person", id: user.id } : null;
  },
  // The app's rules, asked for every operation (create, resume, part, finalize, abort).
  authorize: ({ op, owner, purpose, size, contentType }) =>
    purpose === "media" && contentType.startsWith("image/") ? { allow: true, targets: ["working", "archive"] } : { allow: false },
  // Where the object goes. The client never names a key.
  keyFor: ({ owner, uploadId, name }) => `media/${owner.id}/${uploadId}/${safeName(name)}`,
  // Objects with this identity the owner may already read: the only ones a skip compares against.
  readable: ({ owner, sha256, size }) => findMyMediaWithIdentity(owner, sha256, size),
  // Big uploads are read back in a job.
  enqueueVerify: async (uploadId) => void (await enqueueJob(admin, UPLOAD_VERIFY_JOB, { uploadId })),
});

export const POST = ({ request }) => handle(request); // and GET, PUT, DELETE: the same handler
```

`(request) => Promise<Response>`, on `/uploads` (or `basePath`):

| Request | Answers |
| --- | --- |
| `POST /uploads` `{ name, contentType, size, sha256?, purpose, targets? }` | 201 a new session; 200 `resumed` (this owner's open session for the same identity, purpose and targets); 200 `skipped` (an identical object the owner can read); 401, 403, 413, 415, 422 |
| `GET /uploads/:id` | 200 the state and the parts the server has |
| `PUT /uploads/:id/parts/:n` with `content-digest: sha-256=:…:` | 200 checked and recorded (or the same part again); 422 `digest_mismatch`; 409 `part_conflict`, `part_size`; 413; 410 `finalized` |
| `POST /uploads/:id/finalize` `{ sha256? }` | 200 `done` or `partial` (inline, up to `verifyInlineBytes`, 64 MiB); 202 `verifying` (a job reads the copies back: poll `GET`); 409 `missing_parts`; 422 `identity_mismatch`, `sha256_required` |
| `DELETE /uploads/:id` | 204; 409 while a verification holds it, or when it changed meanwhile |

- **Owner binding.** Every operation is bound to the owner that created the upload, and
  `authorize` is asked again each time. Another owner's upload, an unknown id and a lapsed
  session are the same 404.
- **Identity.** The whole object's SHA-256 and size. `sha256` is optional at create (then there
  is no skip, and finalize must carry it); either way it is checked against the object as stored.
  A part's digest only proves the part arrived intact.
- **Skip-if-identical** only compares objects from `readable`, and only when each has a verified
  copy with this identity in every target asked for. A file someone else holds is never a match.
- **Storage keys are one upload's own.** A key from `keyFor` that doesn't contain the upload id
  gets it appended, and the session table refuses two uploads with one key. So a key built from
  a hash (which anyone can declare) never reaches another upload's object: an upload only ever
  writes, reads back, locks or deletes what it assembled itself (by version, where the store
  keeps versions).
- **Parts** stream through: each is hashed and counted on its way to the target, never held
  whole. A part number is reserved for its bytes (a compare-and-set on the part row) before
  anything is written, so other bytes for it are refused with 409 `part_conflict` before they
  reach the target (abort and create again); the same bytes again are a no-op. Only the request
  that reserved a part gives it back when its write fails; a request writing the same bytes
  alongside it leaves it alone, and if the reservation goes from under it, answers 409
  `part_conflict` rather than recording a part the target may not hold. A part whose bytes
  don't match their `content-digest` (RFC 9530) isn't recorded (422).
- **Two tabs, one session.** An owner has at most one open session per identity, purpose and
  target set (a unique index); a create that loses that race resumes the winner's.
- **Fan-out.** The parts go to the first target. At finalize the object is copied server-side to
  the others, a part at a time; then every copy is read back and hashed. Only a copy with the
  declared size and SHA-256 is recorded in `copies` (with its target's `tier`), and only then
  locked. A copy that fails is in `failed`, and finalize again retries just those targets
  (`partial`).
- **One verification at a time.** A run takes the session's lease (renewed as it goes) before it
  copies anything; a second finalize, or a redelivered job, answers 202 and leaves it alone. A
  copy's multipart upload is recorded before it starts, so one that died is aborted next time.
- **Abort and the sweep** remove a session only while it is still in the state they found: a
  finalize that wins the race stands. Finalize moves the session out of `open` (a
  compare-and-set to `verifying`) before anything is assembled, and the verify run assembles it
  under its lease, so an abort that races a finalize either came first (nothing was assembled)
  or is refused: an object never outlives its session. A session stuck in `verifying` (no live lease for
  `staleVerifyingSeconds`, 1 hour) can be aborted and is swept, with the objects it assembled
  that never verified.
- **Never delete the source.** Nothing here deletes or moves the original a client reads from.
  Copies follow the app's retention policy.

### The client

```ts
import { createIndexedDbResumeStore, createUploader, fromBlob } from "@marktiderman/genesis-media/uploads/client";

const uploader = createUploader({
  endpoint: "/uploads",
  resumeStore: createIndexedDbResumeStore(), // a reload resumes the upload
  ownerHint: user.id, // part of every resume key; call uploader.clearResume() at sign-out
  filesAtOnce: 2,
  partsAtOnce: 4,
  bytesPerSecond: () => (workingHours() ? 2_000_000 : 0), // a speed cap that follows a schedule
});

const upload = uploader.upload(fromBlob(file), {
  name: file.name, contentType: file.type, purpose: "media",
  priority: "now", // "now" | "normal" | "background"
  onProgress: ({ phase, bytesDone, size }) => show(phase, bytesDone / size), // hashing, sending, verifying
});
upload.pause(); upload.resume(); // or uploader.pauseAll()
const result = await upload.done; // { state: "done" | "partial" | "skipped", copies, … }
```

- **One core everywhere.** What differs is the source: `fromBlob` (a browser `File`, read with
  `slice()`), `fromFileHandle` (expo-file-system's `File.open()` on a phone, a wrapped `node:fs`
  handle on a server), `fromBytes`.
- **Hashing.** `hashFirst` (default true) hashes the whole file before create, so it can be
  skipped. Browsers do that in a **Web Worker** by default: the `browser` build of `/client` starts
  the package's `hash-worker.js` (one standalone file) with a literal
  `new Worker(new URL("./hash-worker.js", import.meta.url), { type: "module" })`, which Vite and
  webpack bundle as a worker; it falls back to this thread if the worker fails or goes silent,
  and a cancel terminates it. `createBrowserFileHasher()` is that hasher on its own. Elsewhere
  it runs with `@noble/hashes` (plain JS, fine on Hermes). Pass `hash` for another incremental
  SHA-256 (hash-wasm in a browser app). `hashFirst: false` reads the file once, hashing as it
  sends, and declares the SHA-256 at finalize: no skip, half the reading (a phone with a big file).
- **Resume.** The server's part list is the truth: after any failure, a reload or a relaunch,
  the client asks Resume and sends only what's missing. A file's upload id is remembered in the
  `resumeStore` under the endpoint, `ownerHint`, purpose and the file's `key` (name, size, last
  modified), lapses with its session, and `clearResume()` forgets all of them (sign-out). A
  remembered session is used only while its size, targets and SHA-256 (when known) still match;
  one whose file changed under the same name ends in `identity_mismatch`, and the client aborts
  it and sends the file on a new one. A create carries an id the client chose, so a create retried
  after a lost answer finds the session the first try made.
- **Parts in parallel**, each with its `content-digest`; one that arrived changed goes again. A
  409 `part_conflict` or a lapsed session: the client aborts and creates again, once.
- **The read-back.** A 202 `verifying` is polled (`pollMs`) until `done`, `partial` or
  `identity_mismatch`. `uploader.finalize(id)` retries a `partial` upload's failed targets.
- **Client configuration, never protocol:** `priority`, `pause`/`resume`, `filesAtOnce`,
  `partsAtOnce`, `bytesPerSecond`, `retries`.
- Failures the client won't retry reject with an `UploadClientError` carrying the server's `code`.
- `cancel()` (or the uploader's or the upload's `signal`) stops at once: requests in flight and
  back-off waits are aborted, a queued upload never starts, and the session is removed. Pause
  holds before the next hash slice, part or finalize. A resume store that fails (private
  browsing) never stops an upload. With the Web Worker hasher, a pause during hashing takes
  effect once the whole-file hash is done (the worker hashes the file in one go; a cancel stops
  it at once); with in-thread hashing it holds before the next slice. The speed cap is paced by
  bytes (a cancel ends its wait), and back-off has jitter.

#### Supabase Storage's TUS endpoint

`createSupabaseTusTransport({ supabaseUrl, bucket, headers })` sends straight to Supabase
Storage's resumable endpoint with the person's own token, so storage's RLS judges each file. It
is its own transport, not the part protocol: chunks go in order, a fixed 6 MiB, and resume holds
only within Supabase's 24-hour upload URL.

#### forms and chat: their upload ports

forms and chat never depend on genesis-media; it is optional (`genesis.optional`). Each keeps
its own upload built in behind a small port. This package ships the adapter for forms' port,
and an app opts in by passing it:

```ts
import { createFormsUploadAdapter } from "@marktiderman/genesis-media/forms";
<Form uploads={createFormsUploadAdapter({ uploader, readUrl })} … />
```

- **forms** (`UploadAdapter`, from genesis-forms): the adapter uploads each file through
  `uploader` (`purpose` default `"forms"`) and resolves to the `PhotoRef` the answer keeps: the
  upload id, or the app's own `ref` for a file it already holds. The route's `owner` and
  `authorize` take forms' respondent (attempt id or edit link) and checks. A `partial` store is
  a failed upload.
- **chat** keeps its own TUS client (`createTusUpload`); its `transport` port takes another one
  if an app has it. There is no chat adapter here: `createSupabaseTusTransport` is the same
  protocol, so it would add nothing.

### Jobs

- `UPLOAD_VERIFY_JOB` (`media.verify`, payload `{ uploadId }`): run it with
  genesis-supabase's runner, `runJobs(admin, { handlers: { [UPLOAD_VERIFY_JOB]: createUploadVerifyJob({ store, targets }) } })`.
  It is safe to run twice: a run that finds the lease taken asks to run again once it could have
  lapsed (`{ retryAfterSeconds }`).
- `UPLOAD_SWEEP_JOB` (`media.sweep`): `sweepExpiredUploads({ store, targets })` clears
  open sessions with no part for `sessionTtlSeconds` (7 days) and stuck verifications, and what
  they left in their targets. Schedule it.

Without `enqueueVerify` every upload verifies inline, which only suits a server with no time
limit: on Workers, a 50 GB file in two targets is 100 GB to read back.

### Session store

- `createSupabaseSessionStore(client)`, the default: migration `0001_genesis_media.sql`
  (in `migrations/`) makes the `genesis_media` schema, `uploads` and `upload_parts`, with
  row level security (only the service role writes; a signed-in person may read their own
  sessions and change nothing, so no one can claim a state or a copy verification didn't find;
  anon gets nothing), and `add_part` and `update_upload`, which record a part and change a state
  atomically, for the service role only. Its pgTAP test is in `migrations/tests/`: copy both into
  the app's `supabase/` and run `supabase test db`. Add `genesis_media` to the project's
  exposed schemas, and pass the service-role client: the handler binds every operation to its
  owner itself.
- `createMemorySessionStore()`, for tests.
- `UploadSessionStore`: implement it for a Durable Object when the handler runs in a Worker.
  Every change is a compare-and-set (`reservePart`, `completePart`, `update` with the states it
  expects, `claimVerify`, `remove` with the states it expects).

### Targets

- `createS3Target({ endpoint, region, bucket, accessKeyId, secretAccessKey, objectLock?, storageClass? })`:
  any S3-compatible store over fetch, with SigV4 on WebCrypto. Each part is signed with its own
  SHA-256, so the store refuses one that arrived changed. With `objectLock`, each object gets its
  retention (`PutObjectRetention`) after it verified, never before; the bucket must have Object
  Lock on and **no default retention**, which would lock an object before it is checked (the
  target refuses either at start). An Object Lock bucket is versioned, so every object is
  addressed by the version id `CompleteMultipartUpload` gave: the read-back, the lock and a
  delete name that version (a plain delete would only add a delete marker). Its copies are the
  `archive` tier unless `tier` says otherwise.
- `createR2Target(env.BUCKET, { tier? })`: an R2 bucket through its Worker binding (parts stream
  through a `FixedLengthStream`). R2 has no per-object retention, so this target locks nothing.
- `createMemoryTarget()`, for tests: `objects`, `locks`, `calls`, `corrupt`, `fail`.
- `UploadTarget`: `start`, `part` (a stream, with its size and SHA-256), `finish` (returning the
  object it made), `assembled?`, `abort`, `read`, `head`, `delete` and `lock?` (each with an
  optional version), `tier?`, for another store.

### Where an app customizes (ADR 0013)

| Level | Uploads |
| --- | --- |
| **Configure** | purposes, size and type limits (`authorize`), targets per purpose, part size (`maxPartBytes`), `verifyInlineBytes`, `sessionTtlSeconds`, lock mode and retention per target; on the client, priority, pause, files and parts at once, the speed cap, `hashFirst` |
| **Brand** | none: the protocol has no UI |
| **Compose** | none yet: upload UI parts (a drop zone, a progress row) come later in genesis-ui |
| **Adapt** | storage targets (R2, S3-compatible, memory, your own `UploadTarget`), the session store (the Supabase table, memory, a Durable Object), the client's source, hash and resume store, the Supabase TUS transport, the forms and chat adapters |
| **Own** (stays in the app) | who may upload what (`owner`, `authorize`, `readable`), where it goes (`keyFor`), scheduling, the desktop or capture app |

### Not in this release

- Direct mode (presigned S3 part URLs, so the bytes skip the handler).
- Background transfers on iOS and Android, and upload UI parts in genesis-ui.

## Used by

- `@marktiderman/genesis-sites` renders every section image through
  `responsiveImage` (`handleSiteRequest`'s `imageUrl` option), and its
  `/import` re-hosts files through `fetchGuarded` and `sniff`.
- `/signed` is promoted from a consumer app's signed-link signer and its
  edge Worker (verifier, ranges, ZIP), which move onto it.

## Follow-ups

Other packages still keep their own copies of this code. Each should move
onto this package:

- **chat**: hosted video, and the link unfurler's address guard
  (`src/server/unfurl.ts`). Its resumable uploads (`createTusUpload`) stay its own.
- **forms**: `checkUploads` and the upload store, and the second address
  guard for hook and webhook URLs (`src/destinations/hook-url.ts`).
- **support**: screenshot uploads.
- **sites**: `putAsset` and the asset picker, once a shared asset table
  stores alt text once per image.

An asset catalogue (an asset table, "where used", a picker in genesis-ui) is
later work.
