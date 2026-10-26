// CSV moved to genesis-core (./csv) so ResourceView's export and the importers share it.
export { csvField, exportCsv, parseCsv, toCsv, type ExportOptions } from "@marktiderman/genesis-core/csv";

/** Hand the browser a file to save. */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
