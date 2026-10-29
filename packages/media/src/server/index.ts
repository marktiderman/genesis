/**
 * @marktiderman/genesis-media/server: fetching a URL a person named, on a
 * server (Node), without letting them aim the server at itself.
 *
 * @packageDocumentation
 */
export { BlockedAddressError, guardedLookup, isPublicAddress, urlProblems } from "./guard";
export {
  FetchRefusedError,
  createGuardedTransport,
  fetchGuarded,
  guardedTransport,
  readCapped,
  type FetchedResponse,
  type GuardedFetchOptions,
  type GuardedFetchResult,
  type GuardedTransportOptions,
  type Transport,
} from "./fetch";
export { sniff, type Sniffed } from "../sniff";
