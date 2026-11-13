// A one-time code typed into boxes: the phone's NativeInputOTP keeps its state here, and the
// web's InputOTP uses the same patterns, so a code that fits one fits the other.

/** Digits only, the usual SMS and authenticator code. */
export const OTP_PATTERN_DIGITS = "^\\d+$";
/** Letters and digits, for a backup or recovery code. */
export const OTP_PATTERN_DIGITS_AND_CHARS = "^[a-zA-Z0-9]+$";

/** What was typed or pasted, kept to the characters `pattern` allows and at most `length` of them. */
export function sanitizeOtp(text: string, length: number, pattern: string = OTP_PATTERN_DIGITS): string {
  const re = new RegExp(pattern);
  return [...text.replace(/\s/g, "")].filter((ch) => re.test(ch)).slice(0, length).join("");
}

/** One box of a code: its character, and whether the caret is in it. */
export interface OtpSlot {
  char: string | null;
  isActive: boolean;
}

/** The boxes for `value`: each character in its box, and the caret in the first empty one (or the last). */
export function otpSlots(value: string, length: number, focused: boolean): OtpSlot[] {
  const chars = [...value];
  const caret = Math.min(chars.length, length - 1);
  return Array.from({ length }, (_, i) => ({ char: chars[i] ?? null, isActive: focused && i === caret }));
}

/** Whether every box is filled: the moment to submit. */
export function otpComplete(value: string, length: number): boolean {
  return [...value].length === length;
}
