import { act, fireEvent, render, screen } from "@testing-library/react";
import { createForm, type CreateFormOptions, type FormDefinition, type FormEngine } from "@marktiderman/genesis-forms";
import { FormFocus, type FormFocusProps } from "../index";

export { act, fireEvent, screen };

/** Render a form in focus layout and hand back its engine. */
export function renderForm(definition: FormDefinition | { definition: FormDefinition }, props: Partial<FormFocusProps> = {}, options?: CreateFormOptions) {
  const def = "definition" in definition ? definition.definition : definition;
  const engine: FormEngine = props.engine ?? createForm(def, options);
  const view = render(<FormFocus engine={engine} {...props} />);
  return { engine, view, rerender: (more: Partial<FormFocusProps>) => view.rerender(<FormFocus engine={engine} {...props} {...more} />) };
}

export const byTestId = (id: string) => screen.getByTestId(id);
export const queryTestId = (id: string) => screen.queryByTestId(id);

/** Press the main button (Next, or Send on the last step). */
export function next() {
  act(() => {
    fireEvent.click(byTestId("form-next"));
  });
}

export function back() {
  act(() => {
    fireEvent.click(byTestId("form-back"));
  });
}

export function press(testID: string) {
  act(() => {
    fireEvent.click(byTestId(testID));
  });
}

export function type(testID: string, text: string) {
  act(() => {
    fireEvent.change(byTestId(testID), { target: { value: text } });
  });
}

/** The question text on screen (the step's header). */
export function question(): string {
  return screen.getAllByRole("header").map((h) => h.getAttribute("aria-label") ?? h.textContent ?? "").join(" | ");
}

/** Let promises settle (an async submit, an outbox). */
export async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}
