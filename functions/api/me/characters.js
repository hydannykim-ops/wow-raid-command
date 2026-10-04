import { authStatus, getOAuthToken, getUserFromRequest, isPreviewUser } from "../../_lib/auth.js";
import { fetchWowCharacters } from "../../_lib/blizzard.js";
import { json } from "../../_lib/http.js";

const PREVIEW_CHARS = [
  {
    id: "preview-1",
    name: "그롬쉬",
    realm: "아즈샤라",
    realmSlug: "azshara",
    region: "kr",
    level: 80,
    className: "전사",
    faction: "HORDE",
  },
  {
    id: "preview-2",
    name: "벨렌드라",
    realm: "줄진",
    realmSlug: "zuljin",
    region: "kr",
    level: 80,
    className: "사제",
    faction: "HORDE",
  },
  {
    id: "preview-3",
    name: "진타",
    realm: "듀로탄",
    realmSlug: "durotan",
    region: "kr",
    level: 80,
    className: "주술사",
    faction: "HORDE",
  },
];

export async function onRequestGet(context) {
  const { env, request } = context;
  const status = authStatus(env);
  let user = null;
  try {
    user = await getUserFromRequest(env.DB, request);
  } catch {
    return json({ characters: [], user: null, ...status });
  }
  if (!user) return json({ characters: [], user: null, needsLogin: true, ...status });
  if (isPreviewUser(user)) {
    return json({ characters: PREVIEW_CHARS, user, preview: true, ...status });
  }
  try {
    const token = await getOAuthToken(env.DB, user.id);
    if (!token) {
      return json({ characters: [], user, needsReauth: true, ...status });
    }
    const characters = await fetchWowCharacters(token);
    return json({ characters, user, ...status });
  } catch (err) {
    if (err && err.code === "reauth") {
      return json({ characters: [], user, needsReauth: true, ...status }, 401);
    }
    return json({ characters: [], user, error: "wow_profile_failed", ...status }, 502);
  }
}
