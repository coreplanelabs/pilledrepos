// Logs identify the failed operation without emitting API bodies or CLI stderr.
const reasons = new Set([
	"Public metadata unavailable.",
	"Repository identity changed.",
	"PR aggregates unavailable.",
	"Incomplete or private aggregate response.",
	"Invalid aggregate count.",
	"Unbounded aggregate response.",
	"Metadata too large.",
	"PR aggregates too large.",
	"Repository artwork unavailable.",
	"Repository artwork identity unavailable.",
	"Artwork metadata too large.",
]);
/** @param {unknown} cause */
export function captureReason(cause) {
	if (!(cause instanceof Error)) return "Read could not be completed.";
	if (reasons.has(cause.message)) return cause.message;
	const status = /^GitHub read failed \((\d{3})\)\.$/.exec(cause.message);
	if (status) return `GitHub returned HTTP ${status[1]}.`;
	if (["AbortError", "TimeoutError"].includes(cause.name))
		return "Read timed out.";
	if (cause instanceof SyntaxError) return "Response was not valid JSON.";
	const code = /** @type {{code?:unknown}} */ (cause).code;
	if (typeof code === "number" && Number.isInteger(code))
		return `GitHub CLI exited with code ${code}.`;
	return "Read could not be completed.";
}
