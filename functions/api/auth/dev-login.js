import { PREVIEW_USER, authStatus, createSession, upsertUser } from "../../_lib/auth.js";
import { json, sessionCookie } from "../../_lib/http.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  if (authStatus(env).mockLogin !== true) {
    return json({ error: "mock_disabled" }, 403);
  }
  const user = { ...PREVIEW_USER };
  await upsertUser(env.DB, user);
  const sessionId = await createSession(env.DB, user.id);
  return json(
    { user, preview: true },
    200,
    { "set-cookie": sessionCookie(sessionId, request) }
  );
}
