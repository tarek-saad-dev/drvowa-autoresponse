/** Excel-safe UTF-8 CSV helpers used by platform-admin exports. */
export function safeCsvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  // Neutralize formula injection, including attempts prefixed by whitespace.
  if (/^[\s\x00-\x1F]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function csvLine(values: Array<string | number | null | undefined>): string {
  return values.map(safeCsvCell).join(",");
}
