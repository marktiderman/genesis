import type { DataProvider, InvalidationKey, WriteEvent } from "../provider/types";

/**
 * The cache keys a committed write makes stale beyond `[resource]`: the
 * provider's own (`DataProvider.invalidates`) plus the caller's. A provider
 * that throws here is logged and skipped; the write already committed.
 */
export function relatedKeys(
  provider: DataProvider,
  event: WriteEvent,
  extra: InvalidationKey[] | undefined,
): InvalidationKey[] {
  let fromProvider: InvalidationKey[] = [];
  try {
    fromProvider = provider.invalidates?.(event) ?? [];
  } catch (error) {
    console.error(`[genesis-core] invalidates failed for "${event.resource}":`, error);
  }
  return [...fromProvider, ...(extra ?? [])];
}
