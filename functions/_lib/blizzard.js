export function redirectUri(env, request) {
  if (env.BNET_REDIRECT_URI) return env.BNET_REDIRECT_URI;
  return new URL("/api/auth/callback", request.url).toString();
}

export function authorizeUrl(env, request, state) {
  const url = new URL("https://oauth.battle.net/authorize");
  url.searchParams.set("client_id", env.BNET_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri(env, request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid wow.profile");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(env, request, code) {
  const basic = btoa(`${env.BNET_CLIENT_ID}:${env.BNET_CLIENT_SECRET}`);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(env, request),
  });
  const res = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchUserInfo(accessToken) {
  const res = await fetch("https://oauth.battle.net/oauth/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`userinfo ${res.status}: ${text}`);
  }
  const data = await res.json();
  const id = String(data.id || data.sub || "");
  const battletag = data.battletag || data.battleTag || id;
  if (!id) throw new Error("userinfo missing account id");
  return { id, battletag };
}
