import { authStatus, getUserFromRequest, isPreviewUser } from "../_lib/auth.js";
import { json } from "../_lib/http.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const status = authStatus(env);
  try {
    const user = await getUserFromRequest(env.DB, request);
    return json({ user, preview: isPreviewUser(user), ...status });
  } catch {
    return json({ user: null, preview: false, ...status, dbReady: false });
  }
}
