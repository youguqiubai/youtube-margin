import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts } from "./helpers.js";

const g = loadScripts(["src/settings.js", "src/core.js", "src/footprint.js"]);
const F = g.VitroFootprint;

test("todayKey 输出本地时区 YYYY-MM-DD", () => {
  assert.equal(F.todayKey(new Date(2026, 10, 23)), "2026-11-23");
  assert.equal(F.todayKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("level 按秒数分档", () => {
  assert.equal(F.level(0), 0);
  assert.equal(F.level(60), 1);
  assert.equal(F.level(20 * 60), 2);
  assert.equal(F.level(45 * 60), 3);
  assert.equal(F.level(90 * 60), 4);
  assert.equal(F.level(200 * 60), 5);
});

test("addSeconds 累加到本地存储并反映在 recentWeeks", async () => {
  await F.addSeconds(15);
  await F.addSeconds(20);
  const today = F.todayKey();
  const t = F.recentWeeks(1).find((w) => w.key === today);
  assert.ok(t, "最近一周应包含今天");
  assert.equal(t.secs, 35);
});

test("recentWeeks 长度与周对齐", () => {
  assert.equal(F.recentWeeks(2).length, 14);
  assert.equal(F.recentWeeks(20).length, 140);
});

test("fmtDur 格式化", () => {
  assert.equal(F.fmtDur(0), "0 分钟");
  assert.equal(F.fmtDur(30 * 60), "30 分钟");
  assert.equal(F.fmtDur(90 * 60), "1 小时 30 分");
});
