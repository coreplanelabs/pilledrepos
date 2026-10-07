export function friendlyTimestamp(
	value: string,
	timeZone?: string,
	locale = "en-US",
): string {
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "Not available";
	const day = new Intl.DateTimeFormat("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone,
	}).format(date);
	const time = new Intl.DateTimeFormat(locale, {
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
		timeZone,
	}).format(date);
	return `${day} · ${time}`;
}
