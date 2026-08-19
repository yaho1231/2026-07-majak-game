/**
 * 정적 스캔 — "국당 N회"를 약속하는 증강이 국 경계에서 리셋되지 않는 키를 쓰는가,
 * 반대로 "게임당 1회"인데 국 스코프 키를 쓰는가.
 * 확정이 아니라 **후보 추림**용. 후보는 실제 판으로 확인한다.
 */
import { readFileSync, readdirSync } from "node:fs";
import { ALL_AUGMENTS } from "./lib.js";

const dir = "packages/content/src/augments";
const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
const src = new Map<string, string>();
for (const f of files) src.set(f.replace(/\.ts$/, ""), readFileSync(`${dir}/${f}`, "utf8"));

const perRound = /국당|매 ?국|국마다|한 국에|이번 국|국 1회|국에 1회|국에 한 번/;
const perGame = /게임당|게임 내 1회|게임당 1회|게임에 1회|게임 전체/;

const rows: string[] = [];
for (const def of ALL_AUGMENTS) {
  const text = `${def.description ?? ""} ${def.detail ?? ""}`;
  const body = src.get(def.id);
  if (body === undefined) continue;
  // 키 리터럴 추출
  const keys = [...body.matchAll(/`([^`]*\$\{[^`]*)`/g)].map((m) => m[1]!);
  const stateKeys = keys.filter((k) => /\$\{ID\}|:/.test(k) && !k.includes("<"));
  const usesRoundKey = (k: string): boolean =>
    /roundKey|ROUND_SCOPED|#round|roundSeq|rk\b/.test(k);
  const fixed = stateKeys.filter((k) => !usesRoundKey(k) && !k.startsWith("view:"));
  const roundish = stateKeys.filter(usesRoundKey);
  const claimsRound = perRound.test(text);
  const claimsGame = perGame.test(text);
  if (claimsRound && roundish.length === 0 && fixed.length > 0) {
    rows.push(`PER_ROUND_BUT_FIXED_KEYS  ${def.id}  keys=${fixed.slice(0, 4).join(" | ")}`);
  }
  if (claimsGame && !claimsRound && roundish.length > 0 && fixed.length === 0) {
    rows.push(`PER_GAME_BUT_ROUND_KEYS   ${def.id}  keys=${roundish.slice(0, 4).join(" | ")}`);
  }
}
console.log(rows.join("\n"));
console.log(`\n${rows.length} 후보`);
