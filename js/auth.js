(function () {
  const box = document.getElementById("authBox");
  if (!box) return;

  const PREVIEW_USER = { id: "bnet-preview", battletag: "RaidLead#1842" };
  const LOCAL_SESSION_KEY = "wow-raid-preview-session";
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
      },
      en: {
        loginBnet: "Log in with Battle.net",
        logout: "Log out",
        preview: "Preview",
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
      };
    } else {
      box.innerHTML = "";
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
  }

  document.addEventListener("raid:lang", () => {
    renderAuth();
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
    offline() {
      return Boolean(me.offline);
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
