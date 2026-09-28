export const AUTH_COOKIE = "kc_auth";

/** Cookie value derived from APP_PASSWORD; changing the password logs everyone out. Works in Edge and Node. */
export async function authToken(password: string) {
  const data = new TextEncoder().encode(`karcare-invoices:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
