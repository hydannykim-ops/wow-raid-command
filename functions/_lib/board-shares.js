const MAX_JSON = 900000;

function parsePayload(raw) {
  if (!raw) return null;
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export function publicShare(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || "",
    author: row.author || "",
    created_at: row.created_at || "",
    payload: parsePayload(row.payload_json),
  };
}

export async function createBoardShare(db, user, { title, payload }) {
  const json = JSON.stringify(payload && typeof payload === "object" ? payload : {});
  if (json.length > MAX_JSON) return { error: "too_large" };
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const shareTitle = String(title || "Order Board").slice(0, 80);
  const author = String(user?.battletag || "").slice(0, 80);
  await db
    .prepare(
      `INSERT INTO board_shares (id, user_id, title, author, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(id, user.id, shareTitle, author, json)
    .run();
  const row = await db
    .prepare(`SELECT id, title, author, payload_json, created_at FROM board_shares WHERE id = ?`)
    .bind(id)
    .first();
  return { share: publicShare(row) };
}

export async function getBoardShare(db, id) {
  if (!id) return null;
  const row = await db
    .prepare(`SELECT id, title, author, payload_json, created_at FROM board_shares WHERE id = ?`)
    .bind(id)
    .first();
  return publicShare(row);
}
