// MARGIN — 推荐过滤：按关键词 / 频道 / 播放量 / 时长，隐藏推荐流里不合规的视频卡片
// 只改展示，不碰播放器、不拦广告（避免触发 YouTube 反制）。
(() => {
  const FILTER_DEFAULTS = {
    enabled: true,
    keywords: [],   // 标题含任一关键词 → 隐藏
    channels: [],   // 频道名含任一关键词 → 隐藏
    minViews: 0,    // 播放量低于此值 → 隐藏（0 = 不过滤）
    maxDurMin: 0,   // 时长超过此分钟 → 隐藏（0 = 不过滤，主要用于过滤几小时的长视频/直播回放）
    showReason: true, // 隐藏的卡片把原因写进 data-vt-reason，方便排查
  };

  function merge(saved) {
    const D = FILTER_DEFAULTS;
    const out = { ...D, keywords: [], channels: [] };
    if (saved && typeof saved === "object") {
      if (typeof saved.enabled === "boolean") out.enabled = saved.enabled;
      if (typeof saved.showReason === "boolean") out.showReason = saved.showReason;
      if (typeof saved.minViews === "number" && Number.isFinite(saved.minViews)) out.minViews = saved.minViews;
      if (typeof saved.maxDurMin === "number" && Number.isFinite(saved.maxDurMin)) out.maxDurMin = saved.maxDurMin;
      if (Array.isArray(saved.keywords)) out.keywords = saved.keywords.map(String).filter((s) => s.trim());
      if (Array.isArray(saved.channels)) out.channels = saved.channels.map(String).filter((s) => s.trim());
    }
    return out;
  }

  // 解析播放量文本："2.3万次观看" / "1.2亿" / "3456次观看" / "1.5M views" / "12K"
  function parseViews(text) {
    if (!text) return NaN;
    const m = /([\d.,]+)\s*([万亿kKmMbB]?)/.exec(String(text));
    if (!m) return NaN;
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(num)) return NaN;
    switch ((m[2] || "").toLowerCase()) {
      case "万": case "w": return num * 1e4;
      case "亿": return num * 1e8;
      case "k": return num * 1e3;
      case "m": return num * 1e6;
      case "b": return num * 1e9;
      default: return num;
    }
  }

  // 解析时长 "0:59" / "12:34" / "1:02:03" → 秒
  function parseDuration(text) {
    if (!text) return NaN;
    const parts = String(text).trim().split(":").map((x) => parseInt(x, 10));
    if (!parts.length || parts.some((n) => isNaN(n))) return NaN;
    let s = 0;
    for (const p of parts) s = s * 60 + p;
    return s;
  }

  // 从一张卡片里取标题 / 频道 / 播放量 / 时长
  function inspect(card) {
    const titleEl = card.querySelector("#video-title");
    const title = titleEl ? (titleEl.getAttribute("title") || titleEl.textContent || "") : "";
    const chEl = card.querySelector("ytd-channel-name yt-formatted-string, ytd-channel-name #text");
    const channel = chEl ? chEl.textContent : "";
    const metaLine = card.querySelector("#metadata-line");
    const viewsText = metaLine && metaLine.firstElementChild ? metaLine.firstElementChild.textContent : "";
    const durEl = card.querySelector("ytd-thumbnail-overlay-time-status-renderer, .ytd-thumbnail-overlay-time-status-renderer");
    const durText = durEl ? durEl.textContent : "";
    return {
      title: (title || "").trim(),
      channel: (channel || "").trim(),
      views: parseViews(viewsText),
      dur: parseDuration(durText),
    };
  }

  // 命中哪条规则（返回原因字符串；不命中返回 null）
  function reason(info, rules) {
    if (!rules.enabled) return null;
    for (const kw of rules.keywords) {
      if (kw && info.title && info.title.toLowerCase().includes(kw.toLowerCase())) return "关键词「" + kw + "」";
    }
    for (const ch of rules.channels) {
      if (ch && info.channel && info.channel.toLowerCase().includes(ch.toLowerCase())) return "频道「" + ch + "」";
    }
    if (rules.minViews > 0 && !isNaN(info.views) && info.views < rules.minViews) return "播放量 < " + rules.minViews;
    if (rules.maxDurMin > 0 && !isNaN(info.dur) && info.dur > rules.maxDurMin * 60) return "时长 > " + rules.maxDurMin + " 分";
    return null;
  }

  // 扫一遍当前页面所有卡片，命中规则就隐藏
  function scan(rules) {
    const cards = document.querySelectorAll("ytd-rich-item-renderer, ytd-video-renderer");
    let n = 0;
    cards.forEach((card) => {
      if (card.__vtInspected) return;
      card.__vtInspected = true;
      const info = inspect(card);
      const r = reason(info, rules);
      if (r) {
        card.classList.add("vt-filtered");
        if (rules.showReason) card.setAttribute("data-vt-reason", r);
        n++;
      }
    });
    return n;
  }

  let observer = null;
  let raf = null;

  function start(rules) {
    stop();
    if (!rules.enabled) return;
    const loop = () => { raf = null; scan(rules); };
    observer = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(loop); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan(rules);
  }

  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  // 规则变化时清掉旧标记，重新扫
  function reset() {
    document.querySelectorAll(".vt-filtered").forEach((c) => {
      c.classList.remove("vt-filtered");
      c.removeAttribute("data-vt-reason");
      delete c.__vtInspected;
    });
  }

  let currentRules = null;
  let activePage = "other";

  async function loadRules(force) {
    if (currentRules && !force) return currentRules;
    const got = await chrome.storage.sync.get("vtFilter");
    currentRules = merge(got.vtFilter);
    return currentRules;
  }

  // content.js 在每次 route 时调用；模块内部自管理观察者与规则缓存
  async function route(page, force) {
    activePage = page || activePage;
    const isFeed = activePage === "home" || activePage === "results";
    if (!isFeed) { stop(); return; }
    const rules = await loadRules(force);
    reset();
    start(rules);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.vtFilter) {
      currentRules = merge(changes.vtFilter.newValue);
      route(activePage, true);
    }
  });

  globalThis.VitroFilter = { FILTER_DEFAULTS, merge, parseViews, parseDuration, inspect, reason, scan, start, stop, reset, route };
})();
