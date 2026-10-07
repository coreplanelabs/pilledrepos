// Workers accepts manual redirects, but not the browser/Node "error" mode.
// Preserve refusal semantics rather than allowing credentials to follow a hop.
export function edgeFetcher(upstream: typeof fetch): typeof fetch {
  return async (input, init) => {
    const refuseRedirects = init?.redirect === "error";
    const response = await upstream(input, { ...init, redirect: refuseRedirects ? "manual" : init?.redirect });
    if (refuseRedirects && response.status >= 300 && response.status < 400) throw new TypeError("Upstream redirect refused.");
    return response;
  };
}
