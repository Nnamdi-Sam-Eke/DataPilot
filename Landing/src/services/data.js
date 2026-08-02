import { API_BASE } from "../DataPilotContext.jsx";

export async function fetchSessionData(sessionId) {
  const res = await fetch(`${API_BASE}/data/${sessionId}`);

  if (res.status === 404) {
    const err = new Error("SESSION_EXPIRED");
    err.code = "SESSION_EXPIRED";
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch dataset (${res.status})`);
  }

  // Guard: if the server returned HTML instead of JSON (e.g. backend is down
  // and a reverse proxy or Vite dev server caught the request), fail clearly
  // rather than crashing inside res.json() with a confusing parse error.
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Expected JSON, got ${contentType.split(";")[0].trim()} — is the backend running on ${API_BASE}?`
    );
  }

  return await res.json();
}