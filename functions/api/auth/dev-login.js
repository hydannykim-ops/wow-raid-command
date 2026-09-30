import { authStatus, createSession, upsertUser } from "../../_lib/auth.js";
import { json, sessionCookie } from "../../_lib/http.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  if (authStatus(env).mockLogin !== true) {
    return json({ error: "mock_disabled" }, 403);
  }
  const user = {
    id: "local-dev",
    battletag: "LocalDev#0000",
  };
  await upsertUser(env.DB, user);
  const sessionId = await createSession(env.DB, user.id);
  return json(
    { user },
    200,
    { "set-cookie": sessionCookie(sessionId, request) }
  );
}
