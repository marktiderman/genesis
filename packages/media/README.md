# @marktiderman/genesis-media

Images and files for Genesis apps: one image value, responsive images through
your image service, byte sniffing, and a server-side fetch that can't be aimed
at your own network.

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

## Used by

- `@marktiderman/genesis-sites` renders every section image through
  `responsiveImage` (`handleSiteRequest`'s `imageUrl` option), and its
  `/import` re-hosts files through `fetchGuarded` and `sniff`.

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
