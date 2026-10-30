# media-library uploads: design for review

Status: **v0.2, approved** (Mason, with the changes listed below), building, for review before anyone builds. No code yet.

This is primitive 4 of [ADR 0012 (media primitives)](https://github.com/marktiderman/genesis/blob/staging/2026-10-29/c/docs/adr/0012-media-primitives.md),
as amended in #542: resumable, checksummed uploads with one contract for browser, native and
server, storage targets as adapters, fan-out with a read-back check, and skip-if-identical. It
folds two existing upload paths into one and leaves video providers alone. Feature:
`media-resumable-uploads` (the `upload-protocol` entry folds into it, see Merge).

## What it is, and what it isn't

**It is** the contract by which a client gets a file's bytes into one or more storage targets,
once, intact, resumably, and on behalf of an owner the app's rules have checked. Its result is a
set of verified copies, which the media value (ADR 0012, primitive 3) records in `copies[]`.

**It isn't:**

- **Access to read.** Reading is signed links (`@marktiderman/genesis-media/signed`). A signed
  read link is never a write grant, and the upload secret is never the signing secret.
- **Scheduling.** Priorities, pause and resume across files, speed caps, files and parts at once,
  day and night schedules: client configuration, outside the contract. A client may do all of it
  or none.
- **Making derivatives.** Thumbnails, renditions and watermarks are the app's or a worker's.
- **Video providers.** Mux direct uploads keep their own path (see Video providers).
- **Retention.** "Never delete the source" protects the original an upload reads from; it says
  nothing about how long copies live (see Never delete the source).

## Where it lives

A new package, `@marktiderman/genesis-media-library`, as ADR 0012 creates it ("media-library,
primitive, data"). On ADR 0005's two axes its `package.json` sets `genesis.layer: "primitive"`
and `genesis.group: "data"`, plus `genesis.owner`, and declares its doctor rule ("a file upload:
use media-library's client, never a hand-rolled PUT or TUS loop").

Subpaths, so each runtime takes only what it runs:

| Entry | Runs on | Holds |
| --- | --- | --- |
| `.` | anywhere | the protocol types, the part plan, digest helpers, errors |
| `/client` | browser, React Native, Node | `createUploader` (create, parts, resume, finalize) |
| `/server` | Node 20+, Workers | `createUploadHandler` (the protocol over `Request`/`Response`), the session store interface |
| `/targets` | Node 20+, Workers | `r2Target` (a binding, or a Worker over fetch), `s3Target` (SigV4) |

Fetch and WebCrypto only, like genesis-connect and `/signed`, except where noted under Digests.

## Words

- **Owner**: the person or service an upload is for, as the app's auth names it (`{ kind, id }`).
- **Upload**: one session, for one object, by one owner. It has an id, a state, a declared size
  and SHA-256, a part size, and the parts received.
- **Object identity**: the whole object's SHA-256 and size. Nothing else decides "identical".
- **Part**: a numbered slice. Its own digest proves it arrived intact; it decides nothing else.
- **Target**: an adapter for one store (R2, an S3-compatible bucket). A target can hold an
  Object Lock.
- **Copy**: one stored instance in one target, verified by reading it back: what the media value
  records (`{ target, tier, key, lockedUntil?, lockMode?, verifiedAt }`).

## The protocol

JSON over HTTP, one route the app mounts (`/uploads` below). Every request carries a credential
the app's `owner` hook turns into an owner: a session cookie or a bearer token for a signed-in
person or a service, or a **scoped credential** for someone who isn't signed in. Forms'
anonymous answers keep working this way: the forms adapter turns the visit's attempt id or a
valid edit link into a respondent owner (`{ kind: "respondent", id: <attempt or response> }`),
issued at create and sent with every later operation, so each one is still bound to that owner.
The handler asks the app who the owner is and whether it may (`authorize`, below) before it does
anything else.

### Create

`POST /uploads`

```json
{
  "name": "IMG_0412.CR3",
  "contentType": "image/x-canon-cr3",
  "size": 48213504,
  "sha256": "9f2c…(64 hex)",
  "purpose": "media",
  "targets": ["working", "archive"]
}
```

- `size` and `sha256` are the whole object's (see Digests). They are the object's identity from
  here on. `sha256` is **optional at create**: without it there is no skip check, and the client
  declares it at finalize instead, where it is checked against the stored object the same way.
  A client that can't hash before sending (a phone with a big file) so reads the file once.
- `purpose` is the app's word for what this is for (an avatar, a form answer, a media value); the
  app's `authorize` reads it to decide, and to choose the key and the targets it allows.
- `targets` names targets the app configured, by name. The app may refuse or narrow them; it
  never gets a URL or a key from the client.

Answers:

- **201** `{ "uploadId", "state": "open", "partSize", "parts": [], "expiresAt" }`: send parts.
- **200** `{ "state": "skipped", "copies": [...] }`: an object the caller may already read has
  the same SHA-256 and size, and has a verified copy in every target asked for. Nothing to send.
  The app decides what a skip returns (a media value id, say).
- **200** `{ "uploadId", "state": "open", … "parts": [3, 4] }` with `"resumed": true`: this owner
  already has an open upload for the same identity, purpose **and authorized target set**; it
  carries on (one session per owner, identity, purpose and targets, so two tabs don't race). A
  create that asks for a different set of targets is a new session; it never widens or narrows
  an open one.
- **403** the app's rules refuse; **413** bigger than the purpose allows; **415** a content type
  it doesn't take; **422** a malformed body. Errors are `{ "error", "code" }`, the words safe to
  show the person.

### Resume

`GET /uploads/:id` → **200** `{ "uploadId", "state", "size", "sha256", "partSize", "parts": [{ "n", "size", "digest" }], "expiresAt" }`.

The parts the server has are the truth; a client never trusts its own memory of what it sent.
**404** for an id that doesn't exist, has expired, or **belongs to another owner** (the same
404, so an id can't be probed).

### Part

`PUT /uploads/:id/parts/:n`, the bytes as the body, with
`content-length` and `content-digest: sha-256=:<base64>:` (RFC 9530).

- **200** `{ "n", "size", "digest" }`: received and checked (the server hashed what arrived and
  it matched).
- **422** `{ "code": "digest_mismatch" }`: it arrived changed; send it again.
- **409** `{ "code": "part_size" }`: every part but the last must be exactly `partSize`; the last
  is the rest.
- **413** over `partSize`. **404** as for Resume. **410** `{ "code": "finalized" }` once the
  upload is done.
- A part sent again with the same digest is a no-op **200**; with a different digest it is
  refused, **409** `{ "code": "part_conflict" }`. A client that sees it is confused about its
  file: it aborts and creates again.

Direct mode: for a target that can verify a part itself (S3's `x-amz-checksum-sha256` on
`UploadPart`), the handler may answer Create with `"mode": "direct"` and each part request with
a presigned part URL (`GET /uploads/:id/parts/:n/url` → `{ "url", "headers" }`), so the bytes go
straight to the store. The server then confirms parts with `ListParts` at Resume and Finalize.
Proxied mode (the bytes through the handler, a Worker in front of R2) is the default; both give
the same answers.

### Finalize

`POST /uploads/:id/finalize` (body `{ "sha256"? }`, required when create had none) → completes
the multipart upload in the first target, copies it server-side to the others (in direct mode
and proxied alike: the client sends once), then **reads each copy back** and hashes it. The
upload is done only when every target's copy has the declared size and SHA-256.

Reading back is **asynchronous** for anything big: a 50 GB file in two targets is 100 GB to read,
past any request's time and a Worker's subrequest limits.

- **202** `{ "state": "verifying" }`: the copies are assembled and a `genesis_jobs` job
  (`media-library.verify`) is reading each one back. The client polls Resume until the state is
  `done`, `partial` or `identity_mismatch`.
- Objects under a threshold (`verifyInlineBytes`, default 64 MB) are read back inline and answer
  at once:
- **200** `{ "state": "done", "copies": [{ "target", "key", "size", "sha256", "lockedUntil"?, "lockMode"?, "verifiedAt" }] }`.
- **409** `{ "code": "missing_parts", "parts": [..] }`: send these first.
- **422** `{ "code": "identity_mismatch" }`: the assembled object isn't the SHA-256 or size
  declared. The upload ends in `identity_mismatch`, and the assembled object is removed (it was
  never a copy). The client aborts it and creates again. That removal is always
  possible because **no lock is applied before verification**: a target with Object Lock
  assembles the object unlocked, reads it back, and only then sets its retention
  (`PutObjectRetention`, or a copy into the retained key). An object under retention is always
  one that verified.
- **200** `{ "state": "partial", "copies": [...], "failed": [{ "target", "code" }] }` when some
  targets verified and others didn't. Finalize again retries only the failed targets.
- The lock is set only after a copy verifies, inline or in the job.

Resume reports the same states (`verifying`, `done`, `partial`, `identity_mismatch`) with the
same fields, so a client that lost the finalize answer just polls.

### Abort

`DELETE /uploads/:id` → **204**. Aborts the multipart uploads in every target and forgets the
session. Copies already verified are not removed by an abort: that is a delete of the media
value, under the app's retention policy.

## Owner binding

Every operation (create, resume, part, finalize, abort) is bound to the owner that created the
upload, and checked again by the app's rules on each call, not only at create:

```ts
createUploadHandler({
  store,                       // where sessions live: the Supabase table by default, or a Durable Object
  targets: { working: r2Target(env.BUCKET), archive: s3Target({ ... }) },
  owner: (request) => …,       // who is asking, or null (401)
  authorize: ({ owner, op, purpose, size, contentType }) => …, // the app's rules: allow, narrow, refuse
  keyFor: ({ owner, purpose, sha256, name }) => …,             // where the object goes; never the client's
  readable: ({ owner, sha256, size }) => …,                    // objects with this identity the owner may read
});
```

- Another owner's upload is **404**, never 403: an id never tells a stranger it exists.
- An upload id is random (128 bits) and is not a capability on its own: knowing it without being
  its owner gets 404.
- `keyFor` decides the storage key. A client never names a key, a bucket or a target URL.
- Sessions expire (default 7 days without a part); an expired session is aborted in its targets
  by a sweep (genesis_jobs).

## Skip-if-identical

- Identity is the **whole object's SHA-256 and size**, declared at create and checked at
  finalize against the object as stored. Per-part digests verify the transfer only and **never
  decide a skip**.
- A skip compares **only within objects the caller can already read** (`readable`). An owner can
  never learn, by uploading, that someone else has the same file: a match outside `readable` is
  no match, and the upload goes ahead.
- A skip needs a **verified copy in every target asked for**. A match missing a target turns into
  a server-side copy to that target (where the targets allow it) or a normal upload.
- A name, a modification time, an ETag or a store's own checksum (xxh128, MD5) never decides a
  skip. (The consumer app this is promoted from skips on xxh128 plus size; that moves to SHA-256,
  and its stored xxh128 stays as metadata only.)

## Targets and fan-out

A target adapter:

```ts
interface UploadTarget {
  name: string;
  maxPart: number;                 // the largest part it takes
  start(key, meta): Promise<string>;                        // a multipart upload id
  part(key, uploadId, n, body, digest): Promise<PartReceipt>;
  presignPart?(key, uploadId, n, digest): Promise<{ url: string; headers: Record<string, string> }>;
  listParts(key, uploadId): Promise<PartReceipt[]>;
  finish(key, uploadId, parts): Promise<void>;
  abort(key, uploadId): Promise<void>;
  read(key): Promise<ReadableStream<Uint8Array> | null>;   // for the read-back check
  head(key): Promise<{ size: number; sha256?: string } | null>;
}
```

- **R2**, through a binding in a Worker (`createMultipartUpload`, `uploadPart`) or a Worker over
  fetch from elsewhere. Each part is hashed on arrival before `uploadPart`.
- **Any S3-compatible store** (S3, B2, MinIO), SigV4 over fetch, with `x-amz-checksum-sha256`
  per part, and **Object Lock** per object: `lockMode` (`GOVERNANCE` or `COMPLIANCE`) and
  `retainUntil` from the target's config, set only after the
  read-back check passes. The bucket must have Object Lock enabled; the adapter refuses at start
  when it hasn't.
- **Fan-out**: one upload, several targets. The parts go to the first target only (proxied or
  direct); finalize copies the assembled object server-side to the rest, a part at a time, then
  reads back **each** target's copy and records a copy only for those that verify. The client
  sends once. For a big object the copies are made in the verify job, with the read-back.
- **Read-back**: the server streams the stored object and hashes it. That is the only proof the
  copy is right; a store's ETag isn't a content hash for multipart objects.

Not in the contract: storage classes and tiers beyond recording `tier` on the copy, lifecycle
rules, replication the store does on its own.

## Never delete the source

An upload **never deletes or moves the original it reads from**: the person's camera card, disk
or photo library. No client in this package has an option to; a client that moves or deletes
after upload is the app's own code, outside the contract, and a doctor rule can flag it.

It **is not a retention rule**. Deleting a media value, erasing an account, and removing its
copies follow the app's retention policy. A copy under an Object Lock retention can't be removed
until the lock ends; the policy then purges it, and the purge is recorded on the copy
(`purgedAt`). An upload never shortens or extends a lock it didn't set.

## Digests

- To be skipped, a file's SHA-256 must be known **before create**, so the client reads the file
  twice: once to hash, once to send. Hashing a 50 GB file takes minutes on a laptop; clients show
  it as "Checking". A client may instead hash while it sends and declare the SHA-256 at
  finalize: one read, no skip.
- WebCrypto's `digest` isn't incremental. The default incremental SHA-256 is **`@noble/hashes`**
  (audited, plain JS, runs on Hermes, no wasm). The `hash` option takes another (hash-wasm in a
  browser app that wants the speed). Browsers hash in a **Web Worker** by default. The server
  side hashes streams with `crypto.DigestStream` on Workers and `node:crypto` on Node.
- Parts carry `content-digest` (RFC 9530, `sha-256`, base64). Part size: at least 8 MB (S3's
  minimum is 5 MiB), at most the smallest `maxPart` of the targets, and large enough that the
  part count stays under 10,000.

## Clients

`createUploader({ endpoint, fetch?, readSlice, hash?, partsAtOnce?, onProgress? })` drives the
protocol: hash, create (or skip), send missing parts, finalize, and resume from `GET` after any
failure. The same code runs everywhere; what differs is how a file is read.

| Client | Reads the file with | Notes |
| --- | --- | --- |
| Browser | `File.slice()`; hashing in a Web Worker | Survives a reload: the upload id is kept per file (name, size, last-modified) in IndexedDB, and Resume asks the server what it has. |
| React Native | expo-file-system's chunked `File.open()`, as chat's TUS client does now | Foreground only in v1. Background transfer on iOS and Android is a later adapter, not this contract. |
| Server or desktop | `node:fs` handles | A desktop or worker uploader (a queue on disk, schedules) is tooling built on this, later. |

Client configuration, never protocol: priorities, pause and resume, speed caps, files and parts
at once, retries and back-off. The uploader takes `partsAtOnce` and a `signal`; anything more is
the app's.

## Failure and resume

| What happens | What the client does | What the server guarantees |
| --- | --- | --- |
| The connection drops mid-part | Resume (`GET`), send what's missing | A part counts only once received and checked |
| The tab closes, the app is killed | On return, find the upload id, Resume | The session lives until it expires |
| A part arrives changed | 422: send it again | Never stored as received |
| The same part is sent twice | Nothing | Same digest: no-op |
| The file changed on disk after create | Its parts no longer add up: finalize (or the verify job) reports `identity_mismatch` | No copy is recorded, nothing is locked; the client abandons and creates again |
| Another tab uploads the same file | Create answers `resumed`; both share one session | One session per owner, identity, purpose and target set |
| One target fails at finalize | Finalize again later | `partial` with the copies that did verify |
| A big file is being read back | Poll Resume until `done`, `partial` or `identity_mismatch` | 202 `verifying`; a job reads each copy, then locks it |
| A part is re-sent with other bytes | Abort and create again | 409 `part_conflict`; the first part stands |
| The session expires | Create again (and maybe skip) | A sweep aborts it in every target |
| Another owner guesses the id | — | 404 on every operation |
| The store loses or corrupts a copy | — | Finalize's read-back refuses it; later checks are the app's (re-verify jobs) |

## Merge: one upload path

- **forms' upload protocol** (`packages/forms/src/upload-protocol.ts`, `upload-handler.ts`): a
  single signed PUT per answer file, with forms' own checks (the form takes answers, the field
  takes files, the attempt or edit link, the rate limit). It becomes a one-part upload in this
  contract: forms' checks move into its `authorize`, its attempt id or edit link becomes the
  respondent owner (no sign-in needed, see The protocol), and its JSON (`UploadRequest`,
  `UploadGrant`) stays as a thin adapter for browsers already in use. `createUploadHandler` and
  `signedUploadHost` stay exported from forms as **deprecated re-exports** over media-library
  until the next major. Forms' tests run unchanged against the adapter.
- **chat's resumable uploads** (`packages/chat/src/native/tus.ts`, `createTusUpload`): Supabase
  Storage's TUS endpoint with the person's own token, so storage RLS judges each file. TUS is a
  **different transport**, not a target that speaks the part protocol: offsets are sequential
  (one `PATCH` at a time, in order, never parallel or out-of-order parts), chunks are a fixed
  6 MiB, and Supabase's upload URL expires after 24 hours. So it becomes a transport adapter
  (`supabaseTusTransport`) the uploader drives as a single in-order stream: Resume is TUS's
  `HEAD` for the offset, a "part" is the next chunk, there is no `listParts`, no fan-out, and
  resume holds only within the 24 hours (after that, create again). Identity is still declared
  at create and checked at finalize by reading the object back. `createTusUpload` stays as a
  **deprecated re-export** with exactly today's guarantees (resume within the session, the same
  path on retry), not the full contract's. The chat outbox's ordering (upload, then send) is
  unchanged.
- **The `upload-protocol` feature** folds into `media-resumable-uploads`: renamed, with
  `upload-protocol` kept in `aliases`, so ADR 0012's and PACKAGE-STRATEGY's references still
  resolve.
- support's screenshots and sites' `putAsset` move onto it afterwards, each in its own change.
- PACKAGE-STRATEGY's move M4 put the shared protocol in `core` (types) and `supabase` (the
  handler). ADR 0012 gives it media-library instead; M4's line should point here when this lands.

Nothing breaks: every existing export keeps its name and behaviour for a deprecation window;
the doctor points new code at media-library.

## Video providers

Mux direct uploads aren't this contract. chat's `videoUpload` sends a recording to a URL the
app's server mints from Mux, in the resumable protocol Mux speaks (Google Cloud Storage's
`Content-Range` and 308), and Mux's webhook marks it ready. That stays as it is: chat's Mux code
is untouched here, and it moves behind the video adapter in media-video-value (owned there,
ADR 0012 primitive 3). The relation, later: a media value's original can come in through this
contract and be handed to a provider by URL (a signed read link), or a provider can be a target
with its own transport. Either is media-video-value's decision.

## Where an app customizes (ADR 0013)

| Level | Uploads |
| --- | --- |
| **Configure** | purposes, size and type limits, targets per purpose, part size, session expiry, lock mode and retention |
| **Brand** | none: the contract has no UI |
| **Compose** | upload UI parts (a drop zone, a progress row) in genesis-ui, later |
| **Adapt** | storage targets (R2, S3-compatible), transports (Supabase TUS), the session store |
| **Own** | who may upload what (`owner`, `authorize`, `readable`), where it goes (`keyFor`), the desktop or capture app, scheduling |

## Test plan

- **Protocol** (the handler over an in-memory target and session store):
  - create, parts in any order, finalize; resume after each step; abort;
  - every status above, and the JSON of each answer;
  - a part sent twice (same digest, different digest); the last part shorter; a wrong part size;
  - a changed part (422); a file that changed between create and finalize (422
    `identity_mismatch`, no copy recorded).
- **Owner binding**: another owner's id is 404 on create-resume, resume, part, finalize and
  abort, with the same body as an unknown id; `authorize` is called on every operation and its
  refusal holds.
- **Skip-if-identical**:
  - skips only on SHA-256 and size within `readable`;
  - an identical object the caller can't read is no skip;
  - the same size with a different SHA-256 is no skip, and so is the same xxh128 or ETag;
  - a match missing a target isn't a full skip.
- **Fan-out**: two targets; one fails at finalize (`partial`, then a retry of that target only);
  read-back catches a target that stored the wrong bytes.
- **Targets**:
  - S3 SigV4 requests against recorded fixtures, with Object Lock headers, and a refusal on a
    bucket without Object Lock;
  - R2 against Miniflare;
  - the Supabase TUS transport against a local stack: in-order chunks, resume within 24 hours, a
    create again after, RLS kept.
- **Clients**:
  - the uploader against the handler in Node;
  - a browser run (Playwright) with a reload mid-upload;
  - React Native through the existing chat outbox tests, unchanged.
- **Never delete the source**: no client API moves or deletes a source (a type test).
- **Merge**: forms' and chat's existing upload tests pass unchanged through the deprecated
  re-exports.
- **Large files**: a 5 GB upload through the in-memory target with flat memory; part counts at
  the 10,000 limit.

## Decided in review (v0.2)

- **Layers:** `genesis.layer: "primitive"`, `genesis.group: "data"` (ADR 0005, ADR 0012).
- **Asynchronous read-back:** finalize answers 202 `verifying` and a `genesis_jobs` job reads the
  copies back; under `verifyInlineBytes` (64 MB) it verifies inline and answers 200. The lock
  follows verification.
- **`sha256` optional at create:** no skip check without it; declared at finalize and checked
  the same way.
- **Hashing:** `@noble/hashes` by default, a `hash` option for hash-wasm, a Web Worker in
  browsers.
- **Fan-out in direct mode:** a server-side copy at finalize; every copy is read back.
- **Sessions:** a table by default, through the app's provider (a Supabase migration with RLS on
  the owner, and pgTAP), behind the store interface so a Durable Object store can replace it.
- **A re-sent part with a different digest:** refused, 409 `part_conflict`; abort and create again.
- **The package:** `@marktiderman/genesis-media-library`.
