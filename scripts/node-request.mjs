/** Preserve the browser's headers and body when bridging Node HTTP to Fetch. */
export async function nodeRequest(req, fallbackOrigin) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers))
    if (value !== undefined)
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  const origin = new URL(fallbackOrigin);
  const host = headers.get("host");
  if (host && /^(?:127\.0\.0\.1|localhost):\d+$/.test(host)) origin.host = host;
  let body;
  if (!["GET", "HEAD"].includes(req.method ?? "GET")) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) throw new Error("Input too large.");
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
  }
  return new Request(new URL(req.url ?? "/", origin), {
    method: req.method,
    headers,
    body,
  });
}
