// MARGIN — 本地足迹热力图：按天累计 YouTube 观看时长，只在浏览器本地保存。
// 采样而非精确计时：每 15 秒在 watch 页播放中记一次，误差可接受、零侵入。
(() => {
  const KEY = "vtFootprint";
  const TICK = 15; // 秒
  const DAY_MS = 86400000;

  // 本地时区的 "YYYY-MM-DD"
  function todayKey(d) {
    const x = d || new Date();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  let data = null;

  async function load() {
    if (data) return data;
    const got = await chrome.storage.local.get(KEY);
    data = got[KEY] || { days: {} };
    if (!data.days) data.days = {};
    return data;
  }

  async function save() {
    if (data) await chrome.storage.local.set({ [KEY]: data });
  }

  async function addSeconds(n) {
    const d = await load();
    const k = todayKey();
    d.days[k] = (d.days[k] || 0) + n;
    await save();
    return d.days[k];
  }

  // 最近 weeks 周（含今天），左闭右闭，供热力图渲染
  function recentWeeks(weeks) {
    const d = data || { days: {} };
    const out = [];
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY_MS);
    for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
      const dd = new Date(t);
      const k = todayKey(dd);
      out.push({ key: k, secs: d.days[k] || 0, dow: dd.getDay(), date: dd });
    }
    return out;
  }

  // 秒 → 颜色档位 0..5（GitHub 风格五档 + 空）
  function level(secs) {
    if (!secs || secs <= 0) return 0;
    if (secs < 15 * 60) return 1;
    if (secs < 30 * 60) return 2;
    if (secs < 60 * 60) return 3;
    if (secs < 120 * 60) return 4;
    return 5;
  }

  function fmtDur(secs) {
    if (!secs) return "0 分钟";
    const m = Math.round(secs / 60);
    if (m < 60) return m + " 分钟";
    const h = Math.floor(m / 60);
    return h + " 小时 " + (m % 60) + " 分";
  }

  // 今天 / 本周累计，供摘要展示
  function summary() {
    const d = data || { days: {} };
    const today = d.days[todayKey()] || 0;
    let week = 0;
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dow === 0 ? 6 : dow - 1));
    for (let t = monday.getTime(); t <= now.getTime(); t += DAY_MS) {
      week += d.days[todayKey(new Date(t))] || 0;
    }
    return { today, week, fmtToday: fmtDur(today), fmtWeek: fmtDur(week) };
  }

  async function clear() {
    data = { days: {} };
    await chrome.storage.local.set({ [KEY]: data });
  }

  // ---- 采样跟踪 ----
  let timer = null;
  function startTracking() {
    stopTracking();
    timer = setInterval(() => {
      const v = document.querySelector("#movie_player video");
      if (v && !v.paused && !v.ended && v.readyState >= 2) {
        addSeconds(TICK).catch(() => {});
      }
    }, TICK * 1000);
  }
  function stopTracking() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  globalThis.VitroFootprint = { KEY, todayKey, load, addSeconds, recentWeeks, level, fmtDur, summary, clear, startTracking, stopTracking };
})();
