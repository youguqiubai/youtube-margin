import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts } from "./helpers.js";

const g = loadScripts(["src/settings.js", "src/core.js", "src/palette.js"]);
const P = g.VitroPalette;

test("buildCommands 生成完整的命令分组", () => {
  const cmds = P.buildCommands({ hideShorts: true, forceDark: false, room: true, blockAds: false, footprint: true, cards: true, sidebarGlass: true });
  const cats = [...new Set(cmds.map((c) => c.cat))];
  assert.deepEqual(cats, ["跳转", "开关", "外观", "操作"]);
  assert.equal(cmds.filter((c) => c.cat === "跳转").length, 5);
  assert.equal(cmds.filter((c) => c.cat === "开关").length, 8);
  assert.equal(cmds.filter((c) => c.cat === "外观").length, 2);
  assert.equal(cmds.filter((c) => c.cat === "操作").length, 1);
});

test("开关命令的 hint 反映当前状态", () => {
  const cmds = P.buildCommands({ hideShorts: true, forceDark: false });
  const shorts = cmds.find((c) => c.title === "隐藏 Shorts");
  const dark = cmds.find((c) => c.title === "强制深色主题");
  assert.equal(shorts.hint, "开");
  assert.equal(dark.hint, "关");
});
