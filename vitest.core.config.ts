/**
 * **임시 검증 설정** — core를 고칠 때만 쓴다.
 *
 * 워크트리에는 node_modules가 없어 `@majak/core`가 상위 심볼릭링크를 통해
 * **메인 체크아웃(master)** 으로 해석된다. 그래서 워크트리에서 core를 고쳐도
 * 테스트는 옛 core를 본다(CLAUDE.md의 경고). 이 설정은 그 해석을 워크트리 쪽으로
 * 돌려, core 변경을 워크트리 안에서 검증할 수 있게 한다.
 *
 *   npx vitest run --config vitest.core.config.ts
 */
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@majak\/core\/(.*)$/, replacement: `${here}packages/core/src/$1` },
      { find: /^@majak\/core$/, replacement: `${here}packages/core/src/index.ts` },
      { find: /^@majak\/content$/, replacement: `${here}packages/content/src/index.ts` },
    ],
  },
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    retry: 0,
  },
});
