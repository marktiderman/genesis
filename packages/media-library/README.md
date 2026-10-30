# @marktiderman/genesis-media-library

Resumable, checksummed uploads for Genesis apps: primitive 4 of ADR 0012 ("media primitives").
One protocol for browser, native and server; every operation bound to its owner; skip-if-identical
on the whole object's SHA-256; storage targets as adapters, with fan-out to several stores and a
read-back check on each; and upload sessions in the app's own Supabase, with row level security
on the owner. Fetch and WebCrypto: Node 20+ and Workers.

The design, the protocol messages and the failure cases are in
[docs/media-library-uploads.md](../../docs/media-library-uploads.md). This release is the server
half (the protocol, the handler, the session store and the targets). The browser, native and
server clients, and the deprecated re-exports for forms' upload protocol and chat's TUS uploads,
come next.

```bash
pnpm add @marktiderman/genesis-media-library
```

| Entry | Runs on | Holds |
| --- | --- | --- |
| `.` | anywhere | the protocol's shapes, the part plan, `content-digest`, incremental SHA-256 |
| `/server` | Node 20+, Workers | `createUploadHandler`, the verify and sweep jobs, the session stores |
| `/targets` | Node 20+, Workers | `createMemoryTarget`, `createR2Target`, `createS3Target` |

## The route

```ts
import { createSupabaseSessionStore, createUploadHandler, UPLOAD_VERIFY_JOB } from "@marktiderman/genesis-media-library/server";
import { createR2Target, createS3Target } from "@marktiderman/genesis-media-library/targets";
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

## Jobs

- `UPLOAD_VERIFY_JOB` (`media-library.verify`, payload `{ uploadId }`): run it with
  genesis-supabase's runner, `runJobs(admin, { handlers: { [UPLOAD_VERIFY_JOB]: createUploadVerifyJob({ store, targets }) } })`.
  It is safe to run twice: a run that finds the lease taken asks to run again once it could have
  lapsed (`{ retryAfterSeconds }`).
- `UPLOAD_SWEEP_JOB` (`media-library.sweep`): `sweepExpiredUploads({ store, targets })` clears
  open sessions with no part for `sessionTtlSeconds` (7 days) and stuck verifications, and what
  they left in their targets. Schedule it.

Without `enqueueVerify` every upload verifies inline, which only suits a server with no time
limit: on Workers, a 50 GB file in two targets is 100 GB to read back.

## Session store

- `createSupabaseSessionStore(client)`, the default: migration `0001_genesis_media_library.sql`
  (in `migrations/`) makes the `genesis_media_library` schema, `uploads` and `upload_parts`, with
  row level security (only the service role writes; a signed-in person may read their own
  sessions and change nothing, so no one can claim a state or a copy verification didn't find;
  anon gets nothing), and `add_part` and `update_upload`, which record a part and change a state
  atomically, for the service role only. Its pgTAP test is in `migrations/tests/`: copy both into
  the app's `supabase/` and run `supabase test db`. Add `genesis_media_library` to the project's
  exposed schemas, and pass the service-role client: the handler binds every operation to its
  owner itself.
- `createMemorySessionStore()`, for tests.
- `UploadSessionStore`: implement it for a Durable Object when the handler runs in a Worker.
  Every change is a compare-and-set (`reservePart`, `completePart`, `update` with the states it
  expects, `claimVerify`, `remove` with the states it expects).

## Targets

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

## Where an app customizes (ADR 0013)

| Level | Uploads |
| --- | --- |
| **Configure** | purposes, size and type limits (`authorize`), targets per purpose, part size (`maxPartBytes`), `verifyInlineBytes`, `sessionTtlSeconds`, lock mode and retention per target |
| **Brand** | none: the protocol has no UI |
| **Compose** | none yet: upload UI parts come with the clients |
| **Adapt** | storage targets (R2, S3-compatible, memory, your own `UploadTarget`), the session store (the Supabase table, memory, a Durable Object) |
| **Own** (stays in the app) | who may upload what (`owner`, `authorize`, `readable`), where it goes (`keyFor`), scheduling, the desktop or capture app |

## Not in this release

- The clients (`createUploader` for browser, native and server), with incremental hashing
  (`@noble/hashes` by default, a Web Worker in browsers), resume, parallel parts, and priority,
  pause and speed caps as client configuration.
- Direct mode (presigned S3 part URLs, so the bytes skip the handler).
- forms' upload protocol and chat's TUS uploads as deprecated re-exports over this package.
