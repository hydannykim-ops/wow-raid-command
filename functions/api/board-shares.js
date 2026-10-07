import { getUserFromRequest } from "../_lib/auth.js";
import { json } from "../_lib/http.js";
import { createBoardShare } from "../_lib/board-shares.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const user = await getUserFromRequest(env.DB, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await request.json().catch(() => ({}));
  const result = await createBoardShare(env.DB, user, {
    title: body.title,
    payload: body.payload,
  });
  if (result?.error === "too_large") return json({ error: "too_large" }, 413);
  return json({ share: result.share }, 201);
}
