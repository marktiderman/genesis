/**
 * What `<FormFocus>` shares with the parts it draws: where focus can go for each step, the
 * host's photo storage, uploads in flight, haptics and the submit action a keyboard's return key
 * runs. Field renderers read it with `useFormNative`.
 */
import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { AccessibilityInfo, Keyboard, Platform } from "react-native";
import type { FieldBlock, PhotoRef } from "@marktiderman/genesis-forms";

/** A photo the host's picker returned, before it is stored. */
export interface NativePhotoFile {
  /** A local URI the app can show (`file://`, `ph://`, `content://`). */
  uri: string;
  name: string;
  /** Its MIME type, such as `image/jpeg`. */
  type: string;
  /** Bytes. */
  size: number;
}

/**
 * Where a form's photos come from and go to. The host owns the picker (expo-image-picker, a
 * camera screen) and the storage (its bucket, its rules); the answer keeps only the reference
 * `upload` resolves to. Without one, `photo` questions say photos can't be added.
 */
export interface PhotoHost {
  /** Let the respondent choose (or take) up to `max` photos. Resolve `[]` when they cancel. */
  pick(field: FieldBlock, options: { max: number; camera: boolean }): Promise<NativePhotoFile[]>;
  /** Store one photo and resolve to its reference. A rejection shows under the question. */
  upload(file: NativePhotoFile, field: FieldBlock): Promise<PhotoRef>;
  /** Offer "Take a photo" beside "Choose a photo". Default false. */
  camera?: boolean | undefined;
}

/** Taps and outcomes the form can make felt (expo-haptics, say). Every one is optional. */
export interface FormHaptics {
  /** A pick: an option, a rating, yes or no. */
  selection?(): void;
  /** The form was sent or queued. */
  success?(): void;
  /** A step or a send failed. */
  error?(): void;
}

type Focusable = { focus?: () => void } | null;

export interface FocusTargets {
  /** The control a step's keyboard goes to (a text input), for `id`. */
  setControl(id: string, node: Focusable): void;
  /** The question text screen readers move to, for `id`. */
  setQuestion(id: string, node: unknown): void;
  /** Move to step `id`: its text input, else its question text for screen readers. */
  focusStep(id: string): void;
}

export interface PendingUploads {
  /** Call when an upload starts; the function it returns ends it (once). */
  start(): () => void;
  count(): number;
}

export interface FormNativeContextValue {
  focus: FocusTargets;
  photos: PhotoHost | null;
  pending: PendingUploads;
  haptics: FormHaptics;
  /** What the return key on a one-line answer does: the form's Next or Send. */
  submit(): void;
  /** True once the response is completed: answers are read-only. */
  locked: boolean;
  /** The step on screen is the last: its return key sends. */
  isLast: boolean;
  /** What the main button says now (Next, or Send on the last step). */
  submitLabel: string;
  /** A keyboard with no return key (a number or phone pad before iOS 26) is up: the keyboard toolbar carries Next. */
  needsKeysBar: boolean;
  /** An answer input says its keyboard has no return key (on focus) or has gone (on blur). */
  setNeedsKeysBar(needed: boolean): void;
}

/**
 * Whether a keyboard leaves the respondent no key to move on with. iOS's number, decimal and
 * phone pads have no return key before iOS 26; from iOS 26 they show the return key above the
 * pad. Android's always have one.
 */
export function keyboardLacksReturnKey(keyboardType: string | undefined, os: string = Platform.OS, version: number | string = Platform.Version): boolean {
  if (os !== "ios" || !keyboardType || !["number-pad", "decimal-pad", "phone-pad", "numeric"].includes(keyboardType)) return false;
  const major = typeof version === "number" ? version : parseInt(version, 10);
  return !(Number.isFinite(major) && major >= 26);
}

export const FormNativeContext = createContext<FormNativeContextValue | null>(null);

/** The form's native context. Throws outside `<FormFocus>`. */
export function useFormNative(): FormNativeContextValue {
  const ctx = useContext(FormNativeContext);
  if (!ctx) throw new Error("useFormNative: render field renderers inside <FormFocus>.");
  return ctx;
}

/** Move a screen reader to a host view. Quietly does nothing where it can't. */
export function accessibilityFocus(node: unknown): void {
  if (!node) return;
  try {
    AccessibilityInfo.sendAccessibilityEvent(node as never, "focus");
  } catch {
    // An unmounted view: nothing to move to.
  }
}

/** A fresh counter of uploads in flight. */
export function createPendingUploads(): PendingUploads {
  let n = 0;
  return {
    start() {
      n++;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        n--;
      };
    },
    count: () => n,
  };
}

/**
 * The focus targets of one form. A step with a text input focuses it (the keyboard opens, as a
 * respondent expects after Next); any other step dismisses the keyboard and moves VoiceOver or
 * TalkBack to its question text, a moment later so the new step is on screen.
 */
export function useFocusTargets(): FocusTargets {
  const controls = useRef(new Map<string, Focusable>());
  const questions = useRef(new Map<string, unknown>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const setControl = useCallback((id: string, node: Focusable) => {
    if (node) controls.current.set(id, node);
    else controls.current.delete(id);
  }, []);
  const setQuestion = useCallback((id: string, node: unknown) => {
    if (node) questions.current.set(id, node);
    else questions.current.delete(id);
  }, []);
  const focusStep = useCallback((id: string) => {
    clearTimeout(timer.current);
    const control = controls.current.get(id);
    if (control?.focus) {
      control.focus();
      return;
    }
    Keyboard.dismiss();
    // iOS drops an accessibility focus sent before the new view is laid out.
    timer.current = setTimeout(() => accessibilityFocus(questions.current.get(id)), Platform.OS === "ios" ? 120 : 60);
  }, []);
  return useRef({ setControl, setQuestion, focusStep }).current;
}
