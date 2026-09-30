(function () {
  const KEY = "wow-raid-theme";
  const root = document.documentElement;

  function currentLang() {
    return document.getElementById("langBtn")?.textContent === "한글" ? "en" : "ko";
  }

  function apply(theme) {
    const t = theme === "alliance" ? "alliance" : "horde";
    root.setAttribute("data-theme", t);
    try {
      localStorage.setItem(KEY, t);
    } catch (_) {}
    document.querySelectorAll("[data-theme-set]").forEach((btn) => {
      const on = btn.dataset.themeSet === t;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const crest = document.querySelector(".crest");
    if (crest) crest.textContent = "";
    const eye = document.querySelector(".eyebrow");
    if (eye) {
      eye.textContent = t === "alliance" ? "ALLIANCE HIGH COMMAND" : "HORDE WAR ROOM";
    }
    labelButtons();
  }

  function labelButtons() {
    const en = currentLang() === "en";
    const horde = document.getElementById("themeHorde");
    const alliance = document.getElementById("themeAlliance");
    if (horde) horde.textContent = en ? "Horde" : "호드";
    if (alliance) alliance.textContent = en ? "Alliance" : "얼라";
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-set]");
    if (!btn) return;
    apply(btn.dataset.themeSet);
  });

  document.addEventListener("raid:lang", labelButtons);

  const setBtn = document.getElementById("settingsBtn");
  const setPanel = document.getElementById("settingsPanel");
  setBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = setPanel?.classList.toggle("hidden") === false;
    setBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".settings-wrap")) {
      setPanel?.classList.add("hidden");
      setBtn?.setAttribute("aria-expanded", "false");
    }
  });

  apply(root.getAttribute("data-theme") || "horde");
})();
