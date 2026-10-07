import { getUserFromRequest } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { deleteRoster, getRoster, saveRoster } from "../../_lib/rosters.js";

export async function onRequestGet(context) {
  const { env, request, params } = context;
  const user = await getUserFromRequest(env.DB, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const roster = await getRoster(env.DB, user.id, params.id);
  if (!roster) return json({ error: "not_found" }, 404);
  return json({ roster });
}

export async function onRequestPut(context) {
  const { env, request, params } = context;
  const user = await getUserFromRequest(env.DB, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await request.json().catch(() => ({}));
  const result = await saveRoster(env.DB, user.id, { ...body, id: params.id });
  if (result?.error === "limit") return json({ error: "limit" }, 409);
  if (result?.error === "not_found" || !result?.roster) return json({ error: "not_found" }, 404);
  return json({ roster: result.roster });
}

export async function onRequestDelete(context) {
  const { env, request, params } = context;
  const user = await getUserFromRequest(env.DB, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const ok = await deleteRoster(env.DB, user.id, params.id);
  if (!ok) return json({ error: "not_found" }, 404);
  return json({ ok: true });
}
