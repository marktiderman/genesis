# Figma guidelines for agents

How the Genesis design files are set up, and the rules an agent follows when it reads or changes
them. `docs/DESIGN-LIBRARY.md` describes the library's internals (tokens, brand modes, Code
Connect, the ratchet); this page is the working practice on top of it.

## The files

| File | What it is | Who writes to it |
|---|---|---|
| **Genesis · Design System** (the library) | Every component Genesis ships, as Figma components bound to the token variables, with Code Connect to the code. One file for web and native. | The Genesis library owner (one session at a time). |
| **One app file per consumer app** | That app's screens, built from library instances in the app's Brand mode. Named `<App> · App`. | The app's own sessions. |
| **Exploration files** | Drafts, mood boards, old designs. Read for intent; never built against. | Anyone; mark them superseded once an app file exists. |

An app file never defines its own colours, text styles or components: it enables the library
(Assets → Libraries) and sets variable modes on its frames. If something an app needs is missing
from the library, that is a **gap**, not a reason for a local component (see "Gaps").

## The library's structure

- **Pages, one per area.** Native: Foundations, Actions, Text, Surfaces, Forms, Feedback,
  Navigation, Lists, Overlays, Messages, Icons. Web: `Web · Shell`, `Web · Headers`, `Web · Lists`,
  `Web · Settings`, `Web · Forms`, `Web · Primitives`, `Web · Overlays`, `Web · Resource`,
  `Web · Navigation`, `Web · Data`, `Web · Pages`. Package pages: `Chat · Native`, `Chat · Web`,
  `Native · App`, `Notifications`, `Product`, `Forms · Native`, `Forms · Web`, `Sites`, `Studio`.
- **One component (set) per exported code component**, named like the export (`NativeButton`,
  `DataTable`, `Section/Hero`), prefixed per package only where names clash
  (`FormsNative/Button`, `Studio/…`). Variants mirror the code's enum props; booleans mirror
  optional parts (`Show footer`); text properties mirror text props; `INSTANCE_SWAP` mirrors
  slots (`Icon`, `Content`, `Actions`). A sub-part reused inside a set is its own component
  (`DataTable/Cell`, `AppShell/NavItem`).
- **Variable collections.** `Primitives` (raw palette, hidden), `Brand` (one mode per consumer
  app: primary, signal, bubble, link, fonts), `Color` (semantic roles; modes Light, Dark; aliases
  into Brand), `Radius`, `Spacing`. Every fill, stroke and text colour in a component is bound to
  a `Color` variable. Tints are a 10–15% opacity tone fill over a `background` fill, never an
  opaque tone fill under dark text. White glyphs on a dark surface bind to `on-accent`, which is
  the same primitive in every mode, never to `background`.
- **Icons** are `icon/<lucide name>` on the Icons page, 24×24, strokes bound to `foreground`.
  Native code uses semantic names (`home`, `close`); the NativeIcon template translates.
- **Composed, no template by design.** A screen-level component assembled from others (an inbox
  screen, a settings page) is listed in that package's `figma/code-connect.json` under `composed`
  and is not a library component. A component the code keeps private (not exported) can be drawn
  for completeness but gets no template and is marked `private` in the page note.

## App files

- **Pages:** `Cover`; `<App>` for phone screens (393×852); `<App> · Web` for desktop (1440×900);
  one more page per extra zone or brand (a second Brand mode gets its own page).
- **Frames are named by route** (`(tabs)/today`, `studio/galleries/$id`, `admin/decks`), laid out
  in a grid with 80px (phone) or 120px (web) gaps. A state of a screen is a second frame named
  `<route> · <state>` (`viewer`, `empty`, `error`).
- **Every top-level frame sets its modes explicitly:** Brand = the app's mode, Color = Light or
  Dark (`setExplicitVariableModeForCollection`). After the library republishes, the file's
  imported variable copies can go stale (the Brand collection appears without the newest modes);
  rebind by key and set the modes again. Several stale copies can coexist; use the one that lists
  the mode you need.
- **Library instances for everything that has one**, configured through overrides and properties.
  Never detach, never copy a library component into the file, never append children into an
  instance (place content frames over it, as the sample screens do). Fonts: load the brand's
  families before writing text (`getStyledTextSegments` on an existing frame shows them).
- **Sample data only.** Invented people and records. Never a real customer's data, and nothing
  public in the Genesis repository names a consumer app.

## Gaps

When a screen needs something the library lacks (a slot, a count, a missing component):

1. Check the code first. The library mirrors code: if the code component has the prop, the
   library component gains the property or slot; if the code lacks it, the gap is a Genesis code
   gap, written up as such (reuse → extend → invent, FRAMEWORK.md Part 1).
2. In the app file, build the piece as a plain frame named `<App>/Name` so the screen is complete.
3. Send the gap to the library owner (the Figma session) with the route and what the code
   supports. The owner batches gaps into a library pass, publishes, and tells the app sessions,
   who then swap the plain frames for the new instances.

Never close a gap with a local component, a detached instance, or an override that fakes a
variant the component doesn't have.

## Workflow for a feature

1. Prototype the screen in the app file from library components before writing code. The
   library is the source for components; the route code is the source for behaviour.
2. Build the code from the same components (Dev Mode shows the Genesis JSX for any instance via
   Code Connect; `pnpm check:code-connect` keeps every exported component mapped).
3. When code and design diverge, fix the one that is wrong; when both are right and differ, the
   library wins for components and the code wins for flow.

## Publishing

- **Library:** after any library change, a person publishes it (Assets → Publish, "Genesis ·
  Design System"). Batch changes and publish once per round; tell the app sessions when it lands.
- **Code Connect:** templates publish from `main` through the Code Connect workflow
  (`npx @figma/code-connect connect publish --label React`); the active library and framework are
  set once in Admin → Settings → Code Connect.
- **Versions:** the library has no branches; a breaking change to a component keeps its id and key
  (edit in place) so app-file instances survive, and renames a property only with the matching
  template change in the same PR.

## Working through the Figma MCP

- Load the `figma-use` skill before any `use_figma` call (and `figma-generate-library` for library
  work, `figma-generate-design` for screens). Call `create_session` once per task.
- One page switch per call; small scripts (large ones return "overflow": split and retry once);
  return the ids you create; keep state in a scratch file, not in the Figma file.
- Only one writer in the library at a time; parallel builders work in different files, or on
  disjoint new pages and never on the same component set.
- Screenshot what you built (`get_screenshot`, modest `maxDimension`) and fix clipping, overlap
  and empty slots before reporting. A result is verified by a read-back, not by the script
  having run.
- The Figma REST API needs `projects:read` to list a team's files; `file_content:read` alone
  reads a known file.
