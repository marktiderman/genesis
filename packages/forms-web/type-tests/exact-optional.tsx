// Compiled against the built .d.ts with exactOptionalPropertyTypes on: a
// consumer's own optional props pass straight through to <Form>.
import type { FormDefinition, FormState } from "@marktiderman/genesis-forms";
import { Form, type FormBrand, type FormPresentation } from "@marktiderman/genesis-forms-web";

declare const definition: FormDefinition;
declare const maybe: {
  layout?: "focus" | "classic";
  brand?: FormBrand;
  presentation?: FormPresentation;
  onChange?: (state: FormState) => void;
  label?: string;
  logo?: string;
};

export const page = (
  <Form
    form={definition}
    layout={maybe.layout}
    brand={maybe.brand ?? { name: "Gym", logo: maybe.logo }}
    presentation={maybe.presentation}
    onChange={maybe.onChange}
    onSubmit={undefined}
    autoAdvance={undefined}
    submitLabel={maybe.label}
    options={{ hidden: undefined }}
    className={undefined}
  />
);
