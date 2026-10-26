/**
 * @marktiderman/genesis-connect: connect an outside account, server side.
 *
 * - Secrets: `createSecrets(keyring, { purpose })` seals and opens text bound
 *   to a row, with key versioning (`needsRotation`, `reseal`).
 * - OAuth: `createConnector({ provider: googleProvider, … })` gives `start`,
 *   `callback`, `accessToken`, `refresh` and `revoke` on Web Request/Response.
 *
 * fetch and WebCrypto only: Node 20+, edge runtimes and Workers.
 */
export * from "./secrets";
export * from "./providers";
export {
  CONNECT_RESULTS,
  ConnectError,
  clearAccessTokenCache,
  createConnector,
  isSafeReturnOrigin,
  type ConnectErrorCode,
  type ConnectLogEvent,
  type ConnectResult,
  type ConnectedAccount,
  type Connector,
  type ConnectorConfig,
  type HttpOptions,
  type RefreshedToken,
  type StartOptions,
  type StartResult,
  type StateData,
  type StoreResult,
  type TokenCallOptions,
} from "./oauth";
