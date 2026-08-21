/**
 * **후리텐 리치의 빈도** — 선언패 자신이 대기에 든 리치를 봇이 얼마나 자주 거는가.
 * 엔진 없이 뷰만 세워 세므로 빠르고 결정적이다.
 *
 *   tsx qa-lab/round2/bot/riichi_furiten_scan.ts [hands] [seed]
 */
import { botScene } from "../../../packages/server/test/botTestView.js";
import { buildRead } from "../../../packages/server/src/bot/read.js";
import { chooseRiichi } from "../../../packages/server/src/bot/discard.js";
import { profileOf } from "../../../packages/server/src/bot/profile.js";
import type { ArchetypeName } from "../../../packages/server/src/bot/profile.js";
import { kindKey, winningKinds, shantenOf, standardKinds } from "@majak/core";
import type { TileKind } from "@majak/core";

const HANDS = Number(process.argv[2] ?? 400);
const SEED = Number(process.argv[3] ?? 4242);
const ARCH: ArchetypeName[] = ["balanced", "attacker", "defender", "speedster", "valueHunter", "wildcard"];

let st = SEED >>> 0;
const rnd = (): number => {
  st = (Math.imul(st ^ (st >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
  return st / 0x1_0000_0000;
};
const KINDS = standardKinds();
const SUIT_CH: Record<string, string> = { man: "m", pin: "p", sou: "s" };
function spec(kinds: readonly TileKind[]): string {
  return kinds
    .map((k) =>
      k.suit === "wind" ? `${k.rank}z` : k.suit === "dragon" ? `${k.rank + 4}z` : `${k.rank}${SUIT_CH[k.suit]}`,
    )
    .join("");
}

/**
 * **텐파이 근처의** 무작위 14장. 완전 무작위 14장은 4000손 중 6손만 텐파이라
 * 표본이 안 쌓인다 — 완성형(4멘쯔+머리)을 만든 뒤 한 장을 무작위로 바꿔치기한다.
 */
function nearTenpaiHand(): TileKind[] | null {
  const used = new Map<string, number>();
  const take = (k: TileKind): boolean => {
    const key = kindKey(k);
    const n = used.get(key) ?? 0;
    if (n >= 4) return false;
    used.set(key, n + 1);
    return true;
  };
  const out: TileKind[] = [];
  for (let b = 0; b < 4; b++) {
    let ok = false;
    for (let tries = 0; tries < 40 && !ok; tries++) {
      const k = KINDS[Math.floor(rnd() * KINDS.length)]!;
      const isNum = k.suit === "man" || k.suit === "pin" || k.suit === "sou";
      if (isNum && rnd() < 0.65 && k.rank <= 7) {
        const run = [k, { suit: k.suit, rank: k.rank + 1 }, { suit: k.suit, rank: k.rank + 2 }];
        if (run.every((x) => (used.get(kindKey(x)) ?? 0) < 4)) {
          for (const x of run) take(x);
          out.push(...run);
          ok = true;
        }
      } else if ((used.get(kindKey(k)) ?? 0) === 0) {
        for (let i = 0; i < 3; i++) take(k);
        out.push(k, k, k);
        ok = true;
      }
    }
    if (!ok) return null;
  }
  // 머리
  for (let tries = 0; ; tries++) {
    if (tries > 40) return null;
    const k = KINDS[Math.floor(rnd() * KINDS.length)]!;
    if ((used.get(kindKey(k)) ?? 0) <= 2) {
      take(k);
      take(k);
      out.push(k, k);
      break;
    }
  }
  // 한 장을 무작위 패로 바꿔치기 → 대개 텐파이 또는 1샹텐
  const idx = Math.floor(rnd() * out.length);
  for (let tries = 0; tries < 40; tries++) {
    const k = KINDS[Math.floor(rnd() * KINDS.length)]!;
    const cur = out[idx]!;
    used.set(kindKey(cur), (used.get(kindKey(cur)) ?? 1) - 1);
    if ((used.get(kindKey(k)) ?? 0) < 4) {
      used.set(kindKey(k), (used.get(kindKey(k)) ?? 0) + 1);
      out[idx] = k;
      break;
    }
    used.set(kindKey(cur), (used.get(kindKey(cur)) ?? 0) + 1);
  }
  return out;
}


const declared = new Map<ArchetypeName, number>();
const furiten = new Map<ArchetypeName, number>();
for (const a of ARCH) { declared.set(a, 0); furiten.set(a, 0); }
let scenes = 0;
const samples: string[] = [];

for (let i = 0; i < HANDS; i++) {
  const hand = nearTenpaiHand();
  if (hand === null) continue;
  const sc = botScene({
    hand: spec(hand),
    turnCount: 6,
    wallLeft: 50,
    discards: { p1: "1z2z3z", p2: "1z2z3z", p3: "1z2z3z" },
  });
  const read = buildRead(sc.view, "p0", { mode: "hanchan" });
  const options = sc.riichiOptions();
  let any = false;
  for (const a of ARCH) {
    const opt = chooseRiichi(read, options, profileOf(a), null);
    const id = (opt?.payload as { tileId: number } | undefined)?.tileId;
    if (id === undefined) continue;
    any = true;
    declared.set(a, (declared.get(a) ?? 0) + 1);
    const key = kindKey(sc.view.tiles[id]!.kind);
    const rest = [...read.hand];
    rest.splice(rest.findIndex((x) => kindKey(x) === key), 1);
    if (shantenOf(rest, 0, read.opts) !== 0) continue;
    const w = winningKinds(rest, 0, undefined, read.opts).map(kindKey);
    if (w.includes(key)) {
      furiten.set(a, (furiten.get(a) ?? 0) + 1);
      if (a === "balanced" && samples.length < 6) {
        samples.push(`손 ${spec(hand)} → ${key}로 리치 · 대기[${w.join(",")}] ← 선언 즉시 후리텐`);
      }
    }
  }
  if (any) scenes++;
}

console.log(`텐파이 근처 손 ${HANDS} · 리치 선언이 나온 장면 ${scenes}`);
console.log("원형          리치 선언   그중 후리텐 리치");
for (const a of ARCH) {
  const d = declared.get(a) ?? 0;
  const f = furiten.get(a) ?? 0;
  console.log(`  ${a.padEnd(12)} ${String(d).padStart(5)}      ${String(f).padStart(4)} (${d === 0 ? "-" : ((f / d) * 100).toFixed(1) + "%"})`);
}
for (const s of samples) console.log("  " + s);
