/**
 * Where a client reads a file from, one slice at a time, so a big file is
 * never in memory whole: a browser `File` or `Blob`, an open file on a phone
 * (expo-file-system's `File.open()`) or on a server (`node:fs` handles), or
 * bytes already in memory.
 */

/** A file to upload, read a slice at a time. */
export interface UploadSource {
  /** Bytes in the file. */
  readonly size: number;
  /** Exactly `length` bytes from `offset` (fewer only at the end of the file). */
  read(offset: number, length: number): Promise<Uint8Array>;
  /**
   * Identifies this file on this device across reloads (name, size, last
   * modified), so a resumed upload finds its session. Without it, a reload
   * starts over (and may still be skipped or resumed by its SHA-256).
   */
  readonly key?: string | undefined;
  /** For browser sources: the blob, so a Web Worker can hash it off the main thread. */
  readonly blob?: Blob | undefined;
  close?(): void | Promise<void>;
}

/** A browser `File` or `Blob`. */
export function fromBlob(blob: Blob & { name?: string; lastModified?: number }): UploadSource {
  return {
    size: blob.size,
    blob,
    key: blob.name !== undefined ? `${blob.name}:${blob.size}:${blob.lastModified ?? 0}` : undefined,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  };
}

/** Anything with a size and a positioned read: expo-file-system's `FileHandle`, a wrapped `node:fs` `FileHandle`. */
export interface ReadableFileHandle {
  size: number;
  read(offset: number, length: number): Promise<ArrayBuffer | Uint8Array> | ArrayBuffer | Uint8Array;
  close?(): void | Promise<void>;
}

/**
 * An open file. A read shorter than asked (anywhere but the end) means the
 * file changed or can't be read: it throws rather than send a hole.
 */
export function fromFileHandle(handle: ReadableFileHandle, key?: string): UploadSource {
  return {
    size: handle.size,
    key,
    async read(offset, length) {
      const want = Math.min(length, handle.size - offset);
      const got = await handle.read(offset, want);
      const bytes = got instanceof Uint8Array ? got : new Uint8Array(got);
      if (bytes.byteLength !== want) throw new Error(`The file changed or couldn't be read at ${offset} (${bytes.byteLength} of ${want} bytes).`);
      return bytes;
    },
    close: () => handle.close?.(),
  };
}

/** Bytes already in memory. */
export function fromBytes(bytes: Uint8Array, key?: string): UploadSource {
  return { size: bytes.byteLength, key, read: async (offset, length) => bytes.slice(offset, offset + length) };
}
