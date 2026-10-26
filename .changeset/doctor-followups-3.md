---
"@marktiderman/genesis-cli": patch
---

`genesis doctor`, from the third #314 review:

- `duplicate-genesis-package` / `peer-range-mismatch`: devDependencies count as runtime (a bundler ships what the app imports from them) unless they are tooling: test runners, `@types/*`, linters and formatters, compilers and bundlers, Storybook, release tools, the Genesis CLI. A duplicate under a UI package listed in devDependencies warns again.
- The route trail's tokenizer reads regex literals and JSX text (`Rock 'n roll`, backticks, `{done}/{total}`) without losing its place, and treats a file it can't read for sure as unknown instead of guessing.
- Answers cut short by an import cycle are cached by the modules they skipped, so cyclic import graphs no longer run several times slower.
