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
  const result = await saveRoster(env.DB, user.id, body);
  if (result?.error === "limit") return json({ error: "limit" }, 409);
  if (result?.error === "not_found") return json({ error: "not_found" }, 404);
  return json({ roster: result.roster }, 201);
}
