/**
 * The object without its `undefined` values, typed so: for passing optional settings to a hook
 * (genesis-core, react-dropzone) that declares them without `| undefined`, under
 * `exactOptionalPropertyTypes`. Absent and `undefined` mean the same to those hooks.
 * Lets apps that compile this package with strict settings type-check it.
 */
export function compact<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
