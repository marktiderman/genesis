/**
 * NativeChoiceCard — one selectable option drawn as a card: an indicator
 * (a radio circle, or a checkbox square with `multiple`), an optional
 * `media` slot (a thumbnail, an icon), a title and a description.
 *
 * The whole card is the press target (at least 44pt high) and reads as one
 * radio or checkbox to VoiceOver and TalkBack, named "title, description".
 * Selected, the border and indicator take the primary colour and the card a
 * light primary wash; `invalid` draws the border in the destructive colour
 * (and says "Needs an answer"). Controlled: the parent owns `selected`.
 *
 * Use a column of them for a question with pictures or explanations per
 * option; for a plain list of words use NativeRadioGroup or NativeChipGroup.
 *
 * @stability Beta
 */
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";

export interface NativeChoiceCardProps {
  title: string;
  /** A second line under the title, muted. */
  description?: string;
  /** Slot left of the text: a thumbnail (NativeImage), an icon. */
  media?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
  /** A checkbox (several can be chosen) rather than a radio. */
  multiple?: boolean;
  disabled?: boolean;
  /** The question still needs an answer: a destructive border and hint. */
  invalid?: boolean;
  /** Extra accessibility hint, such as "Option 2 of 4". */
  hint?: string;
  className?: string;
  testID?: string;
}

function Indicator({ on, multiple, testID }: { on: boolean; multiple: boolean; testID?: string | undefined }) {
  return (
    <View
      testID={testID}
      className={cn(
        "h-5 w-5 items-center justify-center border",
        multiple ? "rounded" : "rounded-full",
        on ? "border-primary" : "border-input",
        on && multiple && "bg-primary",
      )}
    >
      {on ? (
        multiple ? (
          <Text className="text-xs font-bold text-primary-foreground">✓</Text>
        ) : (
          <View className="h-2.5 w-2.5 rounded-full bg-primary" />
        )
      ) : null}
    </View>
  );
}

export function NativeChoiceCard({
  title,
  description,
  media,
  selected,
  onPress,
  multiple = false,
  disabled = false,
  invalid = false,
  hint,
  className,
  testID = "native-choice-card",
}: NativeChoiceCardProps) {
  const name = description ? `${title}, ${description}` : title;
  const accessibilityHint = [hint, invalid ? "Needs an answer" : ""].filter(Boolean).join(". ") || undefined;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityLabel={name}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: selected, selected, disabled }}
      className={cn(
        "min-h-[44px] flex-row items-center gap-3 rounded-lg border bg-card p-3",
        selected ? "border-primary bg-primary/5" : invalid ? "border-destructive" : "border-border",
        disabled && "opacity-50",
        className,
      )}
    >
      <Indicator on={selected} multiple={multiple} testID={`${testID}-indicator`} />
      {media ? (
        <View testID={`${testID}-media`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {media}
        </View>
      ) : null}
      <View className="flex-1">
        <Text className="text-base text-foreground">{title}</Text>
        {description ? <Text className="mt-0.5 text-sm text-muted-foreground">{description}</Text> : null}
      </View>
    </Pressable>
  );
}
