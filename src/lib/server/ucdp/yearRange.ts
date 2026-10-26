/** Validate explicit year filters before loading UCDP data. */
export function isValidUcdpYearRange(params: URLSearchParams, currentYear = new Date().getFullYear()): boolean {
  const from = params.get("fromYear");
  const to = params.get("toYear");
  for (const value of [from, to]) {
    if (value === null) continue;
    if (!/^\d{4}$/.test(value)) return false;
    const year = Number(value);
    if (year < 1989 || year > currentYear) return false;
  }
  return from === null || to === null || Number(from) <= Number(to);
}
