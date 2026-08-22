const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function api<T = unknown>(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const targetUrl = `${apiBaseUrl}${url}`;
  const response = await fetch(targetUrl, { ...init, headers, credentials: "include" });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}
