// A one-time code typed into boxes. The phone's NativeInputOTP keeps its state here; the web's
// InputOTP (input-otp) reads a pasted code through `stripOtpSeparators`. A pattern means the same
// on both: a RegExp source tested against the whole code typed so far, as input-otp's `pattern` is
// (`OTP_PATTERN_DIGITS` is input-otp's `REGEXP_ONLY_DIGITS`). So write a pattern a partly typed
// code can match ("^\\d+$", not "^\\d{6}$"); the length is the field's `maxLength`.

/** Digits only, the usual SMS and authenticator code. */
export const OTP_PATTERN_DIGITS = "^\\d+$";

/** A pasted or autofilled code without the spaces, dashes and dots it is often grouped with ("123-456"). */
export function stripOtpSeparators(text: string): string {
  return text.replace(/[\s.\-‐-―]/g, "");
}

/**
 * What a code field keeps of `text`: separators stripped, cut to `length` characters, and only
 * when the whole code then matches `pattern`. `null` means it doesn't, and the field keeps the
 * code it had (input-otp refuses such a change the same way).
 */
export function sanitizeOtp(text: string, length: number, pattern: string = OTP_PATTERN_DIGITS): string | null {
  const next = [...stripOtpSeparators(text)].slice(0, length).join("");
  if (next === "") return "";
  return new RegExp(pattern).test(next) ? next : null;
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
