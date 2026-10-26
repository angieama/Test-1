export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** All requests are uncached and bounded; callers control whether mutations are retried. */
export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 20000,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
  try {
    const response = await fetch(path, { ...options, cache: "no-store", signal: controller.signal });
    let data: unknown;
    try { data = await response.json(); }
    catch {
      throw new ApiError(response.status === 401
        ? "Please sign in to open your merchant workspace."
        : "The server returned an unexpected response. Please try again.", response.status);
    }
    if (!response.ok) {
      const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error : "Couldn’t complete the request. Please try again.";
      throw new ApiError(message, response.status);
    }
    return data as T;
  } catch (error) {
    if (timedOut) throw new ApiError("The request timed out. Refresh to check the latest status before trying again.", 408);
    if (error instanceof TypeError) throw new ApiError("Couldn’t connect. Check your connection, then refresh before trying again.", 0);
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
}
