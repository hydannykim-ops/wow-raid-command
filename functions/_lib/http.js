const SESSION_COOKIE = "raid_session";
const STATE_COOKIE = "raid_oauth_state";
const SESSION_DAYS = 14;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function cookieFlags(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const parts = raw.split(/;\s*/);
  for (const part of parts) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return "";
}

export function setCookie(name, value, request, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; ${cookieFlags(request)}; Max-Age=${maxAgeSec}`;
}

export function clearCookie(name, request) {
  return `${name}=; ${cookieFlags(request)}; Max-Age=0`;
}

export function sessionCookie(id, request) {
  return setCookie(SESSION_COOKIE, id, request, SESSION_DAYS * 24 * 60 * 60);
}

export function stateCookie(value, request) {
  return setCookie(STATE_COOKIE, value, request, 600);
}

export function readSessionId(request) {
  return readCookie(request, SESSION_COOKIE);
}

export function readOAuthState(request) {
  return readCookie(request, STATE_COOKIE);
}

export function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: { location, ...headers },
  });
}

export function originOf(request) {
  return new URL(request.url).origin;
}
