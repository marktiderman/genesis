# ADR 0012: Media primitives, reduced to what every app shares

- Status: accepted (2026-10-29)
- Date: 2026-10-29
- Features: `media-library`, `galleries`, `upload-protocol`, `genesis-mcp`
- Related: ADR 0005 (layers), ADR 0009 (one resource contract), ADR 0010 (own events)

## Context

One app on Genesis is a photo and video studio with working code for signed media links, ZIP
streaming, resumable checksummed uploads, Mux video with an MP4 fallback, client galleries and a
frame-accurate review tool. The other apps need media too, in smaller doses:

| Need | A coaching app | A learning app (school) | A card game | A photo and video studio |
| --- | --- | --- | --- | --- |
| Upload a file from a person | progress photos, documents | assignments, avatars | card art, avatars | everything |
| Private file, shown to the right people | yes (client photos) | yes (student work) | rarely | yes (client galleries) |
| Images at several sizes | avatars, photos | avatars, covers | card art | everything |
| Video playback | coach videos | lesson videos | trailers | films |
| Many files as one download | exports | class submissions | — | galleries |
| Comments pinned to a spot in a file | form check on a video | feedback on an essay or drawing | — | frame review |
| A collection people browse and pick from | before/after sets | portfolios | decks | galleries and proofing |

The rule (FRAMEWORK G1–G4): Genesis owns the smallest piece every column uses; the studio's
specifics (luxury pages, wedding workflow, editing, the desktop agent) stay in the app.

## Decision

Five primitives and one module, each named for what it is, not for the app that proved it.

1. **Signed links** (genesis-media, primitive, data). A signer makes short-lived URLs with a
   *scope*: one item, one file of an item, a download with its filename bound in, or a bundle
   (a manifest id). Tokens carry a key id and a format version (`v1`), so secrets rotate
   (`createMediaSigner({ keys: { current, secrets } })`) and the encoding can change without
   breaking links in flight. Expiry is per scope (hours for viewing, days for a lab or a video
   provider fetching a master), optionally hour-aligned so links cache. A verifier
   (`createSignedMediaHandler`) serves them from any storage that speaks fetch: HEAD, Range,
   Content-Disposition (RFC 6266). Signing and verifying run on the server or the edge only; the
   secret never reaches a browser. The signer never decides access; the app's rules (RLS) decide,
   then sign. Writes are uploads (4), never a signed read link.
2. **Bundles** (genesis-media). `createZipManifest` and `createBundleHandler`: a streaming ZIP
   from a manifest that carries its own expiry and filename, no buffering, ZIP64 past 4 GB,
   Worker-friendly. Exports, submissions, galleries.
3. **The media value** (media-library, primitive, data). One typed record for a piece of media:
   - kind (image, video, audio, document);
   - `originals[]` (a RAW and JPEG pair, a sidecar), each with checksums as `{ algo: value }`;
   - `copies[]`: `{ target, tier: working | archive | cold, key, lockedUntil?, lockMode?, verifiedAt }`,
     so "safe" means N verified copies;
   - lineage (`derivedFrom`, `edit: { provider, at }`): an edited final is its own value;
   - capture metadata (`capturedAt`, device, width, height, orientation, duration);
   - for video: frame rate as a rational (24000/1001, never a float), start timecode with a
     drop-frame flag, caption tracks, chapters, and the provider's playback ids;
   - derivatives by name on two axes, finish × size (`color/800`, `bw/2400`), plus renditions
     (`web-1080`, `web-720`), `poster` (with its time) and `loop`. Watermarked derivatives are
     derivatives. How they are made is the app's or a worker's. Video providers are adapters (Mux first, chat's existing Mux code moves
   here), with a plain-MP4 fallback set. Resources reference a media value, so ResourceView and
   RecordView show it, and genesis-mcp can describe it.
4. **Uploads** (media-library). Resumable, checksummed uploads (multipart, per-part SHA-256,
   skip-if-identical), one contract for browser, native and server, merging the planned upload
   protocol. Storage targets are adapters (R2, any S3-compatible store with Object Lock mode and
   retain-until per object); one source fans out to several targets with skip-if-identical and a
   read-back check per target. The never-delete-the-source rule is fixed; priorities,
   pause/resume and speed caps are a client's configuration, not the contract. A desktop or
   worker uploader built on the same contract is tooling, later.
5. **Annotations** (a primitive in the collaboration group, beside comments). A comment anchored
   to a place in one version of a file: in frames (integers, `endFrame` optional) against the
   version's rational frame rate, seconds derived and never stored; or `{ page?, region }` for an
   image or a page. Regions and drawings (arrow, box, pen, with colour) are normalised 0–1 to the
   picture, so they survive resizing and other renditions. Threads, mentions and resolution;
   carry-forward to the next version is an optional mapping. Decisions (`approved | changes`, who,
   when, a note) are a sibling record per version, kept as history. A reviewer without an account
   is a signed name and email on the link. Exports (FCPXML, EDL, CSV markers) are adapters. The
   studio's review tool, a coach's form check and a teacher's essay feedback are the same thing.
6. **The galleries module** (module). Collections of media values people browse and act on:
   sets (and derived sets, such as an automatic black-and-white set), private items, access
   (link, PIN, an email gate), roles (owner, client, guest), favourites with notes, download rules
   with per-person limits, expiry with reminder events, cover style as presentation
   configuration, and an activity log (product events, ADR 0010). Built from 1–5; proofing is
   favourites plus annotations; stores and print fulfilment are later modules on top. Slideshows
   and music stay in the app.

Not Genesis: the studio's page design, the wedding workflow, editing integrations, card import,
the desktop app shell, lab fulfilment (until a second app needs it).

## Where an app customizes (ADR 0013's levels)

| Primitive | Configure | Brand | Compose | Adapt | Own (stays in the app) |
| --- | --- | --- | --- | --- | --- |
| Signed links | scopes, expiry per scope | — | — | storage behind the verifier | who may see what (RLS) |
| Bundles | filename, expiry | — | — | storage | which files go in |
| Media value | derivative names and sizes | watermark derivatives | — | video provider | how derivatives are made |
| Uploads | priorities, caps, schedule | — | upload UI parts | storage targets | the desktop or capture app |
| Annotations | shapes, carry-forward | colours | review UI parts | export formats | the review workflow |
| Galleries | access, roles, limits, expiry | tokens, cover style | page parts and slots | — | the editorial page design |

## Glossary

media value (a piece of media: its originals, copies and derivatives), copy (a stored instance
of a file), derivative, rendition (a video derivative), signed link, scope, bundle, annotation
(not "review comment"), gallery (not "album" in code).

## Alternatives

- A studio package (`genesis-studio-media`): rejected; four apps would each fork the pieces they
  need.
- One big media package with galleries inside: rejected; galleries is a product surface to switch
  on per tenant (a module), the rest are parts.
- Buy (Cloudinary, Frame.io): kept as adapters where an app wants them; the contracts stay ours.

## Consequences

- genesis-media releases with signed links and bundles first (the studio drafts the PR).
- media-library, annotations and galleries follow, each with its own changeset; chat's Mux code
  moves behind the video adapter with a deprecated re-export.
- The studio app adopts each piece as it lands and deletes its copy (G4).
