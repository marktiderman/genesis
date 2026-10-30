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
  owner: async (request) => {
    const user = await userFrom(request);
    return user ? { kind: "person", id: user.id } : null;
  },
  // The app's rules, asked for every operation (create, resume, part, finalize, abort).
  authorize: ({ op, owner, purpose, size, contentType }) =>
    purpose === "media" && contentType.startsWith("image/") ? { allow: true, targets: ["working", "archive"] } : { allow: false },
  // Where the object goes. The client never names a key.
  keyFor: ({ owner, uploadId, name }) => `media/${owner.id}/${uploadId}/${name}`,
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
| `DELETE /uploads/:id` | 204; 409 while verifying |

- **Owner binding.** Every operation is bound to the owner that created the upload, and
  `authorize` is asked again each time. Another owner's upload, an unknown id and a lapsed
  session are the same 404.
- **Identity.** The whole object's SHA-256 and size. `sha256` is optional at create (then there
  is no skip, and finalize must carry it); either way it is checked against the object as stored.
  A part's digest only proves the part arrived intact.
- **Skip-if-identical** only compares objects from `readable`, and only when each has a verified
  copy with this identity in every target asked for. A file someone else holds is never a match.
- **Parts** are checked against their `content-digest` (RFC 9530) before they are stored. The
  same part again is a no-op; other bytes for a part already received are refused with 409
  `part_conflict` (abort and create again).
- **Fan-out.** The parts go to the first target. At finalize the object is copied server-side to
  the others, a part at a time; then every copy is read back and hashed. Only a copy with the
  declared size and SHA-256 is recorded in `copies`, and only then locked. A copy that fails is in
  `failed`, and finalize again retries just those targets (`partial`).
- **Never delete the source.** Nothing here deletes or moves the original a client reads from.
  Copies follow the app's retention policy.

## Jobs

- `UPLOAD_VERIFY_JOB` (`media-library.verify`, payload `{ uploadId }`): run it with
  genesis-supabase's runner, `runJobs(admin, { handlers: { [UPLOAD_VERIFY_JOB]: createUploadVerifyJob({ store, targets }) } })`.
  It is safe to run twice.
- `UPLOAD_SWEEP_JOB` (`media-library.sweep`): `sweepExpiredUploads({ store, targets })` aborts
  open sessions with no part for `sessionTtlSeconds` (7 days) in their target and forgets them.
  Schedule it.

Without `enqueueVerify` every upload verifies inline, which only suits a server with no time
limit: on Workers, a 50 GB file in two targets is 100 GB to read back.

## Session store

- `createSupabaseSessionStore(client)`, the default: migration `0001_genesis_media_library.sql`
  (in `migrations/`) makes the `genesis_media_library` schema, `uploads` and `upload_parts`, with
  row level security (a signed-in person reads and changes only their own sessions; anon gets
  nothing), and `add_part` and `update_upload`, which record a part and change a state atomically.
  Its pgTAP test is in `migrations/tests/`: copy both into the app's `supabase/` and run
  `supabase test db`. Add `genesis_media_library` to the project's exposed schemas, and pass the
  service-role client (the handler binds every operation to its owner itself; RLS is the second
  wall).
- `createMemorySessionStore()`, for tests.
- `UploadSessionStore`: implement it for a Durable Object when the handler runs in a Worker.

## Targets

- `createS3Target({ endpoint, region, bucket, accessKeyId, secretAccessKey, objectLock?, storageClass? })`:
  any S3-compatible store over fetch, with SigV4 on WebCrypto. Each part is signed with its own
  SHA-256, so the store refuses one that arrived changed. With `objectLock`, each object gets its
  retention (`PutObjectRetention`) after it verified, never before; the bucket must have Object
  Lock on (the target refuses at start otherwise) and **no default retention**, which would lock
  an object before it is checked.
- `createR2Target(env.BUCKET)`: an R2 bucket through its Worker binding. R2 has no per-object
  retention, so this target locks nothing.
- `createMemoryTarget()`, for tests: `objects`, `locks`, `calls`, `corrupt`, `fail`.
- `UploadTarget`: `start`, `part`, `finish`, `abort`, `read`, `head`, `delete`, and `lock?`, for
  another store.

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
