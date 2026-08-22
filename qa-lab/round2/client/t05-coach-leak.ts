/**
 * 확정 4 재현: 튜토리얼 코치가 **판을 나가도 꺼지지 않는다**(coachOn 누수).
 * 그 뒤 들어간 **실전 판**에 코치가 처음부터 다시 붙고, 강의의 손패 잠금이
 * 실제 대국의 타패를 막는다.
 *
 * ① coachOn 을 끄는 곳은 코치 자신의 onFinish 와 홈의 «연습 대국(안내 없음)» 뿐이다.
 *    returnHome / resetGameState / logout / gameAborted / kicked 는 건드리지 않는다.
 * ② 코치 마운트 조건은 `coachOn && inGame && !intro && !isSpectator` — **방 종류를 안 본다.**
 * ③ tutorial.ts 의 강의 중 넷이 `lock` 을 걸고, `how:"augment"` 잠금은
 *    coachBlocksDiscard 가 **모든 패의 버리기를 막는다**.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../../packages/client/src");
const APP = readFileSync(join(SRC, "App.tsx"), "utf8");
const TUT = readFileSync(join(SRC, "tutorial.ts"), "utf8");
const AL = APP.split("\n");

console.log("① startCoach / setCoachOn 호출 지점");
for (const [i, l] of AL.entries()) {
  if (/startCoach\(|setCoachOn\(/.test(l)) console.log(`  App.tsx:${i + 1}  ${l.trim()}`);
}
for (const fn of ["function returnHome", "function resetGameState", "function logout"]) {
  const a = APP.indexOf(fn);
  console.log(`  ${fn} 이 코치를 끄는가 :`, /startCoach\(false\)|setCoachOn\(false\)/.test(APP.slice(a, a + 2000)));
}

console.log("\n② 코치 마운트 조건");
for (const [i, l] of AL.entries()) {
  if (/coachOn && inGame/.test(l)) console.log(`  App.tsx:${i + 1}  ${l.trim()}`);
}
console.log("  조건에 «튜토리얼 방인가»가 들어 있는가 :", /coachOn && inGame[^\n]*tutorial/i.test(APP));

console.log("\n③ 잠금을 거는 강의와 그 성립 조건 (방 종류 조건 없음)");
const lines = TUT.split("\n");
lines.forEach((l, i) => {
  if (!/^\s*lock: \{/.test(l)) return;
  // 이 강의의 id / when 을 앞뒤에서 찾는다
  let id = "?";
  for (let j = i; j > i - 40 && j >= 0; j--) {
    const m = /^\s*id: "([^"]+)"/.exec(lines[j] ?? "");
    if (m) { id = m[1] as string; break; }
  }
  const when = lines.slice(i, i + 12).find((x) => /^\s*when:/.test(x)) ?? "(when 못 찾음)";
  console.log(`  tutorial.ts:${i + 1}  [${id}] ${l.trim()}`);
  console.log(`      ${when.trim()}`);
});

const cbd = APP.indexOf("function coachBlocksDiscard");
console.log("\n  coachBlocksDiscard 본문:");
console.log(APP.slice(cbd, APP.indexOf("}", APP.indexOf("return lock.how", cbd)) + 1).split("\n").map((l) => `    ${l}`).join("\n"));
