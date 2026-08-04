/**
 * Accordion — vertically stacked expand/collapse sections.
 *
 * Use for FAQs, settings groups, and long-form content where the user
 * benefits from progressive disclosure. Two modes:
 *   - "single": one section open at a time (default).
 *   - "multiple": any number open simultaneously.
 *
 * Compose: <NativeAccordion><NativeAccordionItem value="...">
 *   <NativeAccordionTrigger /><NativeAccordionContent />
 * </NativeAccordionItem></NativeAccordion>.
 *
 * @stability Beta
 */
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useState,
} from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";

export type NativeAccordionType = "single" | "multiple";

interface AccordionContextValue {
  type: NativeAccordionType;
  expanded: string[];
  toggle: (value: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

export interface NativeAccordionProps {
  type?: NativeAccordionType;
  /** Controlled expanded values. */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

export function NativeAccordion({
  type = "single",
  value: controlled,
  defaultValue = [],
  onValueChange,
  className,
  children,
  testID,
}: NativeAccordionProps) {
  const [uncontrolled, setUncontrolled] = useState<string[]>(defaultValue);
  const expanded = controlled ?? uncontrolled;

  const toggle = (v: string) => {
    let next: string[];
    if (type === "single") {
      next = expanded.includes(v) ? [] : [v];
    } else {
      next = expanded.includes(v)
        ? expanded.filter((x) => x !== v)
        : [...expanded, v];
    }
    if (controlled === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  // NativeWind has no DOM tree, so Tailwind's `last:` variant cannot suppress
  // the trailing border on the final item. Auto-inject `isLast` on the last
  // <NativeAccordionItem> child so consumers don't have to thread the prop
  // manually. A consumer-supplied `isLast` always wins (we only fill in when
  // it is undefined). The type guard ensures we don't inject into Fragments,
  // Views, or other intermediate elements (CR feedback on PR #38).
  const isAccordionItem = (
    node: React.ReactNode,
  ): node is React.ReactElement<NativeAccordionItemProps> =>
    isValidElement<NativeAccordionItemProps>(node) &&
    node.type === NativeAccordionItem;

  const items = Children.toArray(children);
  const lastItemIndex = (() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (isAccordionItem(items[i])) return i;
    }
    return -1;
  })();
  const annotated = items.map((child, idx) => {
    if (!isAccordionItem(child)) return child;
    if (idx !== lastItemIndex) return child;
    if (child.props.isLast !== undefined) return child;
    return cloneElement(child, { isLast: true });
  });

  return (
    <AccordionContext.Provider value={{ type, expanded, toggle }}>
      <View testID={testID} className={cn("rounded-md border border-border", className)}>
        {annotated}
      </View>
    </AccordionContext.Provider>
  );
}

interface AccordionItemContext {
  value: string;
  isExpanded: boolean;
  toggle: () => void;
}

const AccordionItemCtx = createContext<AccordionItemContext | null>(null);

export interface NativeAccordionItemProps {
  value: string;
  className?: string;
  /** When true, omits the bottom divider — set on the last item in the list. */
  isLast?: boolean;
  children: React.ReactNode;
}

export function NativeAccordionItem({
  value,
  className,
  isLast,
  children,
}: NativeAccordionItemProps) {
  const ctx = useContext(AccordionContext);
  if (!ctx)
    throw new Error("NativeAccordionItem must be used inside <NativeAccordion>.");
  const isExpanded = ctx.expanded.includes(value);
  // NativeWind does not support `last:` pseudo-classes (no DOM tree). Pass
  // isLast={true} on the final item (or wrap items in a parent that injects
  // it) to suppress the bottom divider.
  return (
    <AccordionItemCtx.Provider
      value={{ value, isExpanded, toggle: () => ctx.toggle(value) }}
    >
      <View
        className={cn(
          "border-border",
          !isLast && "border-b",
          className
        )}
      >
        {children}
      </View>
    </AccordionItemCtx.Provider>
  );
}

export interface NativeAccordionTriggerProps {
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

export function NativeAccordionTrigger({
  className,
  children,
  testID,
}: NativeAccordionTriggerProps) {
  const ctx = useContext(AccordionItemCtx);
  if (!ctx)
    throw new Error(
      "NativeAccordionTrigger must be used inside <NativeAccordionItem>."
    );
  return (
    <Pressable
      testID={testID ?? `accordion-trigger-${ctx.value}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: ctx.isExpanded }}
      onPress={ctx.toggle}
      className={cn(
        "min-h-[44px] flex-row items-center justify-between p-4",
        className
      )}
    >
      {typeof children === "string" ? (
        <Text className="flex-1 text-base font-medium text-foreground">
          {children}
        </Text>
      ) : (
        children
      )}
      <Text className="text-muted-foreground" accessibilityElementsHidden>
        {ctx.isExpanded ? "−" : "+"}
      </Text>
    </Pressable>
  );
}

export interface NativeAccordionContentProps {
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

export function NativeAccordionContent({
  className,
  children,
  testID,
}: NativeAccordionContentProps) {
  const ctx = useContext(AccordionItemCtx);
  if (!ctx)
    throw new Error(
      "NativeAccordionContent must be used inside <NativeAccordionItem>."
    );
  if (!ctx.isExpanded) return null;
  return (
    <View
      testID={testID ?? `accordion-content-${ctx.value}`}
      className={cn("px-4 pb-4", className)}
    >
      {typeof children === "string" ? (
        <Text className="text-sm text-muted-foreground">{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
