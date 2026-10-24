// NativeWind className augmentation for react-native types.
// This adds className to RN component props so ui-native components
// typecheck correctly both standalone and when consumed by apps.
// The top-level import makes this a module augmentation (not an ambient declaration),
// so it merges with the real react-native types rather than replacing them.

// This import is required to make this file a module augmentation (not an ambient declaration).
// Removing it silently changes the semantics from "merge with" to "replace" the react-native types.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { AnimatedProps } from "react-native";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface ImagePropsBase {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
  interface SwitchProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface TouchableWithoutFeedbackProps {
    className?: string;
  }
}
