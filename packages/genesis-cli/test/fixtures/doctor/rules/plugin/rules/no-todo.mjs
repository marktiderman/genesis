// An app rule module: default-export a factory that takes the options from config.
export default function noTodo(options = {}) {
  const word = options.word ?? "TODO";
  return {
    name: "no-todo",
    check(ctx) {
      for (const file of ctx.files) {
        file.text.split("\n").forEach((line, i) => {
          if (line.includes(word)) {
            ctx.report({ rule: "no-todo", level: "warn", file: file.path, line: i + 1, message: `contains ${word}`, subject: word });
          }
        });
      }
      if (ctx.genesis.components.length === 0) throw new Error("no components");
    },
  };
}
