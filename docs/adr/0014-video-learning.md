# ADR 0014: Video sources, one player, clips and sequences

- Status: proposed
- Date: 2026-10-29
- Features: `video-sources`, `video-player`, `video-timeline`
- Related: ADR 0010 (own product events), ADR 0012 (media primitives; amended here), ADR 0013
  (customization layer), docs/PACKAGE-STRATEGY.md (layers)

## Context

Apps on Genesis play video: chat attachments, lessons, exercise demos, films. Today chat has its
own Mux provider (`packages/chat/src/server/mux.ts`) and its own web and native players
(`packages/chat/src/web/video.tsx`, `packages/chat/src/native/video-player.tsx`). Creators also
bring video from where it already lives (YouTube, Vimeo, a plain file), and some apps want a
cheaper host than Mux at scale (Bunny Stream). ADR 0012 plans the media value with video; it
doesn't say how vendors plug in, how one player serves every app, or how a lesson can be built
from moments of existing videos without copying them.

`pnpm features find video` returns chat and media-library only. This is a capability Genesis
decides to own (G4): the course platforms rent their player, and every app here needs one.

## Decision

All in `@marktiderman/genesis-media-library` (primitive, data; ADR 0012), on its own subpaths.

### 1. Video sources (`/video`)

A **video source** adapter plays, and optionally hosts, video from one vendor, and declares what
it can do. The player, and anything built on it, offers only what a source declares.

| Capability | Meaning |
| --- | --- |
| `host` | uploads go to it (through ADR 0012's upload contract; a vendor's direct-upload URL is only the transport, and create and finalize still run) and it encodes |
| `signedPlayback` | short-lived playback tokens, minted on the server after the app's rules allow it, with vendor keys rotated like ADR 0012's signer keys |
| `serverClips` | clips cut by the vendor without re-encoding |
| `assetClips` | exact clips as new encoded assets (at an encoding cost) |
| `captions` | auto-generated captions, cue-level (`captions` never implies word timings) |
| `storyboard` | thumbnails for scrubbing |
| `engine` | `native` (Genesis's player renders HLS or MP4) or `embed` (the vendor's player, driven by its API) |
| `timing` | how time is reported: `frame` (native, `requestVideoFrameCallback`), `event` with a tolerance (Vimeo `timeupdate`, about 250 ms) or `polled` (YouTube) |
| `overlay` | whether anything may be drawn over the picture |
| `paidAccess` | whether access may be paid for or gated |
| `trackingRules` | vendor rules on what may be recorded (for example YouTube's Made for Kids) |
| `offline` | downloadable for native apps |

Sources:

1. **Mux**, the premium source, first: hosting, signed playback (clip bounds as
   `asset_start_time`/`asset_end_time` claims in the token, storyboard tokens bounded the same
   way), instant clips (`serverClips`; content may start and end a few seconds outside the
   range), asset-based clips for exact cuts, free cue-level auto-captions, storyboards, static
   MP4 renditions for download and offline (not for clipping), Mux Data. chat's Mux code moves
   here, with a deprecated re-export.
2. **YouTube**, `embed` engine through the IFrame Player API. No `overlay` (its policies forbid
   elements in front of the embedded player), no `paidAccess` (no charging to watch, no gating
   beyond play, no rewards for watching), `trackingRules` (Made for Kids: tracking off; stored
   data refreshed within 30 days). `timing: polled`: the API has no time event, so the adapter
   polls `getCurrentTime()` while playing and ends a clip itself, starting it with
   `loadVideoById({ startSeconds, endSeconds })` (the `start` parameter snaps to a keyframe).
   Embeds need a valid `Referer` or `origin` (in a WebView, an HTTPS origin), `playsinline` on
   iOS and at least 200×200.
3. **Vimeo**, `embed` engine through the Vimeo Player SDK. `timing: event` (`timeupdate`,
   about 250 ms; clip ends through `addCuePoint`), text tracks and chapters from the SDK, `dnt=1`.
   Hiding Vimeo's controls and domain-level privacy need a paid Vimeo plan on the creator's
   account, and domain privacy restricts sites, not viewers.
4. **Bunny Stream**, a second hosted source on the `native` engine: hosting, signed playback
   through Advanced CDN directory tokens, captions (paid per minute), storyboards, MP4 fallback
   for offline (for videos uploaded after it is switched on, up to 1080p). No `serverClips`;
   exact clips are rendered by a Genesis worker. DRM on our own player is Bunny's Enterprise tier
   and may exclude the MP4 fallback.
5. **Plain URL**: HLS or MP4 the app serves, on the `native` engine.
6. Later, as needed: Cloudflare Stream, Wistia.

A media value may be an **external reference** (a YouTube or Vimeo id) with no originals or
copies; ADR 0012's "N verified copies" applies to hosted values only.

### 2. The player (`/player` for web, `/native` for React Native)

Adaptive playback, speed, captions and a transcript panel with click-to-seek, chapters (from the
media value) on the bar, storyboard scrubbing, resume, keyboard shortcuts, and where the source
declares it, picture-in-picture, AirPlay, Chromecast, background audio and downloads. It plays a
sequence as one video, preloading the next item; moving to an `embed` item that can't autoplay
shows a "tap to continue" card. It exposes a **layer slot**: timed layers an app or another
package renders over, beside or between items, as the source's `overlay` allows (ADR 0013:
Compose). Accessible by default: keyboard operable, labelled controls, captions never covered.

chat's web and native players move onto it, with deprecated re-exports for one major.

### 3. Clips and sequences (`/timeline`)

- **Clip**: a reference into a video, never a copy. `{ media, start, end, accuracy }`, a half-open
  range in rational time (`{ value, rate }`, like OpenTimelineIO; converted to ADR 0012's integer
  frames at the media value's frame rate). `accuracy` is `segment` (a vendor instant clip),
  `player` (the player seeks and stops; embeds) or `frame` (an asset clip, a new media value with
  `derivedFrom`). Segment is the default. Maps to Media Fragments `#t=`, OpenTimelineIO
  (start plus duration) and schema.org `Clip`.
- **Sequence**: items played in order: clips from any sources, title cards, rests and gaps, with
  per-item repeat and rate.

### 4. Playback events

The player writes product events (ADR 0010, `genesis_events`) with identifiers only, using the
xAPI video profile's verbs (initialized, played, paused, seeked, interacted, completed,
terminated), a session id, and per item: the media id, its length and a played-segments summary
small enough for ADR 0010's property limit. Events are analytics; anything that must be kept
(completion, answers) is an app's or a module's own record, never an event.

## Where an app customizes (ADR 0013)

| Piece | Configure | Brand | Compose | Adapt | Own |
| --- | --- | --- | --- | --- | --- |
| Video sources | which sources, token TTLs | — | — | the sources themselves | a vendor of its own |
| Player | speeds, controls, autoplay | tokens, icons | control bar, layer slot, end screen | sources | a signature player look |
| Clips, sequences | accuracy, cards, repeats | card styles | — | clip rendering | editorial rules |
| Playback events | sampling | — | — | — | what the app does with them |

## Glossary

- **video source**: an adapter for a vendor that plays (and may host) video, with declared
  capabilities. Amends ADR 0012, which said "video provider"; chat's `VideoProvider` becomes a
  video source with a deprecated alias.
- **clip**: a time range of a video, by reference. Not "segment" (the streaming unit).
- **sequence**: items played in order as one. Not "playlist" in code.
- **accuracy**: how exactly a clip cuts: `segment`, `player` or `frame`.
- **layer slot**: the player's place for timed layers.

## Alternatives

- **Mux only**: rejected; creators already host on YouTube and Vimeo, and Bunny is far cheaper at
  scale. Mux stays the premium source.
- **Each vendor's own player, no Genesis player**: rejected; sequences across sources, events and
  layers would differ per vendor.
- **Copying clips as files**: rejected as the default; references cost nothing. Asset clips remain
  for exact cuts.

## Consequences

- media-library (being built, uploads first) gains `/video`, `/player`, `/native` and `/timeline`.
- Order: Mux source, player, playback events; then clips and sequences; YouTube, Vimeo and Bunny
  sources with them.
- chat's Mux code and players move onto these, with deprecated re-exports.
