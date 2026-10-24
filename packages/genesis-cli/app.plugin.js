// The Expo config plugin: `plugins: ["@marktiderman/genesis-cli"]` in app.config.ts.
// Expo require()s this file; Node's require(esm) (Node 20.19+, 22.12+) loads it
// and Expo calls its default export. See README "Expo config plugin".
export { default } from "./dist/expo.js";
