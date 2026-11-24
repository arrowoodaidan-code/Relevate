// Shared defensive client response reader.
//
// Root cause this fixes (live diagnostic 2026-11-22): a cold host answers an
// API call with a plain-text 503 ("Upstream unavailable"), the client called
// res.json() on that body, JSON.parse threw on the "U", and the catch block
// printed the SyntaxError's message to the agent as if it were product copy —
// "Generation failed: Unexpected token 'U', "Upstream unavailable" is not
// valid JSON. Please try again."
//
// readApiResponse never lets a parser error become user-facing copy. It reads
// the body as text, parses it only when it is valid JSON, and maps every
// failure to a fixed human message. `data` still carries the parsed envelope
// on a failure (null when the body was not JSON) so callers that need
// structured fields there — the 402 trial-ended upgrade prompt, the server's
// own `error` string — keep working exactly as before.

// T defaults to `any` on purpose: it mirrors what res.json() returned at the
// call sites this replaces, so switching a call site to readApiResponse does
// not change what TypeScript knows about the envelope.
export type ApiResult<T = any> = {
  ok: boolean;
  status: number;
  /** Parsed JSON body when the body was valid JSON; null otherwise. */
  data: T | null;
  /** Human-readable failure copy. Empty string when ok. */
  message: string;
};

const WARMING_UP = "The service is warming up — please try again in a moment.";
const SERVER_SIDE = "Something went wrong on our side. Please try again.";
const GENERIC = "Something went wrong. Please try again.";

// The server's own copy when it managed to send a JSON error envelope
// ({ error: "..." }); otherwise null so the caller falls back to ours.
function serverErrorCopy(data: unknown): string | null {
  if (data && typeof data === "object") {
    const err = (data as Record<string, unknown>).error;
    if (typeof err === "string" && err.trim()) return err.trim();
  }
  return null;
}

export async function readApiResponse<T = any>(
  res: Response,
): Promise<ApiResult<T>> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    // Body unreadable (rare transport failure) — treat as an empty body.
  }

  let data: unknown = null;
  let parsed = false;
  const trimmed = text.trim();
  if (trimmed) {
    try {
      data = JSON.parse(trimmed);
      parsed = true;
    } catch {
      // Plain-text body (e.g. the host's 503 "Upstream unavailable") — it is
      // never surfaced raw; the mapping below decides the copy.
      parsed = false;
    }
  }

  if (res.ok) {
    if (!parsed) {
      return { ok: false, status: res.status, data: null, message: GENERIC };
    }
    return { ok: true, status: res.status, data: data as T, message: "" };
  }

  const message =
    res.status === 503
      ? WARMING_UP
      : res.status >= 500
        ? SERVER_SIDE
        : serverErrorCopy(data) || GENERIC;
  return {
    ok: false,
    status: res.status,
    data: (parsed ? data : null) as T | null,
    message,
  };
}
