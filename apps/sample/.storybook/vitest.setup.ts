import { setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
import * as projectAnnotations from "./preview";

/**
 * Applies the Storybook preview (GenesisProvider decorator, parameters)
 * and the a11y addon's annotations to every story that
 * @storybook/addon-vitest runs as a browser test, so each story also gets
 * an axe check governed by `parameters.a11y.test`.
 */
setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);
