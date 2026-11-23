import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts } from "./helpers.js";

const g = loadScripts(["src/settings.js", "src/core.js", "src/filter.js"]);
const F = g.VitroFilter;

test("parseViews 解析中文/英文单位", () => {
  assert.equal(F.parseViews("2.3万次观看"), 23000);
  assert.equal(F.parseViews("1.2亿次观看"), 120000000);
  assert.equal(F.parseViews("3456次观看"), 3456);
  assert.equal(F.parseViews("12K views"), 12000);
  assert.equal(F.parseViews("1.5M views"), 1500000);
  assert.equal(F.parseViews("3,456"), 3456);
});

test("parseViews 非法输入返回 NaN", () => {
  assert.ok(Number.isNaN(F.parseViews("")));
  assert.ok(Number.isNaN(F.parseViews(null)));
  assert.ok(Number.isNaN(F.parseViews("abc")));
});

test("parseDuration 解析多种格式", () => {
  assert.equal(F.parseDuration("0:59"), 59);
  assert.equal(F.parseDuration("12:34"), 754);
  assert.equal(F.parseDuration("1:02:03"), 3723);
  assert.ok(Number.isNaN(F.parseDuration("")));
});

test("reason 按关键词/频道/播放量/时长匹配", () => {
  const rules = F.merge({ enabled: true, keywords: ["恰饭", "广告"], channels: ["某UP"], minViews: 1000, maxDurMin: 30 });
  const info = (o) => ({ title: "", channel: "", views: NaN, dur: NaN, ...o });
  assert.equal(F.reason(info({ title: "这是一个恰饭视频" }), rules), "关键词「恰饭」");
  assert.equal(F.reason(info({ channel: "某UP主频道" }), rules), "频道「某UP」");
  assert.equal(F.reason(info({ views: 500 }), rules), "播放量 < 1000");
  assert.equal(F.reason(info({ dur: 4000 }), rules), "时长 > 30 分");
  assert.equal(F.reason(info({ title: "正常视频", views: 5000, dur: 600 }), rules), null);
});

test("merge 兜底默认值与类型清洗", () => {
  const m = F.merge({ enabled: false, keywords: ["a", " ", 123], minViews: "bad" });
  assert.equal(m.enabled, false);
  assert.deepEqual(m.keywords, ["a", "123"]);
  assert.equal(m.minViews, 0);
});
