import { readSessionId } from "./http.js";

const SESSION_DAYS = 14;

/** 실제 Battle.net 키가 없을 때 쓰는 고정 미리보기 계정. */
export const PREVIEW_USER = {
  id: "bnet-preview",
  battletag: "RaidLead#1842",
};

export function isPreviewUser(user) {
  return Boolean(user && user.id === PREVIEW_USER.id);
}

export async function upsertUser(db, { id, battletag }) {
  await db
    .prepare(
      `INSERT INTO users (id, battletag, last_login_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         battletag = excluded.battletag,
         last_login_at = excluded.last_login_at`
    )
    .bind(id, battletag)
    .run();
}

export async function createSession(db, userId) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`
    )
    .bind(id, userId)
    .run();
  return id;
}

export async function deleteSession(db, sessionId) {
  if (!sessionId) return;
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

export async function getUserFromRequest(db, request) {
  const sessionId = readSessionId(request);
  if (!sessionId) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.battletag
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now')`
    )
    .bind(sessionId)
    .first();
  return row || null;
}

export function authStatus(env) {
  return {
    authConfigured: Boolean(env.BNET_CLIENT_ID && env.BNET_CLIENT_SECRET),
    mockLogin: env.DEV_MOCK_LOGIN === "1",
  };
}

export async function saveOAuthToken(db, userId, accessToken, expiresIn) {
  if (!db || !userId || !accessToken) return;
  const sec = Math.max(60, Number(expiresIn) || 86400);
  await db
    .prepare(
      `INSERT INTO oauth_tokens (user_id, access_token, expires_at)
       VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
       ON CONFLICT(user_id) DO UPDATE SET
         access_token = excluded.access_token,
         expires_at = excluded.expires_at`
    )
    .bind(userId, accessToken, String(sec))
    .run();
}

export async function getOAuthToken(db, userId) {
  if (!db || !userId) return null;
  const row = await db
    .prepare(
      `SELECT access_token
       FROM oauth_tokens
       WHERE user_id = ? AND expires_at > datetime('now')`
    )
    .bind(userId)
    .first();
  return row && row.access_token ? row.access_token : null;
}
