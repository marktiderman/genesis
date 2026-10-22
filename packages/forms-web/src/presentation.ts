import { createContext, useContext } from "react";

/**
 * How `<Form>` sits on the page. `"embedded"` is a block inside your app's own
 * page. `"page"` is the respondent's whole screen (a QR code, a shared link):
 * it fills the viewport and draws no card around the form.
 */
export type FormPresentation = "embedded" | "page";

export interface FormPresentationValue {
  presentation: FormPresentation;
  layout: "focus" | "classic";
}

const FormPresentationContext = createContext<FormPresentationValue>({ presentation: "embedded", layout: "classic" });

export const FormPresentationProvider = FormPresentationContext.Provider;

/**
 * The presentation and layout of the enclosing `<Form>`, so a custom slot or
 * renderer can match the built-in ones (larger type and tap targets in page
 * mode, for example). Outside a `<Form>` it reads embedded and classic.
 */
export function useFormPresentation(): FormPresentationValue {
  return useContext(FormPresentationContext);
}
