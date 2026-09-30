export async function listRosters(db, userId) {
  return db
    .prepare(
      `SELECT id, name, size, updated_at
       FROM rosters
       WHERE user_id = ?
       ORDER BY updated_at DESC`
    )
    .bind(userId)
    .all();
}

export async function getRoster(db, userId, rosterId) {
  const roster = await db
    .prepare(
      `SELECT id, name, size, created_at, updated_at
       FROM rosters
       WHERE id = ? AND user_id = ?`
    )
    .bind(rosterId, userId)
    .first();
  if (!roster) return null;
  const members = await db
    .prepare(
      `SELECT class, spec, role, sort_order
       FROM roster_members
       WHERE roster_id = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .bind(rosterId)
    .all();
  return { ...roster, members: members.results || [] };
}

export async function saveRoster(db, userId, { id, name, size, members }) {
  const rosterId = id || crypto.randomUUID();
  const rosterName = (name || "My Roster").slice(0, 80);
  const rosterSize = Number(size) || 20;
  const list = Array.isArray(members) ? members : [];

  await db
    .prepare(
      `INSERT INTO rosters (id, user_id, name, size, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         size = excluded.size,
         updated_at = excluded.updated_at
       WHERE user_id = excluded.user_id`
    )
    .bind(rosterId, userId, rosterName, rosterSize)
    .run();

  const owned = await db
    .prepare("SELECT id FROM rosters WHERE id = ? AND user_id = ?")
    .bind(rosterId, userId)
    .first();
  if (!owned) return null;

  await db.prepare("DELETE FROM roster_members WHERE roster_id = ?").bind(rosterId).run();

  const stmts = list.map((m, i) =>
    db
      .prepare(
        `INSERT INTO roster_members (roster_id, class, spec, role, sort_order)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(rosterId, m.class || "", m.spec || "", m.role || "", i)
  );
  if (stmts.length) await db.batch(stmts);

  return getRoster(db, userId, rosterId);
}

export async function deleteRoster(db, userId, rosterId) {
  await db.prepare("DELETE FROM roster_members WHERE roster_id = ?").bind(rosterId).run();
  const result = await db
    .prepare("DELETE FROM rosters WHERE id = ? AND user_id = ?")
    .bind(rosterId, userId)
    .run();
  return result.meta?.changes > 0;
}
