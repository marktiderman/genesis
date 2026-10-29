/**
 * Removes a test's throwaway directory. Cleanup must never fail a test: a recursive rm can
 * race with a file still being written or indexed (ENOTEMPTY, EBUSY, EPERM, seen on macOS and
 * CI), so it retries with a short backoff, and a directory that still won't go is left in the
 * OS temp folder, which the OS clears.
 */
import { rmSync } from "node:fs";

export function removeTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch (error) {
    console.warn(`Couldn't remove the test directory ${dir}: ${(error as Error).message}`);
  }
}
