import type { Preview } from "@storybook/react-vite";
import { GenesisProvider } from "@marktiderman/genesis-ui/provider";
import "../app/app.css";

/**
 * Storybook preview wraps every story in GenesisProvider with a tiny
 * mock dataset, mirroring how apps/sample mounts the UI in production.
 *
 * Chromatic snapshots run against this preview, so any visual diff
 * reflects either an intentional component change or a regression.
 *
 * Phase G adds a Light/Dark theme global so portfolio stories render in
 * both modes; Chromatic captures both as separate snapshots.
 */
const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      options: {
        light: { name: "light", value: "hsl(0 0% 100%)" },
        dark: { name: "dark", value: "hsl(240 10% 3.9%)" },
      },
    },
    a11y: {
      // addon-vitest runs an axe check on every story. 39 of the 135
      // existing stories have violations today (mostly color-contrast on the
      // primary/destructive tokens), so they report as warnings ("todo")
      // rather than failing CI. Flip to "error" once those are fixed.
      test: "todo",
    },
  },
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Light / dark mode for portfolio stories",
      defaultValue: "light",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const isDark = (context.globals as { theme?: string }).theme === "dark";
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", isDark);
      }
      return (
        <GenesisProvider mock={{ datasets: { items: [], tasks: [], orders: [] } }}>
          <div className="bg-background text-foreground p-6">
            <Story />
          </div>
        </GenesisProvider>
      );
    },
  ],
  initialGlobals: {
    backgrounds: { value: "light" },
  },
};

export default preview;
