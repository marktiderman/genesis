/**
 * HeaderCard — structured card with title + body + footer slots.
 *
 * Use this when you want a card with the same recurring "title above body
 * above optional actions" shape and don't want to assemble Card +
 * CardHeader + CardTitle + CardContent + CardFooter at every call site.
 * The flat `<Card>{children}</Card>` form remains the 90% case — see
 * standards/usage-doctrine.md for when to reach for HeaderCard.
 *
 * @stability Beta
 */
import { Text, View } from "react-native";
import { cn } from "../utils";

export interface NativeHeaderCardProps {
  /** Heading rendered at the top of the card. Required. */
  title: React.ReactNode;
  /** Optional secondary line under the title. */
  description?: React.ReactNode;
  /** Main body content. Pass any node tree (text, list, form fields). */
  body?: React.ReactNode;
  /**
   * Footer node (typically a row of buttons). When provided, renders a
   * row-direction footer with internal padding. Skipped entirely when
   * undefined to keep the card compact.
   */
  footer?: React.ReactNode;
  /** Override the root container styling. */
  className?: string;
  /** Override the title text styling. */
  titleClassName?: string;
  /** Override the description text styling. */
  descriptionClassName?: string;
  /** Override the body container styling. */
  bodyClassName?: string;
  /** Override the footer container styling. */
  footerClassName?: string;
  /** testID on the root container. Required for instrumented screens. */
  testID?: string;
}

function NativeHeaderCard({
  title,
  description,
  body,
  footer,
  className,
  titleClassName,
  descriptionClassName,
  bodyClassName,
  footerClassName,
  testID,
}: NativeHeaderCardProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      className={cn(
        "rounded-xl border border-border bg-card shadow-sm",
        className
      )}
    >
      <View className="flex-col gap-1.5 p-6">
        {typeof title === "string" ? (
          <Text
            testID={testID ? `${testID}-title` : undefined}
            className={cn(
              "text-2xl font-semibold leading-none tracking-tight text-card-foreground",
              titleClassName
            )}
          >
            {title}
          </Text>
        ) : (
          title
        )}
        {description !== undefined && description !== null
          ? typeof description === "string"
            ? (
                <Text
                  testID={testID ? `${testID}-description` : undefined}
                  className={cn(
                    "text-sm text-muted-foreground",
                    descriptionClassName
                  )}
                >
                  {description}
                </Text>
              )
            : description
          : null}
      </View>
      {body !== undefined && body !== null ? (
        <View
          testID={testID ? `${testID}-body` : undefined}
          className={cn("px-6 pb-6", bodyClassName)}
        >
          {body}
        </View>
      ) : null}
      {footer !== undefined && footer !== null ? (
        <View
          testID={testID ? `${testID}-footer` : undefined}
          className={cn(
            "flex-row items-center gap-2 border-t border-border px-6 py-4",
            footerClassName
          )}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export { NativeHeaderCard };
