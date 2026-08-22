/**
 * 확정 2 재현: 에러 바운더리의 «처음부터»(clearAllStorage)가 `majak.tutorialDone` 을
 * 지우지 않는다 — storage.ts 의 STORAGE_KEYS 에 그 키가 없다.
 *
 * 기존 회귀 가드(bootAndCrashGuards.test.ts «전체 지우기가 실제로 쓰는 키를 전부 덮는다»)는
 * **App.tsx 와 uiScale.ts 의 문자열 리터럴만** 훑는다. 이 키는 tutorial.ts 에 상수로 있고
 * App.tsx 는 `TUTORIAL_KEY` 로만 부르므로 그 스캔에 안 잡힌다 = 가드의 사각지대.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../../packages/client/src");

// 소스 전체(테스트가 훑지 않는 파일 포함)에서 majak.* 키를 모은다
const used = new Set<string>();
for (const f of readdirSync(SRC)) {
  if (!/\.(ts|tsx)$/.test(f)) continue;
  const s = readFileSync(join(SRC, f), "utf8");
  for (const m of s.matchAll(/"(majak\.[a-zA-Z]+)"/g)) used.add(`${m[1]}\t${f}`);
}

const storage = readFileSync(join(SRC, "storage.ts"), "utf8");
const block = /export const STORAGE_KEYS = \[([\s\S]*?)\] as const;/.exec(storage)?.[1] ?? "";
const known = new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string));

const IGNORE = new Set(["majak.uiScale", "majak.__probe", "majak.__test"]);
const missing = [...used]
  .map((s) => s.split("\t") as [string, string])
  .filter(([k]) => !known.has(k) && !IGNORE.has(k));

console.log("STORAGE_KEYS :", [...known].join(", "));
console.log("빠진 키      :", missing.map(([k, f]) => `${k}  (${f})`).join("\n               ") || "(없음)");

// 그 키가 실제로 무엇을 잠그는가 — App.tsx 의 신규 가입자 튜토리얼 분기
const app = readFileSync(join(SRC, "App.tsx"), "utf8");
console.log("\n가입 직후 튜토리얼 분기가 이 값을 본다:");
console.log(
  app
    .split("\n")
    .map((l, i) => [i + 1, l] as const)
    .filter(([, l]) => /tutorialDone\.current/.test(l))
    .map(([n, l]) => `  App.tsx:${n}${l.trim() === "" ? "" : `  ${l.trim()}`}`)
    .join("\n"),
);
console.log(missing.length > 0 ? "\n→ 확정: «처음부터»가 처음부터가 아니다" : "\n→ 재현 실패");
