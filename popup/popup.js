(async () => {
  const t = (k) => globalThis.vitroT(k);
  let S = await globalThis.vitroLoad();

  const switches = document.querySelectorAll(".switch[data-key]");
  const langSelect = document.getElementById("language");
  const edit = document.getElementById("edit");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onYouTube = !tab?.url || /^https:\/\/www\.youtube\.com\//.test(tab.url);

  function translate() {
    document.documentElement.lang = globalThis.vitroSetLang(S.language) === "pt" ? "pt-BR" : "en";
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    if (!onYouTube) edit.textContent = t("popup.openYouTube");
  }

  function render() {
    switches.forEach((b) => b.setAttribute("aria-checked", String(!!S[b.dataset.key])));
    langSelect.value = S.language;
    translate();
  }

  document.getElementById("version").textContent = "v" + chrome.runtime.getManifest().version;
  edit.disabled = !onYouTube;
  render();

  switches.forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      S[b.dataset.key] = !S[b.dataset.key];
      render();
      globalThis.vitroSave(S);
    })
  );

  langSelect.addEventListener("change", () => {
    S.language = langSelect.value;
    render();
    globalThis.vitroSave(S);
  });

  edit.addEventListener("click", async () => {
    await chrome.tabs.sendMessage(tab.id, { type: "vt-open-editor" }).catch(() => {});
    window.close();
  });

  // ---- MARGIN：推荐过滤 ----
  const FP = globalThis.VitroFootprint;
  let F = { enabled: true, keywords: [], channels: [], minViews: 0, maxDurMin: 0 };
  const fOn = document.getElementById("filter-on");
  const fKw = document.getElementById("f-keywords");
  const fCh = document.getElementById("f-channels");
  const fViews = document.getElementById("f-minviews");
  const fDur = document.getElementById("f-maxdur");

  const parseList = (str) => String(str || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  function renderFilter() {
    fOn.setAttribute("aria-checked", String(!!F.enabled));
    fKw.value = (F.keywords || []).join(", ");
    fCh.value = (F.channels || []).join(", ");
    fViews.value = F.minViews || "";
    fDur.value = F.maxDurMin || "";
  }
  const saveFilter = () => chrome.storage.sync.set({ vtFilter: F });

  (async () => {
    const r = await chrome.storage.sync.get("vtFilter");
    const raw = r.vtFilter || {};
    F = {
      enabled: raw.enabled !== false,
      keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
      channels: Array.isArray(raw.channels) ? raw.channels : [],
      minViews: raw.minViews || 0,
      maxDurMin: raw.maxDurMin || 0,
    };
    renderFilter();
  })();

  fOn.addEventListener("click", () => { F.enabled = !F.enabled; renderFilter(); saveFilter(); });
  fKw.addEventListener("change", () => { F.keywords = parseList(fKw.value); saveFilter(); });
  fCh.addEventListener("change", () => { F.channels = parseList(fCh.value); saveFilter(); });
  fViews.addEventListener("change", () => { F.minViews = Math.max(0, +fViews.value || 0); saveFilter(); });
  fDur.addEventListener("change", () => { F.maxDurMin = Math.max(0, +fDur.value || 0); saveFilter(); });

  // ---- MARGIN：足迹热力图 ----
  const heatKey = (d) => FP.todayKey(d);
  const DAY = 86400000;
  async function renderHeat() {
    const r = await chrome.storage.local.get("vtFootprint");
    const days = (r.vtFootprint && r.vtFootprint.days) || {};
    const now = new Date();
    const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()));
    const cells = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(sat.getTime() - i * DAY);
      const k = heatKey(d);
      cells.push({ k, secs: days[k] || 0 });
    }
    document.getElementById("heat").innerHTML = cells
      .map((c) => `<span class="l${FP.level(c.secs)}" title="${c.k} · ${FP.fmtDur(c.secs)}"></span>`)
      .join("");

    const todaySecs = days[heatKey(now)] || 0;
    let weekSecs = 0;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    for (let t = monday.getTime(); t <= now.getTime(); t += DAY) weekSecs += days[heatKey(new Date(t))] || 0;
    document.getElementById("heat-sum").textContent = "今天 " + FP.fmtDur(todaySecs) + " · 本周 " + FP.fmtDur(weekSecs);
  }
  renderHeat();

  document.getElementById("heat-clear").addEventListener("click", async () => {
    await chrome.storage.local.set({ vtFootprint: { days: {} } });
    renderHeat();
  });

  document.getElementById("reset").addEventListener("click", async () => {
    S = { ...globalThis.VITRO_DEFAULTS };
    await globalThis.vitroSave(S);
    render();
  });
})();
