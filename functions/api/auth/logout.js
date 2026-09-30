import { deleteSession } from "../../_lib/auth.js";
import {
  clearCookie,
  json,
  originOf,
  readSessionId,
  redirect,
} from "../../_lib/http.js";

export async function onRequest(context) {
  const { env, request } = context;
  await deleteSession(env.DB, readSessionId(request));
  const headers = { "set-cookie": clearCookie("raid_session", request) };
  if (request.method === "GET") {
    return redirect(`${originOf(request)}/?auth=logout`, headers);
  }
  return json({ ok: true }, 200, headers);
}
