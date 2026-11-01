---
"@marktiderman/genesis-core": patch
---

The default error reporter (and `isDevelopment`) now stays quiet in a production browser build:
it reads `process.env.NODE_ENV` written out in full, which Vite, webpack and esbuild replace at
build time. It used to read it with optional chaining, which no bundler replaces, so a browser
build with no `process` counted as development and warned in the console.
