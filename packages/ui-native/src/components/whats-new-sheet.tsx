/**
 * WhatsNewSheet — release notes in a sheet, shown once and closed with "Got it".
 *
 * The sheet behind genesis-native's updates block (`WhatsNewSheet`), which maps its own notes onto
 * `NativeWhatsNewNote` and renders this.
 *
 * @stability Beta
 */
import { View } from "react-native";
import { NativeButton } from "./button";
import { NativeSheet, NativeSheetScrollView } from "./sheet";
import { NativeText } from "./text";

/** One note. */
export interface NativeWhatsNewNote {
  /** Unique within the sheet (a version, a note id). */
  key: string;
  title: string;
  body?: string;
  /** With `onOpenNote`, the note gets "Learn more". */
  url?: string;
}

export interface NativeWhatsNewSheetProps<N extends NativeWhatsNewNote = NativeWhatsNewNote> {
  notes: readonly N[];
  /** Close and remember. */
  dismiss: () => void;
  /** "Learn more" on a note with a `url`: the sheet closes (and is remembered), then this opens it. */
  onOpenNote?: (note: N) => void;
  /** Default "What's new". */
  title?: string;
  /** Default "Got it". */
  doneLabel?: string;
  /** Default "Learn more". */
  learnMoreLabel?: string;
  /** The sheet's; each note is `{testID}-{key}`, Done `{testID}-done`, Learn more `{testID}-open-{key}`. */
  testID?: string;
  /** A note's testID. Default `{testID}-{key}`. */
  noteTestID?: (key: string) => string;
}

export function NativeWhatsNewSheet<N extends NativeWhatsNewNote = NativeWhatsNewNote>({
  notes,
  dismiss,
  onOpenNote,
  title = "What's new",
  doneLabel = "Got it",
  learnMoreLabel = "Learn more",
  testID = "native-whats-new",
  noteTestID = (key) => `${testID}-${key}`,
}: NativeWhatsNewSheetProps<N>) {
  return (
    <NativeSheet open onOpenChange={(open) => (open ? undefined : dismiss())} testID={testID}>
      {/* The notes scroll once they pass the sheet's height. */}
      <NativeSheetScrollView contentContainerStyle={{ gap: 16, padding: 24 }}>
        <NativeText preset="h3" accessibilityRole="header">
          {title}
        </NativeText>
        {notes.map((note) => (
          <View key={note.key} style={{ gap: 4 }} testID={noteTestID(note.key)}>
            <NativeText preset="label">{note.title}</NativeText>
            {note.body ? (
              <NativeText preset="body-sm" className="text-muted-foreground">
                {note.body}
              </NativeText>
            ) : null}
            {note.url && onOpenNote ? (
              <NativeButton
                variant="ghost"
                size="sm"
                onPress={() => {
                  // Closed first: the note's screen opens with "what's new" seen.
                  dismiss();
                  onOpenNote(note);
                }}
                testID={`${testID}-open-${note.key}`}
              >
                {learnMoreLabel}
              </NativeButton>
            ) : null}
          </View>
        ))}
        <NativeButton onPress={dismiss} testID={`${testID}-done`}>
          {doneLabel}
        </NativeButton>
      </NativeSheetScrollView>
    </NativeSheet>
  );
}
