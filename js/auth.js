(function () {
  const box = document.getElementById("authBox");
  const cloud = document.getElementById("rosterCloud");
  const loginHint = document.getElementById("rosterLoginHint");
  const savedSel = document.getElementById("savedRosters");
  const saveBtn = document.getElementById("saveRoster");
  const loadBtn = document.getElementById("loadRoster");
  if (!box) return;

  const PREVIEW_USER = { id: "bnet-preview", battletag: "RaidLead#1842" };
  const LOCAL_SESSION_KEY = "wow-raid-preview-session";
  const LOCAL_ROSTERS_KEY = "wow-raid-preview-rosters";
  const PREVIEW_CHARS = [
    { id: "preview-1", name: "그롬쉬", realm: "아즈샤라", realmSlug: "azshara", region: "kr", level: 80, className: "전사", faction: "HORDE" },
    { id: "preview-2", name: "벨렌드라", realm: "줄진", realmSlug: "zuljin", region: "kr", level: 80, className: "사제", faction: "HORDE" },
    { id: "preview-3", name: "진타", realm: "듀로탄", realmSlug: "durotan", region: "kr", level: 80, className: "주술사", faction: "HORDE" },
  ];

  let me = { user: null, authConfigured: false, mockLogin: false, offline: false };
  let charCache = null;
  const authListeners = [];

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeLocalSession(user) {
    if (!user) localStorage.removeItem(LOCAL_SESSION_KEY);
    else localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
  }

  function t(key) {
    const lang = document.getElementById("langBtn")?.textContent === "한글" ? "en" : "ko";
    const table = {
      ko: {
        loginBnet: "Battle.net 로그인",
        logout: "로그아웃",
        preview: "미리보기",
        loginHint: "로그인하면 이 공대를 내 계정에 저장할 수 있습니다.",
        saveOk: "공대를 계정에 저장했습니다.",
        saveOkLocal: "이 브라우저에 공대를 저장했습니다.",
        saveNeedMembers: "저장할 전문화가 없습니다.",
        loadNeedPick: "불러올 공대를 선택하세요.",
        loadOk: "저장된 공대를 불러왔습니다.",
        pickRoster: "저장된 공대",
        saving: "저장 중...",
      },
      en: {
        loginBnet: "Log in with Battle.net",
        logout: "Log out",
        preview: "Preview",
        loginHint: "Log in to save this roster to your account.",
        saveOk: "Roster saved to your account.",
        saveOkLocal: "Roster saved in this browser.",
        saveNeedMembers: "Add specs before saving.",
        loadNeedPick: "Choose a saved roster.",
        loadOk: "Loaded saved roster.",
        pickRoster: "Saved rosters",
        saving: "Saving...",
      },
    };
    return table[lang][key] || key;
  }

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

  function renderAuth() {
    if (me.user) {
      const preview = me.preview ? `<span class="auth-preview">${t("preview")}</span>` : "";
      box.innerHTML = `<span class="auth-tag">${me.user.battletag}</span>${preview}
        <button class="ghost auth-btn" id="logoutBtn">${t("logout")}</button>`;
      box.querySelector("#logoutBtn").onclick = async () => {
        if (!me.offline) {
          try {
            await api("/api/auth/logout", { method: "POST" });
          } catch {
            /* file:// 이나 API 없음 */
          }
        }
        writeLocalSession(null);
        me.user = null;
        me.preview = false;
        charCache = null;
        renderAuth();
        await loadRosterList();
      };
    } else if (me.authConfigured) {
      box.innerHTML = `<a class="auth-login" href="/api/auth/login">${t("loginBnet")}</a>`;
    } else if (me.mockLogin) {
      box.innerHTML = `<button class="auth-login" id="previewLoginBtn" type="button">${t("loginBnet")}</button>`;
      box.querySelector("#previewLoginBtn").onclick = async () => {
        try {
          const data = await api("/api/auth/dev-login", { method: "POST" });
          me.user = data.user;
          me.preview = true;
          me.offline = false;
        } catch {
          me.user = PREVIEW_USER;
          me.preview = true;
          me.offline = true;
          me.mockLogin = true;
          writeLocalSession(me.user);
        }
        renderAuth();
        await loadRosterList();
      };
    } else {
      box.innerHTML = "";
    }
    if (cloud) cloud.classList.toggle("hidden", !me.user);
    if (loginHint) {
      loginHint.textContent = t("loginHint");
      loginHint.classList.toggle("hidden", Boolean(me.user));
    }
    document.dispatchEvent(new Event("raid:auth"));
    authListeners.forEach((fn) => {
      try {
        fn(me.user);
      } catch {
        /* listener */
      }
    });
  }

  function fillRosterSelect(rosters) {
    savedSel.innerHTML = `<option value="">${t("pickRoster")}</option>`;
    (rosters || []).forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = `${r.name} (${r.size})`;
      savedSel.appendChild(opt);
    });
  }

  async function loadRosterList() {
    savedSel.innerHTML = `<option value="">${t("pickRoster")}</option>`;
    if (!me.user) return;
    if (me.offline) {
      fillRosterSelect(readJson(LOCAL_ROSTERS_KEY, []));
      return;
    }
    try {
      const data = await api("/api/rosters");
      fillRosterSelect(data.rosters || []);
    } catch {
      /* not logged in or D1 not ready */
    }
  }

  async function refreshMe() {
    try {
      me = await api("/api/me");
      if (typeof me.authConfigured !== "boolean") throw new Error("not api");
      me.offline = false;
    } catch {
      const user = readJson(LOCAL_SESSION_KEY, null);
      me = {
        user,
        authConfigured: false,
        mockLogin: true,
        preview: Boolean(user),
        offline: true,
      };
    }
    renderAuth();
    await loadRosterList();
  }

  saveBtn.onclick = async () => {
    if (!me.user || !window.RaidRoster) return;
    const snap = window.RaidRoster.snapshot();
    if (!snap.members.length) {
      alert(t("saveNeedMembers"));
      return;
    }
    const existing = savedSel.value;
    saveBtn.disabled = true;
    try {
      const payload = {
        id: existing || undefined,
        name: me.user.battletag.split("#")[0] + " roster",
        ...snap,
      };
      if (me.offline) {
        const list = readJson(LOCAL_ROSTERS_KEY, []);
        const id = existing || `local-${Date.now()}`;
        const roster = { id, name: payload.name, size: snap.size, members: snap.members };
        const idx = list.findIndex((r) => r.id === id);
        if (idx >= 0) list[idx] = roster;
        else list.unshift(roster);
        localStorage.setItem(LOCAL_ROSTERS_KEY, JSON.stringify(list));
        await loadRosterList();
        savedSel.value = id;
        alert(t("saveOkLocal"));
        return;
      }
      const data = existing
        ? await api(`/api/rosters/${existing}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await api("/api/rosters", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      await loadRosterList();
      if (data.roster) savedSel.value = data.roster.id;
      alert(t("saveOk"));
    } finally {
      saveBtn.disabled = false;
    }
  };

  loadBtn.onclick = async () => {
    const id = savedSel.value;
    if (!id) {
      alert(t("loadNeedPick"));
      return;
    }
    if (me.offline) {
      const roster = readJson(LOCAL_ROSTERS_KEY, []).find((r) => r.id === id);
      if (!roster) return;
      window.RaidRoster.apply(roster);
      alert(t("loadOk"));
      return;
    }
    const data = await api(`/api/rosters/${id}`);
    window.RaidRoster.apply(data.roster);
    alert(t("loadOk"));
  };

  document.addEventListener("raid:lang", () => {
    renderAuth();
    loadRosterList();
  });

  const authFlag = new URLSearchParams(location.search).get("auth");
  if (authFlag) {
    history.replaceState({}, "", location.pathname);
  }

  refreshMe();

  window.RaidAuth = {
    user() {
      return me.user;
    },
    loginHref() {
      return me.authConfigured ? "/api/auth/login" : "";
    },
    canPreview() {
      return Boolean(me.mockLogin);
    },
    previewLogin() {
      const btn = document.getElementById("previewLoginBtn");
      if (btn) btn.click();
    },
    async characters() {
      if (!me.user) return [];
      if (charCache) return charCache;
      if (me.offline || me.preview) {
        charCache = PREVIEW_CHARS;
        return charCache;
      }
      try {
        const data = await api("/api/me/characters");
        charCache = data.characters || [];
        if (!charCache.length && (data.needsReauth || me.preview)) charCache = PREVIEW_CHARS;
      } catch {
        charCache = me.preview || me.offline ? PREVIEW_CHARS : [];
      }
      return charCache;
    },
    onChange(fn) {
      if (typeof fn === "function") authListeners.push(fn);
    },
  };
})();
