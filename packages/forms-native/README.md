# @marktiderman/genesis-forms-native

The React Native renderer for [Genesis Forms](../forms/README.md). `<FormFocus>` shows a form one
question (or content step) per screen, on the same headless controller the web's `<Form>` uses
(`useFormController` from [`genesis-forms-react`](../forms-react/README.md)), so it steps,
validates, sends and announces exactly as the web does in focus layout. A **flow** (onboarding, a
check-in, a guided exercise) is simply a form definition shown here.

It draws with plain React Native styles whose colors come from theme roles, so it works with or
without NativeWind: iOS system colors by default (light and dark mode, increased contrast), Genesis
tokens on Android, and your brand's `tint`.

```bash
pnpm add @marktiderman/genesis-forms-native @marktiderman/genesis-forms @marktiderman/genesis-forms-react @marktiderman/genesis-ui-native
```

## Use

```tsx
import { Stack } from "expo-router";
import { FormFocus } from "@marktiderman/genesis-forms-native";
import { ScreenContainer } from "@marktiderman/genesis-ui-native";

export default function CheckInScreen() {
  return (
    <ScreenContainer>
      <FormFocus
        form={checkIn}               // a defineForm result or a canonical definition
        hostOptions={{ coaches }}    // lists for optionsFrom: { source: "host", key }
        linkParams={params}          // props.prefill questions take ?gym=… from the link
        onSubmit={send}              // or outbox={outbox}, below
        screen={Stack.Screen}        // the title goes in the native navigation bar
        theme={{ tint: brand.primary }}
        haptics={{ selection: () => Haptics.selectionAsync() }}
      />
    </ScreenContainer>
  );
}
```

### Drafts and the offline outbox

Pass `useFormDraft`'s result as `draft` and a `createSubmitOutbox` outbox as `outbox`:

```tsx
const drafts = createDraftStore(AsyncStorage);
export const outbox = createSubmitOutbox({ storage: AsyncStorage, send, createKey: Crypto.randomUUID });
NetInfo.addEventListener((s) => outbox.setOnline(s.isConnected !== false));
outbox.start();

function CheckIn() {
  const draft = useFormDraft(checkIn, { store: drafts, respondent: userId, hostOptions });
  return <FormFocus draft={draft} outbox={outbox} screen={Stack.Screen} />;
}
```

- While an async store reads the draft (`draft.engine` is null), a loading screen shows; the form
  then resumes where the respondent was, with a note saying so (or that the form changed and starts
  again).
- When the app goes to the background the draft is saved at once (and `onProgress`, if any, runs).
- Send queues the event log and the hidden inputs under one idempotency key per response
  (`createKey`, else `crypto.randomUUID`, else the outbox's). The ending shows once the submission
  is stored, and only then is the draft cleared. If storing fails, the answers and the draft stay,
  with "Try again", which queues the same submission.
- On the ending, the `status` slot follows the queued submission: waiting for a connection,
  sending, sent, or failed (with a retry).

The `draft` and `outbox` props are typed structurally (`FormDraftLike`, `OutboxLike`), so your own
implementations fit as well.

## What it does

| | |
| --- | --- |
| Steps | One block per screen: questions, and content blocks (`heading`, `text`, a host's `callout`) as steps of their own. Progress counts `respondentPath`, so a question a link prefilled and hides is neither shown nor counted. |
| Navigation | Next (Send on the last step), Back, auto-advance after a single pick (never from the last question, never for "Other"); the return key on a one-line answer is Next. |
| Keyboard | Inside the app's keyboard-aware scroll view (`KeyboardScrollProvider`, as `GenesisNativeApp` sets up), else a `KeyboardAvoidingView`; a new text step takes the keyboard, any other dismisses it. Each step starts scrolled to the top. |
| Accessibility | Each question is a header named with "required"; controls are named by the question with the description and error as their hint; options are radios or checkboxes with `accessibilityState` and "2 of 5"; a refused step and a waiting upload are announced (`announceForAccessibility`); VoiceOver moves to each new step's question, the ending's title and the error summary. Text scales with Dynamic Type (minimum heights, never fixed ones); Reduce Motion turns off the step transition. |
| Errors | The step's error under its answer. A send that finds several answers wanting (an earlier answer a filter cleared) moves to the first and lists them all, each a link back. |
| Header | No custom header: pass `screen={Stack.Screen}` (and `headerOptions`) and the form's title goes in the platform navigation bar. Without it, the title is drawn above the first step. |

## Field kinds

Registered by kind in genesis-forms-react's ranked registry (`defaultRegistry`):

| Kind | Native control |
| --- | --- |
| `short-text`, `long-text`, `email`, `phone` | A text input with the keyboard and autofill hints from the kind's manifest; long text is multi-line. |
| `number` | Typed, with the keypad for its range; a comma works as the decimal point. |
| `date` | Typed: digits become `YYYY-MM-DD` and a whole date is read back in words. Register a picker for `date` with a higher rank if your app has one installed. |
| `single-choice`, `dropdown`, `multi-choice` | Full-width rows with descriptions and https pictures; `visibleOptions` through a filter; a search box when `isSearchable` (from all the options); "Other" with a text box capped at `OTHER_MAX_LENGTH`. |
| `rating`, `nps`, `yes-no` | A wrapping row of large radios; stars for `display: "stars"`; NPS's end labels read on the ends. |
| `consent`, `calculated` | One checkbox; the engine's value, read-only. |
| `photo` | Through `photos={{ pick, upload }}`: your picker (expo-image-picker, say) and your storage. Type, size and count are checked first; the form waits for uploads before moving on. Without a host it says photos can't be added. |

A kind with no native renderer (the structured kinds, for now) shows its question and a note, and
logs once. Add or replace one:

```tsx
const registry = defaultRegistry.extend([{ type: "date", rank: 10, Component: MyDatePicker }]);
<FormFocus registry={registry} … />
```

Content kinds have their own registry (`defaultContentRegistry`, `createContentRegistry`); a kind
with no renderer shows its display text (`contentText`). A `callout` is drawn with `props.title`
and `props.tone` (`info`, `success`, `warning`); register the kind in genesis-forms on every side
that parses the form (`registerContentType({ type: "callout", label: "Callout" })`).

## Slots

The web kit's names: `header`, `brand`, `progress`, `navigation`, `ending`, `errorSummary`, plus
`notice` (a draft put back, answers saving) and `status` (a queued submission). Replace one with
`slots`, feed one with `slotProps` (`slotProps={{ ending: { actions: <Done /> } }}`), remove one
with `null`. The defaults are exported (`DefaultEnding`, …) to wrap rather than copy.

## License

MIT
