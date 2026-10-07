import { json } from "../../_lib/http.js";
import { getBoardShare } from "../../_lib/board-shares.js";

export async function onRequestGet(context) {
  const { env, params } = context;
  const share = await getBoardShare(env.DB, params.id);
  if (!share || !share.payload) return json({ error: "not_found" }, 404);
  return json({ share });
}
