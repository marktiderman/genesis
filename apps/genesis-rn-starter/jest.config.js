/**
 * Component tests: the starter's screens rendered by React Native Testing Library on
 * jest-expo (`pnpm test:components`). The vitest suite (`vitest.config.mts`) keeps the
 * file and config tests; neither runner picks up the other's files.
 */
const expoPreset = require("jest-expo/jest-preset");

// Packages that ship untranspiled (ESM or JSX) code, on top of the ones jest-expo already
// transforms. The Genesis packages are workspace links, so they resolve outside node_modules
// here; an app made from the starter installs them from npm, and needs them in this list.
const alsoTransform = ["@marktiderman", "@sentry", "nativewind", "react-native-css-interop", "lucide-react-native"];

const [modulesPattern, ...rest] = expoPreset.transformIgnorePatterns;
const extended = modulesPattern.replace("(?!(", `(?!(${alsoTransform.join("|")}|`);
if (extended === modulesPattern) throw new Error("jest.config.js: jest-expo's transformIgnorePatterns changed shape; update the extension.");

module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/__tests__/components/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/__tests__/components/setup.ts"],
  resolver: "<rootDir>/__tests__/components/resolver.js",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1", "\\.css$": "<rootDir>/__tests__/components/css-stub.js" },
  transformIgnorePatterns: [extended, ...rest],
  // A file's first render loads the whole app through Babel; on a cold cache (CI) that alone can pass 5 s.
  testTimeout: 30_000,
};
