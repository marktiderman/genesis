/**
 * Ask for a secret at a terminal without echoing it: raw mode, nothing written back but the
 * newline. The value goes straight into the caller's vault; it is never a flag, an environment
 * variable or a file.
 */
export interface HiddenInput {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(mode: boolean): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: "data", listener: (chunk: string) => void): unknown;
  off(event: "data", listener: (chunk: string) => void): unknown;
}

export function promptHidden(question: string, input: HiddenInput = process.stdin, output: { write(text: string): unknown } = process.stdout): Promise<string> {
  return new Promise((resolve, reject) => {
    output.write(question);
    const wasRaw = input.isRaw ?? false;
    input.setRawMode?.(true);
    input.setEncoding("utf8");
    input.resume();
    let value = "";
    const finish = (err?: Error) => {
      input.off("data", onData);
      input.setRawMode?.(wasRaw);
      input.pause();
      output.write("\n");
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return finish();
        if (ch === "\u0003") return finish(new Error("cancelled"));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    input.on("data", onData);
  });
}
