/**
 * `setup.ts` fails a test when the app reports an error (`[push] …`, `[updates] …`,
 * `[observability] …`) or React warns about an update outside act(). A test that provokes one
 * on purpose names it here first; the list empties after every test.
 */
export const expectedReports: RegExp[] = [];

export function expectReport(pattern: RegExp): void {
  expectedReports.push(pattern);
}
