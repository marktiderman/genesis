# @marktiderman/genesis-forms-web

The web renderer for [Genesis Forms](../forms/README.md), built on Genesis UI components and tokens.

```tsx
import { Form } from "@marktiderman/genesis-forms-web";

<Form
  form={eventFeedback}                 // a defineForm result or a canonical definition
  layout="focus"                       // one question at a time; or "classic"
  options={{ hidden: { owner: "Sam" } }}
  onChange={(state) => saveDraft(state)}
  onSubmit={(engine) => submit(engine.getState().events)}
/>
```

```css
@import "tailwindcss";
@import "@marktiderman/genesis-ui/styles.css";
@import "@marktiderman/genesis-forms-web/styles.css";
```

- **Layouts:** `focus` moves through the respondent's path one question at a time, with Back, a
  progress bar and Enter to continue (Ctrl/Cmd+Enter in long text; Enter on a focused radio or
  checkbox too). After a single pick (rating, NPS, yes/no, one choice) it moves on by itself
  (`autoAdvance={false}` turns it off): only a click, tap or Space counts as a pick, arrow keys just
  move through the options, and it never moves on from the last question, so Send is always a
  deliberate press. `classic` shows every visible question; a failed submit focuses an error summary
  above the fields that links to each invalid one.
- **Presentation:** `presentation="embedded"` (the default) is a block inside your own page.
  `presentation="page"` is the respondent's whole screen, for a QR code or a shared link, Typeform
  style: it fills the viewport (`min-h-dvh`) with no card around it. In focus layout each question
  sits centred in a `max-w-xl` column under a thin progress bar pinned to the top edge (it fills
  with questions answered; "Question N of M" is its `aria-valuetext`). The question is large, the
  form title introduces only the first question (then stays for assistive tech), and rating, NPS
  and yes/no become an even grid of large targets. Single and multiple choice rows are full width
  with a letter key, a filled selected state and a check mark; while focus is in the group, pressing
  an option's letter picks it. OK is a large primary button with a "press Enter ↵" hint ("Ctrl +
  Enter" or "⌘ + Enter" in long text) shown only on fine-pointer devices, and Back is a quiet icon
  button at the top-left. Each new question fades and slides in (CSS `@starting-style`, none with
  `prefers-reduced-motion`). The ending is centred and large. In classic layout, page mode is one
  scrolling page, Google Forms style: a header card with the title and description, each question
  in its own card (red-edged while invalid), Send at the end.
  `brand={{ name: "Acme", logo }}` shows an organisation's or business's logo (an image URL or an
  element; its initials without one) and name small at the top of every step and on the ending.
  Custom slots and renderers can match with `useFormPresentation()`, which returns
  `{ presentation, layout }`.

  ```tsx
  <Form form={eventFeedback} presentation="page" brand={{ name: "Acme" }} onSubmit={send} />
  ```

- **Save answers as they go:** with the definition's `settings.saveProgress` on, `onProgress(engine,
  { step, total, fieldId })` is called a moment after each step forward (`PROGRESS_DELAY_MS`; in
  classic layout, `CLASSIC_PROGRESS_DELAY_MS` after the answers change), with `fieldId` the
  furthest question reached (`formProgress` from genesis-forms) and `engine.answers()` the answers
  so far. It never holds up Next: a rejection is ignored (the next call carries every answer
  again), a pending call goes at once on `pagehide`, and none is made once the form is submitted.
  Under the first question a note says "Your answers save as you go." (`progressNotice`; `null`
  hides it). Without `onProgress`, or with the setting off, nothing is saved and nothing is said.

  ```tsx
  <Form form={feedback} presentation="page" onProgress={(engine, p) => saveDraft(engine.answers(), p.fieldId)} onSubmit={send} />
  ```

- **Accessible by default:** group questions are a `fieldset` with a `legend`, and rating, NPS and
  yes/no are real radio groups (arrows select). Every control carries `aria-invalid`,
  errors are linked with `aria-describedby`, and the NPS end labels are read with 0 and 10. In
  focus layout, focus moves to each new question (the input of a text field, otherwise the visible
  question text), a failed Next is announced once through a live region, and the ending heading
  takes focus. Choice rows are full-width labels at least 44px tall; motion respects
  `prefers-reduced-motion`. Ids are unique per form, so two forms can share a page.
- **Send word and required note:** the send button says `submitLabel` (default **Send**) in every
  layout. When any question is required, the title shows "\* Required" (`requiredLabel`, default
  "Required"; `null` hides it).
- **Theme:** `theme={{ accent: "#f97316", headerImage: url, headerImageAlt }}` sets the form's own
  primary colour (buttons, selected options, stars, progress, focus rings) and a banner over the
  title. The accent is adjusted only as far as contrast needs: at least 3:1 against the page in light
  and dark, and text on it at least 4.5:1. It takes `#rgb`, `#rrggbb` or `rgb()`; anything else is
  ignored. `themeColors(accent)` returns the colours it would use.
- **Question types:** besides text, email, phone, rating, NPS, choices and yes/no, there are
  `dropdown` (a native select), `number` (min, max, step; the decimal keypad on phones), `date` (the
  browser's date picker) and `consent` (one checkbox). A rating can show end labels (`lowLabel`,
  `highLabel`) and `display: "stars"`; NPS takes the same labels.
- **Submitting:** the ending shows once `onSubmit` resolves. If it rejects, the completed response
  stays on screen read-only (a completed response is final), Back is hidden, and "Try again"
  (`retryLabel`) resends the same answers.
- **Engines:** `<Form form={def}>` owns an engine and starts a new one when `def` changes identity,
  so keep the definition stable (module scope or `useMemo`). Pass `engine` (from `useForm`) to read
  state outside the form; `form` and `options` are then unused, and a new `engine` starts the form
  over.
- **Extension ladder:** `slots` replaces a part (`header`, `brand`, `progress`, `navigation`,
  `ending`, `errorSummary`), `null` removes it, and `slotProps` feeds it (and wins over the defaults). A custom
  ending can mark an element `data-gf-focus` to receive focus; a custom error summary can mark itself
  `data-gf-error-summary` (with `tabIndex={-1}`) to be focused after a failed submit.
- **Renderers** come from a registry. `defaultRegistry` is shared by every `<Form>` without a
  `registry` prop, so prefer `extend()`, which returns a new registry and changes nothing else:
  `<Form registry={defaultRegistry.extend([{ type: "email", rank: 10, Component }])} />`.
  `defaultRegistry.register(entry)` mutates the shared registry in place, for every form in the app.

Renderers: short and long text, email, phone (`type="tel"`), rating, NPS, single choice, multiple
choice, yes/no, and the structured types:

- **`list`** (goals, action items, three wins) and **`table`** (an action plan with What / Who /
  By when, pros and cons) add, remove and reorder entries (SortableList: drag, keyboard and a Move
  menu).
- **`media-notes`** (lecture notes, reviewing a recorded call) takes a typed time (`m:ss`,
  `h:mm:ss` or seconds). Wrap the form in `MediaTimeContext` to link it to your video or audio
  player: `currentTime` prefills "Add note at 1:23" and `seek` plays from a note.
- **`text-highlights`** (annotating an article, a policy or a contract) takes highlights by
  selecting words in the passage or typing them. The passage is the field's `text` prop, or the
  value of `SourceTextContext` around the form.

```tsx
<MediaTimeContext.Provider value={{ currentTime: () => player.currentTime, seek: (s) => player.seek(s) }}>
  <SourceTextContext.Provider value={article.body}>
    <Form form={videoNotes} onSubmit={send} />
  </SourceTextContext.Provider>
</MediaTimeContext.Provider>
```

`useMediaTime()` and `useSourceText()` read them in a custom renderer.

**`photo`** (a picture of broken equipment) has "Choose a photo" and, on a phone or tablet, "Take a
photo" (the camera), checks each file's type, size and the count before uploading, shows a thumbnail
(or the file's name when the browser can't draw it, such as HEIC) and removes one. The file goes to
the host, which stores it and resolves to its reference; the answer keeps only that:

```tsx
<Form
  form={feedback}
  onUpload={async (file, field) => {
    const { ref } = await uploadSomewhere(file, field.id); // your storage
    return ref; // { id, name, type, size }
  }}
  onSubmit={send}
/>
```

A rejected upload shows under the field. While a photo is uploading the form neither moves on nor
sends (it says "Wait for the photo to finish uploading."). Without `onUpload`, or an
`UploadContext` around the form, a photo field says photos can't be added here. `photoFileProblem`,
`photoFileType` and `photoAccept` are the renderer's own checks, for a custom one.

A **`calculated`** field shows the value the engine worked out from other answers, read-only, in an
`<output>` named by the question that announces changes politely. It follows the field's `format`
and `decimals`, and shows a dash until there is a value.

## License

MIT
