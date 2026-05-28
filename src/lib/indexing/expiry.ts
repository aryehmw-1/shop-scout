/** End of local calendar day (23:59:59.999) for nightly quote expiry. */
export function endOfLocalDay(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Start of next local day — use as expiresAt for “valid through today”. */
export function startOfNextLocalDay(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
