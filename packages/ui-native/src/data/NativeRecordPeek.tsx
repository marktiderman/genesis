// NativeRecordPeek: a record's page in a sheet, the twin of genesis-ui's RecordPeek. It draws the
// view's record view (NativeRecordView) in a NativeSheet, with the record's title as the sheet's
// heading and, when the screen passes them, Edit and Delete beside it. A full page is the app's
// own route (getNativeRecordViewStackOptions); a peek is for a look without leaving the list.
// The record view scrolls itself, so the sheet holds it as it is.
//
// Edit and Delete go through the same rights as the list's swipe actions (`allowed`: the screen's
// `can` AND the view's update / delete guard): one the screen turns off is hidden, one a guard
// refuses stays and explains why. Delete is confirmed here, once, in the list's words (the bin's
// when the provider moves deleted rows to a recycle bin), so `onDelete` is the write itself.

import { useState, type ReactNode } from "react";
import { Alert, Text, View } from "react-native";
import type { DataRow } from "@marktiderman/genesis-core";
import { useCapabilities, useViewer } from "@marktiderman/genesis-core/hooks";
import { NativeButton } from "../components/button";
import { NativeSheet } from "../components/sheet";
import { useNativeResourceViewMessages } from "./resource-view/display";
import { allowed, refusalMessage, type NativeResourceScreenCan } from "./resource-view/mapping";
import { fill } from "./resource-view/messages";
import { NativeRecordView, type NativeRecordViewProps } from "./resource-view/NativeRecordView";

type Row = Record<string, unknown>;

export interface NativeRecordPeekProps<T extends Row = Row> extends Omit<NativeRecordViewProps<T>, "row"> {
  /** The record, or null while none is open. */
  row: T | null;
  open: boolean;
  onClose: () => void;
  /** Shows Edit (where the screen's `can` and the view's update guard allow it): open the record's form. */
  onEdit?: (row: T) => void;
  /**
   * Shows Delete (where `can` and the view's delete guard allow it). The peek confirms first, so
   * pass the write itself (the provider's delete), never a handler that confirms again. Return its
   * promise: the sheet closes when it resolves, and a rejection is shown in plain words.
   */
  onDelete?: (row: T) => unknown;
  /**
   * `false` when `onDelete` confirms on its own (a list's own delete handler): the peek calls it at
   * once instead of asking first. Default `true`, as genesis-ui's RecordPeek, so one `onDelete`
   * means the same on both.
   */
  confirmDelete?: boolean;
  /** The screen's own rule, as NativeResourceView's `can`: `false` hides Edit or Delete, a sentence refuses it. Only narrows the view's guards. */
  can?: NativeResourceScreenCan<T>;
  /** Above the record (a link to its full page). */
  header?: ReactNode;
  /** The sheet's heights. Default `["60%", "92%"]`. */
  snapPoints?: (string | number)[];
  /** Overrides for the resource-view messages (`common.edit`, `delete` / `bin`, `common.cancel`). */
  labels?: { edit?: string; delete?: string; deleteTitle?: string; deleteBody?: string; cancel?: string };
}

export function NativeRecordPeek<T extends Row = Row>({
  row,
  open,
  onClose,
  onEdit,
  onDelete,
  confirmDelete: confirmFirst = true,
  can,
  header,
  snapPoints = ["60%", "92%"],
  labels = {},
  testID = "record-peek",
  ...rest
}: NativeRecordPeekProps<T>) {
  const messages = useNativeResourceViewMessages();
  const view = rest.view.view;
  const viewer = useViewer();
  const softDelete = useCapabilities(view.resource).data?.softDelete === true;
  const [deleting, setDeleting] = useState(false);
  const shown = open && row !== null;
  const title = row ? view.summary(row as T & DataRow).title : "";
  const canEdit = row && onEdit ? allowed(view, "update", row, can, viewer) : false;
  const canDelete = row && onDelete ? allowed(view, "delete", row, can, viewer) : false;
  const words = softDelete ? messages.bin : messages.delete;
  const deleteLabel = labels.delete ?? words.action;
  const editLabel = labels.edit ?? messages.common.edit;

  const runDelete = async (r: T) => {
    setDeleting(true);
    try {
      await onDelete?.(r);
      onClose();
    } catch (error) {
      Alert.alert(deleteLabel, refusalMessage(error, fill(messages.refusal.deleteFailed, { noun: view.noun })));
    } finally {
      setDeleting(false);
    }
  };
  const confirmDelete = (r: T) =>
    !confirmFirst
      ? void runDelete(r)
      : Alert.alert(labels.deleteTitle ?? fill(words.confirmTitle, { name: title }), labels.deleteBody ?? words.confirmBody, [
      { text: labels.cancel ?? messages.common.cancel, style: "cancel" },
      { text: deleteLabel, style: "destructive", onPress: () => void runDelete(r) },
    ]);

  return (
    <NativeSheet open={shown} onOpenChange={(next) => (next ? undefined : onClose())} snapPoints={snapPoints} testID={testID}>
      {row ? (
        <View style={{ flex: 1, paddingBottom: 16 }}>
          <View className="flex-row items-center justify-between gap-2 px-4 pb-2">
            <Text accessibilityRole="header" numberOfLines={2} className="flex-1 text-lg font-semibold text-foreground">
              {title}
            </Text>
            {canEdit !== false ? (
              <NativeButton
                size="sm"
                variant="outline"
                testID={`${testID}-edit`}
                accessibilityHint={canEdit === true ? undefined : canEdit}
                onPress={() => (canEdit === true ? onEdit!(row) : Alert.alert(editLabel, canEdit))}
              >
                {editLabel}
              </NativeButton>
            ) : null}
            {canDelete !== false ? (
              <NativeButton
                size="sm"
                variant="ghost"
                textClassName="text-destructive"
                testID={`${testID}-delete`}
                disabled={deleting}
                accessibilityHint={canDelete === true ? undefined : canDelete}
                onPress={() => (canDelete === true ? confirmDelete(row) : Alert.alert(deleteLabel, canDelete))}
              >
                {deleteLabel}
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
