import { createSession, upsertUser } from "../../_lib/auth.js";
import { exchangeCode, fetchUserInfo } from "../../_lib/blizzard.js";
import {
  clearCookie,
  originOf,
  readOAuthState,
  sessionCookie,
} from "../../_lib/http.js";

function home(request, extra = "") {
  return `${originOf(request)}/${extra}`;
}

function bounce(location, cookies) {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const expected = readOAuthState(request);
  const dropState = clearCookie("raid_oauth_state", request);

  if (!code || !state || !expected || state !== expected) {
    return bounce(home(request, "?auth=denied"), [dropState]);
  }

  try {
    const token = await exchangeCode(env, request, code);
    const profile = await fetchUserInfo(token.access_token);
    await upsertUser(env.DB, profile);
    const sessionId = await createSession(env.DB, profile.id);
    return bounce(home(request, "?auth=ok"), [
      sessionCookie(sessionId, request),
      dropState,
    ]);
  } catch {
    return bounce(home(request, "?auth=error"), [dropState]);
  }
}
