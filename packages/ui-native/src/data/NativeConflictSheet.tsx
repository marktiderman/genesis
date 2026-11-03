import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, View } from "react-native";
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
  /** Their value for a field their row as read here doesn't carry. */
  unknown: string;
  keepMine: string;
  takeTheirs: string;
  /** When "keep mine" failed for another reason (offline, refused). */
  failed: string;
  yes: string;
  no: string;
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
  unknown: "Not shown",
  keepMine: "Keep my version",
  takeTheirs: "Take their version",
  failed: "Your version wasn't saved.",
  yes: "Yes",
  no: "No",
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

function plain(value: unknown, w: NativeConflictSheetMessages): string {
  if (value === null || value === undefined || value === "") return w.empty;
  if (typeof value === "boolean") return value ? w.yes : w.no;
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
  const [failed, setFailed] = useState<string | null>(null);
  const fields = conflict?.fields ?? [];
  const title = w.title.replace("{noun}", noun ?? w.record);
  // "Keep mine" needs the version their row is at; without one it could only conflict again.
  const canKeep = fields.length > 0 && conflict?.currentVersion != null;
  // Said once as it opens, so a screen reader user knows why a sheet came up.
  useEffect(() => {
    setFailed(null);
    if (conflict) AccessibilityInfo.announceForAccessibility?.(title);
  }, [conflict, title]);
  const has = (field: string) => !!conflict && field in conflict.theirs;
  const text = (field: string, value: unknown, known = true) => (known ? plain(value, w) : w.unknown);
  const show = (field: string, value: unknown, known = true): ReactNode =>
    format && known ? format(field, value) : <NativeText preset="body-sm">{text(field, value, known)}</NativeText>;

  const keep = async () => {
    setKeeping(true);
    setFailed(null);
    try {
      await onKeepMine();
    } catch (error) {
      setFailed(error instanceof Error && error.message ? error.message : w.failed);
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
            {title}
          </NativeText>
          <NativeText preset="body-sm" className="text-muted-foreground">
            {fields.length > 0 ? w.description : w.same}
          </NativeText>
          {conflict
            ? fields.map((field) => (
                <View key={field} style={{ gap: 4 }} testID={`${testID}-field-${field}`}>
                  <NativeText preset="label">{label(field)}</NativeText>
                  <View accessible {...(format ? {} : { accessibilityLabel: `${w.theirs}: ${text(field, conflict.theirs[field], has(field))}` })}>
                    <NativeText preset="caption" className="text-muted-foreground">{w.theirs}</NativeText>
                    {show(field, conflict.theirs[field], has(field))}
                  </View>
                  <View accessible {...(format ? {} : { accessibilityLabel: `${w.mine}: ${text(field, conflict.mine[field])}` })}>
                    <NativeText preset="caption" className="text-muted-foreground">{w.mine}</NativeText>
                    {show(field, conflict.mine[field])}
                  </View>
                </View>
              ))
            : null}
          {failed ? (
            <NativeText preset="body-sm" className="text-destructive" accessibilityRole="alert" testID={`${testID}-failed`}>
              {failed}
            </NativeText>
          ) : null}
          <View style={{ gap: 8, paddingTop: 4 }}>
            {canKeep ? (
              <NativeButton size="lg" onPress={() => void keep()} loading={keeping} disabled={keeping} testID={`${testID}-keep-mine`}>
                {w.keepMine}
              </NativeButton>
            ) : null}
            <NativeButton size="lg" variant="outline" onPress={onTakeTheirs} disabled={keeping} testID={`${testID}-take-theirs`}>
              {w.takeTheirs}
            </NativeButton>
          </View>
        </View>
      </NativeSheetScrollView>
    </NativeSheet>
  );
}
