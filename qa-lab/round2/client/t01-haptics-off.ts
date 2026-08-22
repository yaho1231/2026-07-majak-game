/**
 * 확정 1 재현: 설정에서 «진동»을 **끄면** 그 세션 동안 진동이 계속 울린다.
 *
 * App.tsx 의 배선은 두 곳뿐이다.
 *   ① updateSetting()  — `key==="haptics" && value===true` 일 때만 setHapticsEnabled(true)
 *   ② useEffect(...)   — setHapticsEnabled(settings.haptics && hapticsSupported())
 *                        …인데 **의존성이 `[settings.sfxOn]`** 이다.
 * 그래서 haptics 를 false 로 바꿔도 ②가 다시 돌지 않고 ①에는 false 경로가 없다.
 *
 * 이 스크립트는 (a) 소스에서 그 두 사실을 직접 확인하고 (b) 실제 haptics 모듈로
 * 같은 순서를 재생해 «껐는데 울린다»를 관측한다.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../../../packages/client/src/App.tsx"), "utf8");

// ── (a) 소스 확인 ───────────────────────────────────────────────
const stripped = APP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const hasFalsePath = /setHapticsEnabled\(\s*false\s*\)/.test(stripped);
const effect = /setHapticsEnabled\(settings\.haptics && hapticsSupported\(\)\);\s*\}\s*,\s*\[([^\]]*)\]/.exec(
  stripped,
);
console.log("(a) updateSetting 에 setHapticsEnabled(false) 경로가 있는가 :", hasFalsePath);
console.log("(a) 동기화 이펙트의 의존성                                :", effect?.[1]?.trim() ?? "(못 찾음)");
const depsOk = effect !== null && /settings\.haptics/.test(effect[1] ?? "");
console.log("(a) 의존성에 settings.haptics 가 들어 있는가              :", depsOk);

// ── (b) 실제 모듈로 재생 ────────────────────────────────────────
const calls: unknown[] = [];
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    vibrate: (p: unknown) => {
      calls.push(p);
      return true;
    },
  },
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { matchMedia: (q: string) => ({ matches: q.includes("pointer: coarse") }) },
});

const { haptics, setHapticsEnabled } = (await import(
  "../../../packages/client/src/haptics.js"
)) as typeof import("../../../packages/client/src/haptics.js");

// 폰에서 앱을 켠 상태: 설정 haptics=true → 마운트 이펙트가 한 번 켠다
setHapticsEnabled(true);
haptics.discard();
console.log("(b) 켜져 있을 때 타패 진동 횟수 :", calls.length, "(기대 1)");

// 사용자가 설정에서 «진동»을 끈다 → App 은 아무 것도 호출하지 않는다(위 (a)).
calls.length = 0;
haptics.discard();
haptics.declare();
haptics.win();
console.log("(b) 끈 뒤 진동 횟수             :", calls.length, "(기대 0)");
console.log(calls.length > 0 ? "→ 확정: 껐는데 계속 울린다" : "→ 재현 실패");
