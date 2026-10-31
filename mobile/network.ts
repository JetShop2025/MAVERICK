export const CONNECTION_MESSAGE = "Unable to connect to MAVTRACK. Check your connection and tap Retry. Your displayed loads may be out of date.";

export class ConnectionError extends Error {
  constructor(message = CONNECTION_MESSAGE) {
    super(message);
    this.name = "ConnectionError";
  }
}

// Repeat reads only: a failed response to a write does not mean it was not saved.
export async function requestJson(
  url: string,
  options: RequestInit = {},
  settings: { timeoutMs?: number; retryDelayMs?: number } = {}
): Promise<{ response: Response; payload: any }> {
  const readOnly = ["GET", "HEAD"].includes((options.method || "GET").toUpperCase());
  const attempts = readOnly ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort);
    const timer = setTimeout(abort, settings.timeoutMs ?? 12000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      // Keep the timeout active while reading the body as well.
      const body = await response.text();
      if (readOnly && [502, 503, 504].includes(response.status)) {
        throw new ConnectionError();
      }
      let payload: any = null;
      try { payload = JSON.parse(body); } catch { /* HTTP status is handled by caller. */ }
      return { response, payload };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (attempt + 1 === attempts) throw new ConnectionError(readOnly ? CONNECTION_MESSAGE : "Unable to confirm the result. Refresh your loads before trying this action again.");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
    await new Promise(resolve => setTimeout(resolve, settings.retryDelayMs ?? 750));
  }
  throw new ConnectionError();
}
