// NativeCustomView: a screen an app draws itself over a view (ADR 0019), on the phone. The twin of
// genesis-ui's CustomView: Genesis loads the view's rows (scope, filters, preset, search, paging,
// live updates and permissions, through the same hook NativeResourceView uses) and draws loading,
// empty and error with a retry; the app draws the rest. The status rule is genesis-core's
// `customViewStatus`, and `groups` is core's `groupRows`, as on the web.
//
// The list type is built; a board and a calendar type follow the native board and calendar modes
// (resource-view-board's native platform).

import type { ReactNode } from "react";
import { View } from "react-native";
import type { DataRow } from "@marktiderman/genesis-core";
import { customViewStatus, type CustomViewStatus } from "@marktiderman/genesis-core/headless";
import { groupRows, type GroupRowsOptions, type RowGroup } from "@marktiderman/genesis-core/resource-view";
import { NativeButton } from "../components/button";
import { NativeEmptyState } from "../components/empty-state";
import { NativeSkeleton } from "../components/skeleton";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { fill } from "./resource-view/messages";
import { useNativeResourceViewMessages } from "./resource-view/display";
import type { AnyResourceView } from "./resource-view/mapping";
import { useNativeResourceView, type NativeResourceViewOptions, type UseNativeResourceViewReturn } from "./resource-view/use-native-resource-view";

type Row = Record<string, unknown>;

/** What a native custom view draws from: the status, the rows, the list's state and its helpers. */
export interface NativeCustomViewState<T extends Row = Row> {
  view: AnyResourceView<T>;
  type: "list";
  status: CustomViewStatus;
  error: string | null;
  retry: () => void;
  rows: T[];
  /** The rows under headers: the view's `groupBy`, or `options.field`. */
  groups: (rows?: readonly T[], options?: GroupRowsOptions) => RowGroup<T & DataRow>[];
  /** Paging, search, refresh, the row's actions and the writes, as NativeResourceView has them. */
  list: UseNativeResourceViewReturn<T>;
  /** The person asked for less motion: skip or shorten animations. */
  reducedMotion: boolean;
}

export interface NativeCustomViewProps<T extends Row = Row> extends NativeResourceViewOptions<T> {
  view: AnyResourceView<T>;
  /** Draws the view once there's something to show. */
  children: (state: NativeCustomViewState<T>) => ReactNode;
  loading?: ReactNode;
  /** Replaces the empty state; `false` hands an empty view to `children` too. */
  empty?: ReactNode | false;
  /** Replaces the error state; a function gets the error and a retry. */
  error?: ReactNode | ((error: string, retry: () => void) => ReactNode);
  testID?: string;
}

/** A native custom view's data and states, headless. `<NativeCustomView>` calls it and draws the states. */
export function useNativeCustomView<T extends Row = Row>(view: AnyResourceView<T>, options: NativeResourceViewOptions<T> = {}): NativeCustomViewState<T> {
  const list = useNativeResourceView<T>(view, options);
  const reducedMotion = useReducedMotion();
  const status = customViewStatus({ error: list.error, loading: list.loading, empty: list.rows.length === 0 });
  return {
    view,
    type: "list",
    status,
    error: list.error,
    retry: () => void list.refresh(),
    rows: list.rows,
    groups: (rows, o) => groupRows(view, (rows ?? list.rows) as readonly (T & DataRow)[], o),
    list,
    reducedMotion,
  };
}

export function NativeCustomView<T extends Row = Row>({ view, children, loading, empty, error, testID = "custom-view", ...options }: NativeCustomViewProps<T>) {
  const state = useNativeCustomView<T>(view, options);
  const messages = useNativeResourceViewMessages();
  const copy = view.definition.copy?.empty;
  const showChildren = state.status === "ready" || (state.status === "empty" && empty === false);
  return (
    <View testID={testID} accessibilityState={{ busy: state.status === "loading" || state.list.refreshing }} className="flex-1">
      {showChildren ? (
        children(state)
      ) : state.status === "loading" ? (
        (loading ?? (
          <View testID={`${testID}-loading`} accessibilityRole="progressbar" accessibilityLabel={messages.form.loading} className="gap-2 p-4">
            <NativeSkeleton height={40} className="w-full" />
            <NativeSkeleton height={40} className="w-full" />
            <NativeSkeleton height={40} className="w-2/3" />
          </View>
        ))
      ) : state.status === "error" ? (
        typeof error === "function" ? (
          error(state.error ?? "", state.retry)
        ) : (
          (error ?? (
            <NativeEmptyState
              testID={`${testID}-error`}
              variant="error"
              title={state.error ?? undefined}
              primaryAction={
                <NativeButton variant="outline" size="sm" onPress={state.retry} testID={`${testID}-retry`}>
                  {messages.list.retry}
                </NativeButton>
              }
            />
          ))
        )
      ) : (
        (empty ?? (
          <NativeEmptyState
            testID={`${testID}-empty`}
            title={copy?.title ?? fill(messages.list.emptyTitle, { nounPlural: view.nounPlural })}
            body={copy?.body ?? messages.list.emptyBody}
          />
        ))
      )}
    </View>
  );
}
