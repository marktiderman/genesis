# ADR 0014: Video learning primitives: one timeline model, many video sources

- Status: accepted (2026-10-29)
- Date: 2026-10-29
- Features: `video-player`, `video-sources`, `video-timeline`, `video-paths`, `video-studio`, `workouts`, `courses`
- Related: ADR 0005 (layers), ADR 0010 (own product events), ADR 0012 (media primitives), ADR 0013 (customization layer)

## Context

A learning portal on Genesis needs a video experience at least as good as the course platforms
(Teachable, Kajabi, Thinkific, LearnWorlds) and the interactive-video tools (Mindstamp, Stornaway,
H5P, Cinema8). The course platforms rent a player (Kajabi and Thinkific run on Wistia) and do the
basics well: adaptive streaming, captions, transcripts, AI chapters. None of them lets a creator
build a lesson from moments of existing videos, put a real form inside a video, branch a learner
down a path, keep timestamped notes, or see per-second engagement. A coaching app needs the same
player for exercise demos and workouts; a studio app needs it for films; chat already plays video.

Creators also bring video from where it already lives: YouTube, Vimeo, Wistia, a plain file. An
app can't require every video to be re-uploaded to one vendor.

Today: chat has a Mux provider (`packages/chat/src/server/mux.ts`); ADR 0012 plans the media value
(with video), uploads, signed links and annotations; `courses` is an idea in features.ts; forms
and product events exist. `pnpm features find video` returns chat and media-library only.

## Decision

Genesis owns the timeline model and the player; video vendors are sources behind adapters. Every
experience (a remixed lesson, a workout, an interactive quiz, a choose-your-own-adventure) is
built from the same four shapes and played by one player.

### 1. Video sources (adapters with declared capabilities)

A **video source** adapter plays, and optionally hosts, video from one vendor. Each declares what
it can do, and the player and the editor offer only what the source supports:

| Capability | What it means |
| --- | --- |
| `host` | Genesis uploads to it and it encodes (uploads come through ADR 0012's contract or the vendor's direct upload) |
| `signedPlayback` | Short-lived playback tokens, so only people the app's rules allow can watch |
| `serverClips` | Clips cut by the vendor without re-encoding (Mux instant clips) |
| `renderClips` | Exact clips rendered as new assets |
| `captions` | Auto-generated captions and word-timed transcripts |
| `storyboard` | Thumbnails for scrubbing |
| `engine` | `native` (Genesis's player renders HLS or MP4) or `embed` (the vendor's iframe player, driven through its API) |
| `events` | Reliable time updates for cues and playback events |
| `offline` | Downloadable for native apps |

Sources, in order:

1. **Mux, the premium source**, ships first with every capability: hosting, signed playback with
   clip bounds in the token, instant clips, free auto-captions and transcripts, storyboards,
   static renditions for exact clips and offline, and Mux Data. chat's Mux code moves here behind
   the adapter, with a deprecated re-export (ADR 0012).
2. **YouTube**: `embed` engine through the IFrame Player API. Plays public and unlisted videos;
   clips by seeking (`start`, `end`) and stopping in the player; cues and playback events from the
   player API's time updates. No signed playback, no download, no vendor captions in our
   transcript (a creator can add one), and YouTube's branding and terms apply.
3. **Vimeo**: `embed` engine through the Vimeo Player SDK, with domain-level privacy. Clips by
   seeking; text tracks when the owner has them; signed playback only through Vimeo's own privacy.
4. **Bunny Stream**: a second hosted source on the `native` engine, for cost at scale: hosting,
   signed (token-authenticated) playback, captions (paid per minute), storyboards, MP4 fallbacks
   for offline, and DRM (MediaCage) where a creator needs it. No instant clips: clips are
   `player` accuracy, or `frame` by rendering.
5. **Plain URL**: an HLS or MP4 address the app already serves, on the `native` engine.
6. Later, as needed: Cloudflare Stream, Wistia.

The same lesson can mix sources: a sequence may hold a Mux clip, then a YouTube clip. The player
switches engines between items; an `embed` item is marked so the editor can say what won't work
(offline, exact cuts, protection).

### 2. The player (web and native)

`genesis-media/player` on the web and a native player in genesis-ui-native. Adaptive playback,
speed, captions and a transcript panel with click-to-seek, chapters on the bar, storyboard
scrubbing, picture-in-picture, keyboard shortcuts, resume, and on the phone downloads, background
audio, AirPlay and Chromecast, each where the source declares it. It plays a **sequence** as one
video, preloading the next item, and renders **cues** as layers through slots (ADR 0013: Compose).

### 3. The timeline model (media-library, primitive, data)

- **Clip**: a reference into a video, never a copy. `{ media, in, out, accuracy }`, a half-open
  range in rational time. `accuracy` is `segment` (the vendor's instant clip; a second or two of
  slack), `player` (the player seeks and stops; embeds), or `frame` (a rendered clip or a static
  rendition). Segment is the default; a clip that must cut exactly (an exercise demo) asks for
  frame. Maps to Media Fragments `#t=`, OpenTimelineIO `source_range` and schema.org `Clip`.
- **Sequence**: items played in order: clips from any sources, title cards, rests and gaps, with
  per-item repeat and rate. A remixed lesson, a playlist, a workout.
- **Cue**: something at a moment of a clip or sequence. `{ at, until?, pause, kind, rect?, gate?, on? }`.
  Kinds are a registry (question, form, poll, hotspot, CTA, chapter, note, timer, link, branch);
  apps add their own. A `form` cue embeds a Genesis form with its validation, drafts and
  destinations. Cues export as WebVTT metadata.
- **Path graph**: nodes (a sequence, a choice, an end) and edges (a choice, an optional condition
  on variables and score), with a default edge and a timeout. Choose your own adventure,
  adaptive assessments, onboarding paths.

### 4. Playback events

The player writes product events (ADR 0010) using the xAPI video profile's verbs (initialized,
played, paused, seeked, completed, terminated) and its played-segments result, plus cue answers
and the path taken. Completion rules read played segments, so scrubbing can't fake completion;
heatmaps and drop-off come from the same rows. An xAPI and cmi5 export is planned, not in v1.

### 5. Transcripts, chapters and notes

Word-timed transcripts (from the source's captions, or uploaded) are searchable across a library
and are the remix interface (select words, get a clip). Chapters and summaries are drafted by
genesis-ai and edited by a person. Learner notes and coach comments at a moment are ADR 0012's
annotations, with no new primitive.

### 6. Modules on top

Built from the primitives, each switched on per tenant (ADR 0005): **Courses** first (lessons,
drip, completion rules, certificates), then **Workouts** (an exercise is a clip plus metadata; a
workout is blocks of steps that compile to a sequence with timer cues), the **Video studio**
(library search, transcript clip picking, a sequence editor, cue placement), **Interactive paths**
(a node-canvas editor and path analytics), video analytics, an AI tutor over the transcripts,
localization, live-to-replay and video replies. Order after Courses and Workouts follows demand.

## Where an app customizes (ADR 0013)

| Piece | Configure | Brand | Compose | Adapt | Own |
| --- | --- | --- | --- | --- | --- |
| Player | speeds, controls, autoplay, completion rule | tokens, icons | control bar, cue layers, end screen | video sources | a signature player look |
| Clip, sequence | accuracy, cards, repeats | card styles | — | clip rendering | editorial rules |
| Cues | kinds on, gates | overlay styles | renderers per kind | — | a custom cue kind |
| Path graph | variables, timeouts | choice buttons | choice screen | — | the story |
| Workouts | block types, units | timer look | workout screen parts | wearables, later | a coach's programming method |

## Glossary

- **video source**: an adapter for a vendor that plays (and may host) video, with declared
  capabilities. Not "provider" in new code (chat's `VideoProvider` becomes a source).
- **clip**: a time range of a video, by reference. Not "segment" (that is the streaming unit).
- **sequence**: items played in order as one. Not "playlist" in code.
- **cue**: something placed at a moment of a clip or sequence. Not "annotation" (ADR 0012's
  annotation is a comment at a place; a learner's note is an annotation, a question is a cue).
- **path**: a graph of sequences joined by choices. Not "branching video" in code.
- **accuracy**: how exactly a clip cuts: `segment`, `player` or `frame`.

## Alternatives

- **One vendor (Mux only)**: rejected. Creators already host on YouTube and Vimeo; requiring a
  re-upload blocks adoption, and Bunny is far cheaper at scale. Mux stays the premium source with
  every capability.
- **Embed each vendor's player as is, no Genesis player**: rejected. Cues, sequences across
  sources, completion rules and events would differ per vendor.
- **Buy interactive video (Mindstamp, H5P)**: kept as a possible export or embed; the model stays
  ours so forms, events and paths are one system.
- **Copy clips as new files**: rejected as the default; references cost nothing and survive edits.
  Rendered clips remain for `frame` accuracy.

## Decisions taken with this ADR

1. Many video sources behind one adapter contract; Mux first and premium, then YouTube, Vimeo and
   Bunny.
2. Clips cut at segment accuracy by default; `frame` per clip when it must be exact.
3. Playback events stored in our own table in the xAPI video vocabulary; export later.
4. Courses is the first module, Workouts next.

## Consequences

- media-library (being built now, uploads first) gains the video value, the source adapters and
  the timeline model. The Mux source lands first, moving chat's Mux code behind it.
- Build order: (1) Mux source, player, playback events; (2) clips, sequences, cues; (3) Courses,
  then Workouts; (4) paths, analytics, AI. YouTube, Vimeo and Bunny sources join in (2), with
  the capabilities above.
- New features in features.ts for each primitive and module, at `idea`, with this ADR linked.
- chat's `VideoProvider` is renamed to a video source with a deprecated alias for one major.
