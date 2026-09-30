import { readSessionId } from "./http.js";

const SESSION_DAYS = 14;

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
