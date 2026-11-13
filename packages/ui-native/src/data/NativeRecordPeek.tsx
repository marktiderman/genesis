// NativeRecordPeek: a record's page in a sheet, the twin of genesis-ui's RecordPeek. It draws the
// view's record view (NativeRecordView) in a NativeSheet, with the record's title as the sheet's
// heading and, when the screen passes them, Edit and Delete beside it. A full page is the app's
// own route (getNativeRecordViewStackOptions); a peek is for a look without leaving the list.
// The record view scrolls itself, so the sheet holds it as it is.

import type { ReactNode } from "react";
import { Alert, Text, View } from "react-native";
import type { DataRow } from "@marktiderman/genesis-core";
import { NativeButton } from "../components/button";
import { NativeSheet } from "../components/sheet";
import { NativeRecordView, type NativeRecordViewProps } from "./resource-view/NativeRecordView";

type Row = Record<string, unknown>;

export interface NativeRecordPeekProps<T extends Row = Row> extends Omit<NativeRecordViewProps<T>, "row"> {
  /** The record, or null while none is open. */
  row: T | null;
  open: boolean;
  onClose: () => void;
  /** Shows Edit: open the record's form (NativeResourceFormSheet, or your own). */
  onEdit?: (row: T) => void;
  /** Shows Delete, confirmed with the system alert first. */
  onDelete?: (row: T) => void;
  /** Above the record (a link to its full page). */
  header?: ReactNode;
  /** The sheet's heights. Default `["60%", "92%"]`. */
  snapPoints?: (string | number)[];
  labels?: { edit?: string; delete?: string; deleteTitle?: string; deleteBody?: string; cancel?: string };
}

export function NativeRecordPeek<T extends Row = Row>({
  row,
  open,
  onClose,
  onEdit,
  onDelete,
  header,
  snapPoints = ["60%", "92%"],
  labels = {},
  testID = "record-peek",
  ...rest
}: NativeRecordPeekProps<T>) {
  const shown = open && row !== null;
  const title = row ? rest.view.view.summary(row as T & DataRow).title : "";
  const confirmDelete = (r: T) =>
    Alert.alert(labels.deleteTitle ?? `Delete ${title}?`, labels.deleteBody ?? "This can't be undone.", [
      { text: labels.cancel ?? "Cancel", style: "cancel" },
      {
        text: labels.delete ?? "Delete",
        style: "destructive",
        onPress: () => {
          onDelete?.(r);
          onClose();
        },
      },
    ]);
  return (
    <NativeSheet open={shown} onOpenChange={(next) => (next ? undefined : onClose())} snapPoints={snapPoints} testID={testID}>
      {row ? (
        <View style={{ flex: 1, paddingBottom: 16 }}>
          <View className="flex-row items-center justify-between gap-2 px-4 pb-2">
            <Text accessibilityRole="header" numberOfLines={2} className="flex-1 text-lg font-semibold text-foreground">
              {title}
            </Text>
            {onEdit ? (
              <NativeButton
                size="sm"
                variant="outline"
                testID={`${testID}-edit`}
                onPress={() => {
                  onEdit(row);
                }}
              >
                {labels.edit ?? "Edit"}
              </NativeButton>
            ) : null}
            {onDelete ? (
              <NativeButton size="sm" variant="ghost" textClassName="text-destructive" testID={`${testID}-delete`} onPress={() => confirmDelete(row)}>
                {labels.delete ?? "Delete"}
              </NativeButton>
            ) : null}
          </View>
          {header}
          <NativeRecordView<T> {...rest} row={row} testID={`${testID}-page`} />
        </View>
      ) : null}
    </NativeSheet>
  );
}
