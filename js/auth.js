(function () {
  const box = document.getElementById("authBox");
  const cloud = document.getElementById("rosterCloud");
  const savedSel = document.getElementById("savedRosters");
  const saveBtn = document.getElementById("saveRoster");
  const loadBtn = document.getElementById("loadRoster");
  if (!box) return;

  let me = { user: null, authConfigured: false, mockLogin: false };

  function t(key) {
    const lang = document.getElementById("langBtn")?.textContent === "한글" ? "en" : "ko";
    const table = {
      ko: {
        loginBnet: "Battle.net 로그인",
        loginLocal: "로컬 테스트 로그인",
        logout: "로그아웃",
        saveOk: "공대를 D1에 저장했습니다.",
        saveNeedMembers: "저장할 전문화가 없습니다.",
        loadNeedPick: "불러올 공대를 선택하세요.",
        loadOk: "저장된 공대를 불러왔습니다.",
        pickRoster: "저장된 공대",
        saving: "저장 중...",
      },
      en: {
        loginBnet: "Log in with Battle.net",
        loginLocal: "Local test login",
        logout: "Log out",
        saveOk: "Roster saved to D1.",
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
      box.innerHTML = `<span class="auth-tag">${me.user.battletag}</span>
        <button class="ghost auth-btn" id="logoutBtn">${t("logout")}</button>`;
      box.querySelector("#logoutBtn").onclick = async () => {
        await api("/api/auth/logout", { method: "POST" });
        me.user = null;
        renderAuth();
        await loadRosterList();
      };
    } else {
      const local = me.mockLogin
        ? `<button class="ghost auth-btn" id="localLoginBtn">${t("loginLocal")}</button>`
        : "";
      const bnet = me.authConfigured
        ? `<a class="tab auth-btn" href="/api/auth/login">${t("loginBnet")}</a>`
        : "";
      box.innerHTML = `${bnet}${local}`;
      const localBtn = box.querySelector("#localLoginBtn");
      if (localBtn) {
        localBtn.onclick = async () => {
          const data = await api("/api/auth/dev-login", { method: "POST" });
          me.user = data.user;
          renderAuth();
          await loadRosterList();
        };
      }
    }
    cloud.classList.toggle("hidden", !me.user);
  }

  async function loadRosterList() {
    savedSel.innerHTML = `<option value="">${t("pickRoster")}</option>`;
    if (!me.user) return;
    try {
      const data = await api("/api/rosters");
      (data.rosters || []).forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = `${r.name} (${r.size})`;
        savedSel.appendChild(opt);
      });
    } catch {
      /* not logged in or D1 not ready */
    }
  }

  async function refreshMe() {
    try {
      me = await api("/api/me");
    } catch {
      me = { user: null, authConfigured: false, mockLogin: false };
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
})();
