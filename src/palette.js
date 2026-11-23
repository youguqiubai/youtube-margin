// MARGIN — 命令面板：Ctrl/Cmd+K 呼出，键盘完成跳转、开关、外观切换。
// 样式封在 Shadow DOM 内，不污染 YouTube 页面。
(() => {
  let host = null, input = null, list = null, panel = null;
  let isOpen = false, sel = 0, cmds = [], visible = [];

  async function getS() {
    const r = await chrome.storage.sync.get("settings");
    return r.settings || {};
  }
  async function setS(patch) {
    const r = await chrome.storage.sync.get("settings");
    const s = r.settings || {};
    Object.assign(s, patch);
    await chrome.storage.sync.set({ settings: s });
  }

  const NAV = [
    ["首页", "/"],
    ["订阅", "/feed/subscriptions"],
    ["观看历史", "/feed/history"],
    ["稍后观看", "/playlist?list=WL"],
    ["喜欢的视频", "/playlist?list=LL"],
  ];

  function buildCommands(S) {
    const out = [];

    NAV.forEach(([title, url]) => {
      out.push({ cat: "跳转", title, hint: url === "/" ? "主页" : "", run: () => { location.href = url; return true; } });
    });

    const toggles = [
      ["hideShorts", "隐藏 Shorts"],
      ["forceDark", "强制深色主题"],
      ["room", "影院模式（视频页背景）"],
      ["blockAds", "广告自动跳过"],
      ["footprint", "足迹记录"],
      ["cards", "卡片美化"],
      ["sidebarGlass", "侧边栏玻璃"],
    ];
    toggles.forEach(([k, title]) => {
      out.push({
        cat: "开关", title,
        hint: S[k] ? "开" : "关",
        run: async () => { await setS({ [k]: !S[k] }); return true; },
      });
    });

    // 推荐过滤是独立存储，单独处理
    out.push({
      cat: "开关", title: "推荐过滤",
      hint: "按规则",
      run: async () => {
        const r = await chrome.storage.sync.get("vtFilter");
        const f = r.vtFilter || {};
        f.enabled = f.enabled === false; // 默认视为开
        await chrome.storage.sync.set({ vtFilter: f });
        return true;
      },
    });

    // 壁纸：下一张（循环）
    out.push({
      cat: "外观", title: "下一张壁纸", hint: "循环切换",
      run: async () => {
        const walls = (globalThis.VITRO_WALLPAPERS || []).map((w) => w.id).filter((id) => id !== "custom");
        const cur = S.wallpaper;
        const i = walls.indexOf(cur);
        const next = walls[(i + 1 + walls.length) % walls.length] || cur;
        await setS({ wallpaper: next, wallMode: "fixed" });
        return true;
      },
    });
    out.push({
      cat: "外观", title: "切换玻璃风格", hint: "glass/frost/solid",
      run: async () => {
        const seq = ["glass", "frost", "solid"];
        const i = seq.indexOf(S.glassStyle);
        await setS({ glassStyle: seq[(i + 1) % seq.length] });
        return true;
      },
    });

    out.push({
      cat: "操作", title: "打开 Vitro 设置", hint: "编辑器",
      run: () => { chrome.runtime.sendMessage({ type: "vt-open-editor" }).catch(() => {}); return true; },
    });

    return out;
  }

  function build() {
    host = document.createElement("div");
    host.setAttribute("id", "vt-palette-host");
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `
      <style>
        :host{all:initial}
        .mask{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.32);
          backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
          display:flex;align-items:flex-start;justify-content:center;padding-top:13vh}
        .panel{width:min(620px,92vw);background:rgba(30,30,32,.94);
          backdrop-filter:blur(22px) saturate(1.4);-webkit-backdrop-filter:blur(22px) saturate(1.4);
          border:1px solid rgba(255,255,255,.13);border-radius:16px;overflow:hidden;
          box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        input{box-sizing:border-box;width:100%;padding:15px 18px;font-size:15px;color:#eee;
          background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.1);outline:none}
        input::placeholder{color:#777}
        .list{max-height:46vh;overflow-y:auto;padding:8px;scrollbar-width:thin}
        .cat{padding:10px 12px 5px;font-size:11px;color:#888;letter-spacing:.08em}
        .item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;
          color:#d5d5d8;font-size:13.5px;cursor:pointer;line-height:1.3}
        .item.sel{background:rgba(255,255,255,.14);color:#fff}
        .item .hint{margin-left:auto;font-size:11px;color:#8a8a8e;white-space:nowrap}
        .empty{padding:22px;text-align:center;color:#888;font-size:13px}
      </style>
      <div class="mask">
        <div class="panel">
          <input placeholder="输入命令…（↑↓ 选择，回车执行，Esc 关闭）" spellcheck="false">
          <div class="list"></div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    panel = sh.querySelector(".panel");
    input = sh.querySelector("input");
    list = sh.querySelector(".list");

    input.addEventListener("input", () => { sel = 0; render(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, visible.length - 1); render(); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); return; }
      if (e.key === "Enter") { e.preventDefault(); const c = visible[sel]; if (c) runCmd(c); }
    });

    host.querySelector(".mask").addEventListener("mousedown", (e) => {
      if (e.target === host.querySelector(".mask")) close();
    });
  }

  function render() {
    if (!list) return;
    const q = input.value.trim().toLowerCase();
    visible = cmds.filter((c) => !q || c.title.toLowerCase().includes(q));
    if (sel >= visible.length) sel = Math.max(0, visible.length - 1);

    let html = "";
    let lastCat = "";
    visible.forEach((c, i) => {
      if (c.cat !== lastCat) { html += '<div class="cat">' + c.cat + "</div>"; lastCat = c.cat; }
      html += '<div class="item' + (i === sel ? " sel" : "") + '" data-i="' + i + '">'
        + "<span>" + c.title + "</span>"
        + (c.hint ? '<span class="hint">' + c.hint + "</span>" : "")
        + "</div>";
    });
    list.innerHTML = html || '<div class="empty">没有匹配的命令</div>';

    list.querySelectorAll(".item").forEach((el) => {
      el.onclick = () => { const c = visible[+el.dataset.i]; if (c) runCmd(c); };
      el.onmousemove = () => { sel = +el.dataset.i; render(); };
    });
  }

  async function runCmd(c) {
    const keep = await c.run();
    if (keep !== true) close();
    else {
      // 开关类：重新加载命令，刷新状态后保持面板
      cmds = buildCommands(await getS());
      render();
    }
  }

  async function open() {
    if (!host) build();
    isOpen = true;
    host.style.display = "block";
    cmds = buildCommands(await getS());
    input.value = "";
    sel = 0;
    render();
    setTimeout(() => input.focus(), 10);
  }

  function close() {
    isOpen = false;
    if (host) host.style.display = "none";
  }

  function toggle() { isOpen ? close() : open(); }

  // 全局快捷键：Ctrl/Cmd+K
  if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  }, true);
  }

  globalThis.VitroPalette = { open, close, toggle, buildCommands, getS, setS };
})();
