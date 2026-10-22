// Compiled against the built .d.ts with exactOptionalPropertyTypes on: a
// consumer's own optional props pass straight through to <Form>.
import type { FormDefinition, FormState } from "@marktiderman/genesis-forms";
import { Form, SourceTextContext, MediaTimeContext, type FormBrand, type FormPresentation, type MediaTime } from "@marktiderman/genesis-forms-web";

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

declare const player: { time?: () => number | undefined; seek?: (s: number) => void };
const subject: MediaTime = { currentTime: player.time, seek: player.seek };
export const worksheet = (
  <MediaTimeContext.Provider value={subject}>
    <SourceTextContext.Provider value={null}>
      <Form form={definition} />
    </SourceTextContext.Provider>
  </MediaTimeContext.Provider>
);
