import { authStatus } from "../../_lib/auth.js";
import { authorizeUrl } from "../../_lib/blizzard.js";
import { json, redirect, stateCookie } from "../../_lib/http.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const status = authStatus(env);
  if (!status.authConfigured) {
    return json(
      {
        error: "blizzard_not_configured",
        message: "BNET_CLIENT_ID / BNET_CLIENT_SECRET 가 없습니다.",
        mockLogin: status.mockLogin,
      },
      501
    );
  }
  const state = crypto.randomUUID();
  return redirect(authorizeUrl(env, request, state), {
    "set-cookie": stateCookie(state, request),
  });
}
