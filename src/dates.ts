/** Calendar dates for the measured window stay in UTC. */
export function friendlyDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
export function friendlyRange(start: string, end: string): string {
  const a = new Date(start),
    b = new Date(end);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()))
    return "Not available";
  if (a.getUTCFullYear() !== b.getUTCFullYear())
    return `${friendlyDate(start)} – ${friendlyDate(end)}`;
  const first = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(a);
  return `${first} – ${friendlyDate(end)}`;
}
export function friendlyTimestamp(value: string, timeZone = "UTC"): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(date);
}
export function readAge(value: string, now = Date.now()): string {
  const captured = Date.parse(value);
  if (!Number.isFinite(captured)) return "not available";
  const minutes = Math.max(0, Math.floor((now - captured) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
