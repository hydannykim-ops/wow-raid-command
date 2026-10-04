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

const WOW_REGIONS = [
  { id: "kr", host: "kr.api.blizzard.com", ns: "profile-kr", locale: "ko_KR" },
  { id: "us", host: "us.api.blizzard.com", ns: "profile-us", locale: "en_US" },
  { id: "eu", host: "eu.api.blizzard.com", ns: "profile-eu", locale: "en_GB" },
  { id: "tw", host: "tw.api.blizzard.com", ns: "profile-tw", locale: "zh_TW" },
];

export async function fetchWowCharacters(accessToken) {
  const out = [];
  let unauthorized = false;
  for (const region of WOW_REGIONS) {
    const url = new URL(`https://${region.host}/profile/user/wow`);
    url.searchParams.set("namespace", region.ns);
    url.searchParams.set("locale", region.locale);
    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401 || res.status === 403) {
      unauthorized = true;
      continue;
    }
    if (!res.ok) continue;
    const data = await res.json().catch(() => ({}));
    for (const account of data.wow_accounts || []) {
      for (const ch of account.characters || []) {
        out.push({
          id: String(ch.id || `${region.id}-${ch.name}`),
          name: ch.name || "",
          realm: (ch.realm && ch.realm.name) || "",
          realmSlug: (ch.realm && ch.realm.slug) || "",
          region: region.id,
          level: Number(ch.level) || 0,
          className: (ch.playable_class && ch.playable_class.name) || "",
          faction: (ch.faction && (ch.faction.type || ch.faction.name)) || "",
        });
      }
    }
  }
  if (!out.length && unauthorized) {
    const err = new Error("reauth");
    err.code = "reauth";
    throw err;
  }
  const max = out.reduce((m, c) => Math.max(m, c.level), 0);
  const floor = max >= 70 ? max : 0;
  return out
    .filter((c) => c.name && c.level >= floor)
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "ko"));
}
