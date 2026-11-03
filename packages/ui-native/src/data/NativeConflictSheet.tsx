import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { titleCase, type WriteConflict } from "@marktiderman/genesis-core";
import { NativeButton } from "../components/button";
import { NativeSheet, NativeSheetScrollView } from "../components/sheet";
import { NativeText } from "../components/text";

/** The words NativeConflictSheet shows. The same keys as genesis-ui's `uiMessages.conflict`. */
export interface NativeConflictSheetMessages {
  /** `{noun}`: the record's noun ("task"). */
  title: string;
  description: string;
  /** When their change already matches what was tried. */
  same: string;
  theirs: string;
  mine: string;
  /** An empty value in the comparison. */
  empty: string;
  keepMine: string;
  takeTheirs: string;
  /** The noun when the screen gave none. */
  record: string;
}

const english: NativeConflictSheetMessages = {
  title: "Someone else changed this {noun}",
  description: "They saved a change after you opened it. Theirs is next to yours below: keep yours to save it over theirs, or take theirs and drop your changes.",
  same: "Their change already matches yours, so there's nothing to choose.",
  theirs: "Theirs",
  mine: "Yours",
  empty: "Empty",
  keepMine: "Keep mine",
  takeTheirs: "Take theirs",
  record: "record",
};

/**
 * Props for {@link NativeConflictSheet}.
 *
 * @stability Beta
 */
export interface NativeConflictSheetProps {
  /** The conflict to show (`writeConflict(error, values)`); null keeps it closed. */
  conflict: WriteConflict | null;
  /** The record's noun ("task"), for the title. */
  noun?: string;
  /** A field's label. Default: the field name, title-cased. */
  label?: (field: string) => string;
  /** A field's value as shown. Default: plain text. */
  format?: (field: string, value: unknown) => ReactNode;
  /** Save these values over theirs, at the version the conflict reported. The sheet waits for it. */
  onKeepMine: () => void | Promise<void>;
  /** Drop these values and show their row. */
  onTakeTheirs: () => void;
  /** Closed without choosing: the changes stay where they are, unsaved. */
  onDismiss: () => void;
  messages?: Partial<NativeConflictSheetMessages>;
  testID?: string;
}

function plain(value: unknown, empty: string): string {
  if (value === null || value === undefined || value === "") return empty;
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * The phone's ConflictSheet: when a save met someone else's change, a bottom
 * sheet shows their value above the one this person tried to save, for each
 * field where they differ, then "Take theirs" or "Keep mine".
 * NativeRecordView's settings sections open it on a `conflict`.
 *
 * @stability Beta
 */
export function NativeConflictSheet({
  conflict,
  noun,
  label = titleCase,
  format,
  onKeepMine,
  onTakeTheirs,
  onDismiss,
  messages,
  testID = "native-conflict-sheet",
}: NativeConflictSheetProps) {
  const w = { ...english, ...messages };
  const [keeping, setKeeping] = useState(false);
  const fields = conflict?.fields ?? [];
  const show = (field: string, value: unknown): ReactNode =>
    format ? format(field, value) : <NativeText preset="body-sm">{plain(value, w.empty)}</NativeText>;

  const keep = async () => {
    setKeeping(true);
    try {
      await onKeepMine();
    } finally {
      setKeeping(false);
    }
  };

  return (
    <NativeSheet
      open={conflict !== null}
      onOpenChange={(open) => !open && !keeping && onDismiss()}
      fitContent
      testID={testID}
    >
      <NativeSheetScrollView>
        <View style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
          <NativeText preset="h4" accessibilityRole="header">
            {w.title.replace("{noun}", noun ?? w.record)}
          </NativeText>
          <NativeText preset="body-sm" className="text-muted-foreground">
            {fields.length > 0 ? w.description : w.same}
          </NativeText>
          {conflict
            ? fields.map((field) => (
                <View key={field} style={{ gap: 4 }} testID={`${testID}-field-${field}`}>
                  <NativeText preset="label">{label(field)}</NativeText>
                  <View accessible accessibilityLabel={`${w.theirs}: ${plain(conflict.theirs[field], w.empty)}`}>
                    <NativeText preset="caption" className="text-muted-foreground">{w.theirs}</NativeText>
                    {show(field, conflict.theirs[field])}
                  </View>
                  <View accessible accessibilityLabel={`${w.mine}: ${plain(conflict.mine[field], w.empty)}`}>
                    <NativeText preset="caption" className="text-muted-foreground">{w.mine}</NativeText>
                    {show(field, conflict.mine[field])}
                  </View>
                </View>
              ))
            : null}
          <View style={{ gap: 8, paddingTop: 4 }}>
            {fields.length > 0 ? (
              <NativeButton onPress={() => void keep()} loading={keeping} disabled={keeping} testID={`${testID}-keep-mine`}>
                {w.keepMine}
              </NativeButton>
            ) : null}
            <NativeButton variant="outline" onPress={onTakeTheirs} disabled={keeping} testID={`${testID}-take-theirs`}>
              {w.takeTheirs}
            </NativeButton>
          </View>
        </View>
      </NativeSheetScrollView>
    </NativeSheet>
  );
}
