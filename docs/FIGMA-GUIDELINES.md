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

**One Figma file per repository.** The Genesis repository's file is the library; each consumer
app's repository has exactly one app file. An exploration file is folded into the app file (as a
page) and archived once the app file exists; two live files for one repo is the sprawl this rule
removes.

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
  slots (`Icon`, `Content`, `Actions`). A sub-part that the code exports and the ratchet checks gets its own
  set (`AppShell/NavItem` for `NavItem`); a sub-part the code keeps inside the parent
  (`NativeCardHeader`, `NativeDialogTitle`, a table cell) stays a layer inside that parent's
  component and never becomes a second library component.
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
  public in the Genesis repository names a consumer app. An app file may own a local `Sample`
  variable collection (strings, numbers, booleans) with modes such as `Empty`, `Typical` and
  `Full`, and bind text and visibility in its frames to it, so one frame shows each data state;
  variables are configuration, not components. What an app file never owns is a component with
  its own variants: a state a library component can't show is a library gap.

### Prototype setup in an app file

What makes the app prototype feel live, all with library instances:

- **`Sample` data collection**, modes `Typical`, `Empty`, `Full` (strings, numbers, booleans).
  Text and visibility bind to it. A number variable binds to text content in the Figma UI;
  the Plugin API's `characters` binding takes string variables, so a count written by a script
  gets a string partner set by an expression (`count + " selected"`), and the same when a value
  needs formatting. Reactions may `SET_VARIABLE`, `SET_VARIABLE_MODE`, `CONDITIONAL` and
  `CHANGE_TO`; variant properties bind to variables, which is how a single-select row works.
- **Photos as paint styles** named `Sample/Photo/<name>` (Figma has no image variables); replacing
  the style replaces the photo everywhere, inside library instances too.
- **Interactive components come from the library**: switch, rating, chip, gallery tile and tab
  bar carry their own `change to` interactions, so a frame never re-wires them. A tab bar is
  wired once in the app's shell frame, not on every screen.
- **A `Start here` frame** is the first flow on each page: how to use the prototype, a button per
  flow, the data-mode switch, and URL links to the other pages (prototype links can't cross
  pages).
- **Every screen scrolls.** Phone: the content frame is auto-layout with `HUG` height and
  bottom padding for the tab bar and status strip; the screen-container instance has its root
  and content-area fills cleared (the frame itself carries `background`) and sits above the
  content in z-order with the status strip on top; the frame has `overflowDirection = VERTICAL`,
  `clipsContent`, and `numberOfFixedChildren = 2` so the bars stay put while content scrolls.
  Web: the content frame over the shell's main region has `clipsContent` and
  `overflowDirection = VERTICAL`, so it scrolls inside a fixed sidebar and header. A screen shorter
  than the viewport simply doesn't scroll.
- **A build-status line** at the foot of every frame, a plain frame generated by a script in the
  app repo from its route files and feature list, so a reviewer knows what is built.

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

## Workflow for a feature: design, approve, then build

A new idea or a change to an existing screen is designed and approved in Figma before any code
is written. The maintainer approves designs, not pull requests, for product decisions.

1. **Propose.** On the route page the feature belongs to, in a section named
   `Proposal · Draft · <slug>` below the live rows, build the screens from library instances: one
   frame per route or state, named `<slug>/<route>` (for a change to an existing screen, a copy of
   that frame with the change applied). Wire the frames into the live prototype: the live frames
   where the feature would appear get hotspots into the proposal, and the proposal's tabs, nav
   and back controls return to the live frames, so the maintainer walks the app as built and
   arrives at the new screens in context. Prototype links can't cross pages, which is why the
   section sits on the route page and not on a page of its own. A short note frame in the section
   states the goal, what changes, and any Genesis gap it needs (plain `<App>/Name` frames for
   those).
2. **Review.** Rename the section `Proposal · In review · <slug>` and tell the maintainer the
   app's own Present link and where to go in it; add a flow starting point named after the slug
   only when the proposal has no natural entry from the live screens. Iterate there: every round
   is an edit to those frames, never a second copy. Questions for the maintainer go as numbered
   options with a recommendation.
3. **Approve.** The maintainer says "approved" (in chat or as a Figma comment on the note frame).
   The agent records it where Figma keeps it: it marks the proposal's section **Ready for dev**
   (Dev Mode status) with the message `Approved <date> by <maintainer>`. Figma notifies people
   who have opened the file in Dev Mode on a Full or Dev seat, and fires the
   `DEV_MODE_STATUS_UPDATE` webhook where one is registered for the file (none is yet; the
   route-coverage check reads statuses by polling). It renames the section
   `Proposal · Approved · <slug>` and promotes the frames: a changed screen's proposal copy is
   renamed to the route name and takes the live frame's place (the old frame is deleted after
   every reaction that targeted it is repointed to the new one, so links hold); a new screen's
   frame is renamed from `<slug>/<route>` to `<route>` and moved into the live rows; the entry
   hotspots become permanent. The date goes in the note. A
   rejected proposal's section is renamed `Proposal · Dropped · <slug>`, its entry hotspots are
   removed, and it is deleted a month later. An agent never sets the status without an approval it can
   quote. On a plan without the "Completed" status, `Built` is the section move alone.
4. **Build.** Only now does code start. The implementation PR links the approved frames (file,
   page, node ids) in its body, is built from the same library components, and its preview (the
   repo's `see-it` page) is checked against the frames before it is marked ready. Code that departs
   from the approved design goes back to step 2, not into the PR.
5. **Close.** When the PR merges, the section is renamed `Proposal · Built · <slug>` with the PR
   link in the note; a quarter later it is deleted (the route page is the record).

**Scope of the gate.** Through the gate: a new screen, a new flow, a layout change, or a new
library component. Code-first, with the repo's `see-it` preview as the review: bug fixes, copy
fixes, a new state built from existing components, and small visible tweaks; the agent updates
the route frame after the merge so the file stays true. A change the maintainer has already
decided in writing is code-first too. When unsure, it is a proposal; a small team keeps the
gate narrow so proposals don't go stale.

### Proposal sections

A proposal is a section on its route page, named `Proposal · <status> · <slug>` with status
`Draft`, `In review`, `Approved`, `Built` or `Dropped`, placed below the live rows. Frames keep
their route names inside the slug prefix; the library's Brand and Color modes are set on each
frame as on the live ones. Nothing in a proposal is detached or local; a gap is a plain
`<App>/Name` frame and a line in the note. The app's prototype is one persistent thing: live
frames plus the proposals plugged into them.

**Definition of ready.** A proposal goes to `In review` only when its note lists, and its
frames show:

- the default state, plus empty, loading and error for any screen that loads data;
- every interactive state the flow reaches (open menus, selected rows, validation);
- final copy, not placeholder text;
- phone and web frames where the route exists on both;
- accessibility notes: focus order, labels for icon-only controls, contrast checked in Light and
  Dark;
- the Genesis gaps it needs.

Anything missing is written in the note as "not designed: …", so the reviewer decides with eyes
open and the builder doesn't invent it.

**Sections.** Route pages group live frames into sections by area (a zone, a tab, a record
type), and each proposal is its own section as above. Dev Mode status is set on the section, so
one status covers a proposal.

### Code Connect keeps the two in step

Build the code from the same components (Dev Mode shows the Genesis JSX for any instance via
Code Connect; `pnpm check:code-connect` tracks every covered visual export as `required` (has a
template), `notYet` or `composed`, and fails on an export that is none of them). When code and
design diverge after approval, the approved frames win for layout and components and the route
code wins for behaviour; either way the fix is a step-2 round, not a silent change.

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
- The Figma REST API lists a team's files through the folder endpoints, which need the
  `folders:read` scope (`projects:read` is the legacy name); `file_content:read` alone reads a
  known file.
