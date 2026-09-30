import { getUserFromRequest } from "../_lib/auth.js";
import { json } from "../_lib/http.js";
import { listRosters, saveRoster } from "../_lib/rosters.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const user = await getUserFromRequest(env.DB, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { results } = await listRosters(env.DB, user.id);
  return json({ rosters: results || [] });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const user = await getUserFromRequest(env.DB, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await request.json().catch(() => ({}));
  const roster = await saveRoster(env.DB, user.id, body);
  return json({ roster }, 201);
}
