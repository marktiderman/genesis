import { titleCase } from "@marktiderman/genesis-core";
import * as React from "react";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeButton } from "../components/button";
import { NativeCard, NativeCardContent } from "../components/card";
import { NativeSeparator } from "../components/separator";
import { NativeText } from "../components/text";

export interface NativeDetailField<T = Record<string, unknown>> {
  key: Extract<keyof T, string>;
  label: string;
  render?: (value: unknown, item: T) => ReactNode;
}

export interface NativeDetailPanelProps<T = Record<string, unknown>> {
  item: T;
  titleField?: Extract<keyof T, string>;
  fields?: NativeDetailField<T>[];
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  children?: ReactNode;
}

const SKIP_KEYS = new Set(["id", "created_at", "updated_at"]);

function NativeDetailPanel<T extends Record<string, unknown>>({
  item,
  titleField,
  fields,
  onEdit,
  onDelete,
  children,
}: NativeDetailPanelProps<T>) {
  const title = titleField ? String(item[titleField] ?? "") : undefined;
  const hasActions = onEdit != null || onDelete != null;

  // Escape hatch — caller provides full content
  if (children) {
    return (
      <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {title ? (
            <NativeText preset="h3">{title}</NativeText>
          ) : null}
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Resolve field list
  const resolvedFields: NativeDetailField<T>[] =
    fields ??
    Object.keys(item)
      .filter((k) => !SKIP_KEYS.has(k))
      .map((k) => ({ key: k as Extract<keyof T, string>, label: titleCase(k) }));

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {title ? (
          <NativeText preset="h3">{title}</NativeText>
        ) : null}

        <NativeCard>
          <NativeCardContent className="pt-6 gap-4">
            {resolvedFields.map((field, index) => {
              const raw = item[field.key];
              const rendered = field.render
                ? field.render(raw, item)
                : raw == null
                  ? null
                  : String(raw);

              return (
                <View key={field.key}>
                  {index > 0 ? (
                    <NativeSeparator style={{ marginBottom: 16 }} />
                  ) : null}
                  <NativeText
                    preset="caption"
                    className="text-muted-foreground uppercase tracking-wider mb-1"
                  >
                    {field.label}
                  </NativeText>
                  {typeof rendered === "string" || rendered == null ? (
                    <NativeText preset="body">
                      {rendered ?? "—"}
                    </NativeText>
                  ) : (
                    rendered
                  )}
                </View>
              );
            })}
          </NativeCardContent>
        </NativeCard>

        {hasActions ? (
          <View style={{ gap: 12 }}>
            <NativeSeparator />
            {onEdit ? (
              <NativeButton variant="outline" onPress={() => onEdit(item)}>
                Edit
              </NativeButton>
            ) : null}
            {onDelete ? (
              <NativeButton
                variant="destructive"
                onPress={() => onDelete(item)}
              >
                Delete
              </NativeButton>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export { NativeDetailPanel };
