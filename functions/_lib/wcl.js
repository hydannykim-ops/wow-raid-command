/**
 * Warcraft Logs API v2 (client credentials + GraphQL).
 * Env: WCL_CLIENT_ID, WCL_CLIENT_SECRET
 */
let cachedToken = null;
let cachedExp = 0;

export function wclConfigured(env) {
  return Boolean(env?.WCL_CLIENT_ID && env?.WCL_CLIENT_SECRET);
}

async function getToken(env) {
  const now = Date.now();
  if (cachedToken && now < cachedExp - 60_000) return cachedToken;
  const basic = btoa(`${env.WCL_CLIENT_ID}:${env.WCL_CLIENT_SECRET}`);
  const res = await fetch("https://www.warcraftlogs.com/oauth/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`wcl token ${res.status}: ${text}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedExp = now + (Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

export async function wclGraphql(env, query, variables = {}) {
  const token = await getToken(env);
  const res = await fetch("https://www.warcraftlogs.com/api/v2/client", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`wcl graphql ${res.status}: ${JSON.stringify(body)}`);
  }
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}
