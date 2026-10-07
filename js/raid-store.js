/**
 * 내 공대 저장소 — 로그인 계정당 최대 10개.
 * 온라인: D1 /api/rosters
 * 미리보기·오프라인: localStorage
 */
(function (global) {
  "use strict";

  const MAX = 10;
  const LOCAL_KEY = "wow-raid-my-raids-v1";
  const LEGACY_KEY = "wow-raid-preview-rosters";

  async function api(path, opts) {
    const res = await fetch(path, {
      credentials: "same-origin",
      ...opts,
      headers: {
        accept: "application/json",
        ...(opts && opts.body ? { "content-type": "application/json" } : {}),
        ...((opts && opts.headers) || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function userId() {
    return global.RaidAuth?.user?.()?.id || "_anon";
  }

  function isLoggedIn() {
    return Boolean(global.RaidAuth?.user?.());
  }

  function isOffline() {
    return Boolean(global.RaidAuth?.offline?.());
  }

  function readBucket() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function writeBucket(all) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  }

  function migrateLegacy(list) {
    if (list.length) return list;
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
      if (!Array.isArray(legacy) || !legacy.length) return list;
      return legacy.slice(0, MAX).map((r) => ({
        id: r.id,
        name: r.name || "My Roster",
        size: r.size || 20,
        members: r.members || [],
        plan: r.plan || null,
        updated_at: r.updated_at || new Date().toISOString(),
      }));
    } catch {
      return list;
    }
  }

  function readLocal() {
    const all = readBucket();
    const list = migrateLegacy(Array.isArray(all[userId()]) ? all[userId()] : []);
    all[userId()] = list;
    writeBucket(all);
    return list.map(normalize);
  }

  function writeLocal(list) {
    const all = readBucket();
    all[userId()] = list.slice(0, MAX);
    writeBucket(all);
  }

  function parsePlan(raw) {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function normalize(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name || "My Roster",
      size: Number(row.size) || 20,
      members: Array.isArray(row.members) ? row.members : [],
      plan: parsePlan(row.plan || row.plan_json),
      updated_at: row.updated_at || "",
    };
  }

  function sortByUpdated(list) {
    return [...list].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }

  async function list() {
    if (!isLoggedIn()) return [];
    if (isOffline()) return sortByUpdated(readLocal());
    try {
      const data = await api("/api/rosters");
      const remote = (data.rosters || []).map(normalize);
      const merged = mergeList(remote, readLocal());
      writeLocal(merged);
      return sortByUpdated(merged);
    } catch {
      return sortByUpdated(readLocal());
    }
  }

  function mergeList(remote, local) {
    const map = new Map();
    remote.forEach((r) => map.set(r.id, r));
    local.forEach((r) => {
      const cur = map.get(r.id);
      if (!cur) map.set(r.id, r);
      else if (r.plan && !cur.plan) map.set(r.id, { ...cur, plan: r.plan, members: r.members?.length ? r.members : cur.members });
    });
    return [...map.values()];
  }

  async function get(id) {
    if (!id || !isLoggedIn()) return null;
    if (isOffline()) return readLocal().find((r) => r.id === id) || null;
    try {
      const data = await api(`/api/rosters/${id}`);
      const row = normalize(data.roster);
      const listNow = readLocal();
      const idx = listNow.findIndex((r) => r.id === id);
      if (idx >= 0) listNow[idx] = { ...listNow[idx], ...row };
      else listNow.unshift(row);
      writeLocal(listNow);
      return row;
    } catch {
      return readLocal().find((r) => r.id === id) || null;
    }
  }

  async function save(payload) {
    if (!isLoggedIn()) {
      const err = new Error("unauthorized");
      err.status = 401;
      throw err;
    }
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const name = String(payload.name || "My Roster").slice(0, 80);
    const size = Number(payload.size) || 20;
    const members = Array.isArray(payload.members) ? payload.members : [];

    const upsertLocal = (id, extra) => {
      const listNow = readLocal();
      const idx = listNow.findIndex((r) => r.id === id);
      const prev = idx >= 0 ? listNow[idx] : null;
      if (!prev && listNow.length >= MAX) {
        const err = new Error("limit");
        err.status = 409;
        err.data = { error: "limit" };
        throw err;
      }
      const next = {
        id,
        name,
        size,
        members,
        plan: extra.plan !== undefined ? extra.plan : prev?.plan || null,
        updated_at: now,
      };
      if (idx >= 0) listNow[idx] = { ...prev, ...next };
      else listNow.unshift(next);
      writeLocal(listNow);
      return normalize(next);
    };

    if (isOffline()) {
      const id = payload.id || `raid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      return upsertLocal(id, { plan: payload.plan });
    }

    try {
      const body = { name, size, members };
      if (payload.plan !== undefined) body.plan = payload.plan;
      const data = payload.id
        ? await api(`/api/rosters/${payload.id}`, { method: "PUT", body: JSON.stringify({ ...body, id: payload.id }) })
        : await api("/api/rosters", { method: "POST", body: JSON.stringify(body) });
      const saved = normalize(data.roster);
      return upsertLocal(saved.id, { plan: saved.plan !== undefined ? saved.plan : payload.plan });
    } catch (err) {
      if (err.status === 409) throw err;
      const id = payload.id || `raid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      return upsertLocal(id, { plan: payload.plan });
    }
  }

  async function remove(id) {
    if (!id || !isLoggedIn()) return false;
    writeLocal(readLocal().filter((r) => r.id !== id));
    if (isOffline()) return true;
    try {
      await api(`/api/rosters/${id}`, { method: "DELETE" });
      return true;
    } catch {
      return true;
    }
  }

  global.RaidStore = {
    MAX,
    isLoggedIn,
    isOffline,
    list,
    get,
    save,
    remove,
  };
})(window);
