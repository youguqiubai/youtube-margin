// Carrega os scripts da extensão num contexto VM com um `chrome` falso,
// do mesmo jeito que o navegador faz (scripts clássicos que escrevem em globalThis).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const read = (p) => readFileSync(join(ROOT, p), "utf8");
export const readJSON = (p) => JSON.parse(read(p));

export function fakeChrome({ uiLanguage = "en-US", stored = undefined } = {}) {
  const syncStore = { settings: stored };
  const localStore = {};
  return {
    syncStore, localStore,
    store: syncStore, // 向后兼容旧测试（等价于原 sync store）
    i18n: { getUILanguage: () => uiLanguage },
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
    storage: {
      sync: {
        get: async (key) => ({ [key]: syncStore[key] }),
        set: async (obj) => Object.assign(syncStore, obj),
      },
      local: {
        get: async (key) => ({ [key]: localStore[key] }),
        set: async (obj) => Object.assign(localStore, obj),
      },
      onChanged: { addListener: () => {} },
    },
  };
}

// Executa os arquivos (ordem do manifest) e devolve o globalThis do contexto.
export function loadScripts(files, chromeOpts) {
  const chrome = fakeChrome(chromeOpts);
  const ctx = vm.createContext({ chrome, navigator: { language: chromeOpts?.uiLanguage || "en-US" }, console });
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

// Converte objetos/arrays do contexto VM para o realm do teste
// (assert.deepStrictEqual compara protótipos).
export const plain = (v) => JSON.parse(JSON.stringify(v));
