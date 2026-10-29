# @marktiderman/genesis-media

Images and files for Genesis apps: one image value, responsive images through
your image service, byte sniffing, a server-side fetch that can't be aimed
at your own network, and signed links and ZIP bundles for private media.

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

// After the app's own rules have chosen what this person may see:
const imageUrl = await createSignedImageUrls(signer, {
  base: "https://media.example.com",
  derivatives: finishSizes("color", [800, 2400]), // color/800 and color/2400
  items: visible.map((photo) => mediaSrc("photos", photo.id)),
});

const img = responsiveImage(
  { src: mediaSrc("photos", photo.id), alt: photo.alt, width: photo.width, height: photo.height },
  { imageUrl, widths: imageUrl.widths, sizes: "(min-width: 768px) 50vw, 100vw" },
);
```

- **It signs; it never decides access.** Pass only the items the person may
  already see. Any other `src` gets `null` from the builder, so
  `responsiveImage` leaves it at its own URL with no `srcset`, and nothing
  unchecked is signed.
- **Derivatives** follow ADR 0012's names: finish × size (`color/800`,
  `bw/2400`, made with `finishSizes`), renditions (`web-1080`, `web-720`) and
  `poster`, each `{ name, width }`. For each width a `srcset` asks for, the
  builder serves the smallest derivative at least that wide, or the widest
  there is. Pass `imageUrl.widths` as `responsiveImage`'s `widths`, so every
  `w` in the `srcset` is the derivative's own width. `format` and `quality`
  are ignored: derivatives are fixed files.
- **One link per derivative.** Each URL is signed for
  `mediaScope.file(collection, id, derivative)`, so a link to `color/800`
  can't open `color/2400`, another item, or the original.
- **Hour-aligned by default** (`sign: { align: "hour" }`, with the signer's
  `file` TTL), so every `srcset` URL stays the same, and caches, for the
  clock hour when the TTL is whole hours. Pass `sign` to change it.
- **Async.** WebCrypto signs asynchronously, so the links are made when the
  promise resolves and the builder only looks them up. Make one builder per
  response, for that response's items.
- **Paths** default to `<collection>/<id>/<derivative>` under `base`
  (`photos/a1/color/800`); `path(item, derivative)` changes that. The
  handler's `route` reads the default back with `parseSignedImagePath`, and
  must check the derivative is one you declared:

```ts
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

## Used by

- `@marktiderman/genesis-sites` renders every section image through
  `responsiveImage` (`handleSiteRequest`'s `imageUrl` option), and its
  `/import` re-hosts files through `fetchGuarded` and `sniff`.
- `/signed` is promoted from a consumer app's signed-link signer and its
  edge Worker (verifier, ranges, ZIP), which move onto it.

## Follow-ups

Other packages still keep their own copies of this code. Each should move
onto this package:

- **chat**: resumable uploads (`createTusUpload`), hosted video, and the link
  unfurler's address guard (`src/server/unfurl.ts`).
- **forms**: `checkUploads` and the upload store, and the second address
  guard for hook and webhook URLs (`src/destinations/hook-url.ts`).
- **support**: screenshot uploads.
- **sites**: `putAsset` and the asset picker, once a shared asset table
  stores alt text once per image.

A media library (an asset table, "where used", a picker in genesis-ui) is
later work.
