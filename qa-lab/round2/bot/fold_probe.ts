/**
 * **가망 없는 손으로 리치에 미는가.**
 *
 * 장면: p1이 6순째 리치를 걸었고 바닥에 현물이 여러 장 깔려 있다(12순·패산 24).
 * 내 손은 3샹텐 이상이고 **손에 현물이 한 장 이상 있다.** 사람이라면 여기서
 * 현물을 낸다 — 화료 확률이 사실상 0이라 밀어서 얻을 것이 없다.
 *
 * 봇이 무엇을 고르는지, 그리고 그때 자기 계산으로 **기대 실점을 얼마로 봤는지**를 센다.
 *
 *   tsx qa-lab/round2/bot/fold_probe.ts [scenes] [seed]
 */
import { botScene } from "../../../packages/server/test/botTestView.js";
import { buildRead } from "../../../packages/server/src/bot/read.js";
import { bidDiscard } from "../../../packages/server/src/bot/discard.js";
import { profileOf } from "../../../packages/server/src/bot/profile.js";
import type { ArchetypeName } from "../../../packages/server/src/bot/profile.js";
import { kindKey, standardKinds, shantenOf } from "@majak/core";
import type { TileKind } from "@majak/core";

const SCENES = Number(process.argv[2] ?? 200);
const SEED = Number(process.argv[3] ?? 31337);
const ARCH: ArchetypeName[] = ["attacker", "defender", "speedster", "valueHunter", "balanced", "wildcard"];

let st = SEED >>> 0;
const rnd = (): number => {
  st = (Math.imul(st ^ (st >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
  return st / 0x1_0000_0000;
};
const KINDS = standardKinds();
const SUIT_CH: Record<string, string> = { man: "m", pin: "p", sou: "s" };
const spec = (ks: readonly TileKind[]): string =>
  ks
    .map((k) => (k.suit === "wind" ? `${k.rank}z` : k.suit === "dragon" ? `${k.rank + 4}z` : `${k.rank}${SUIT_CH[k.suit]}`))
    .join("");

/** p1의 바닥 — 리치 선언패(index 2) 포함 6장. 이 종류들이 곧 현물이다 */
const P1_POND = "1z3z5m2p7s9m";

function randomHand(): TileKind[] {
  const used = new Map<string, number>();
  const out: TileKind[] = [];
  while (out.length < 14) {
    const k = KINDS[Math.floor(rnd() * KINDS.length)]!;
    const n = used.get(kindKey(k)) ?? 0;
    if (n >= 4) continue;
    used.set(kindKey(k), n + 1);
    out.push(k);
  }
  return out;
}

const stats = new Map<ArchetypeName, { n: number; push: number; lossSum: number; safeLossSum: number }>();
for (const a of ARCH) stats.set(a, { n: 0, push: 0, lossSum: 0, safeLossSum: 0 });
const samples: string[] = [];
let scenes = 0;

for (let i = 0; i < SCENES; i++) {
  const hand = randomHand();
  const sc = botScene({
    hand: spec(hand),
    turnCount: 12,
    wallLeft: 24,
    riichi: ["p1"],
    riichiTileIndex: { p1: 2 },
    discards: { p1: P1_POND, p2: "1z2z3z4z", p3: "1z2z3z4z" },
  });
  const read = buildRead(sc.view, "p0", { mode: "hanchan" });
  if (shantenOf(read.hand.slice(0, 13), 0, read.opts) < 3) continue;
  const safe = new Set(
    (sc.view.zones["discards:p1"]?.tileIds ?? []).map((id) => kindKey(sc.view.tiles[id]!.kind)),
  );
  const held = read.hand.filter((k) => safe.has(kindKey(k)));
  if (held.length === 0) continue;
  scenes++;
  const bestSafeLoss = Math.min(...held.map((k) => read.expectedLoss(k, "p1")));
  const options = sc.discardOptions();
  for (const a of ARCH) {
    const s = stats.get(a)!;
    s.n++;
    const bid = bidDiscard(read, options, null, profileOf(a));
    const id = (bid?.option.payload as { tileId: number } | undefined)?.tileId;
    if (id === undefined) continue;
    const k = sc.view.tiles[id]!.kind;
    const loss = read.expectedLoss(k, "p1");
    s.lossSum += loss;
    s.safeLossSum += bestSafeLoss;
    if (!safe.has(kindKey(k))) {
      s.push++;
      if (a === "defender" && samples.length < 6) {
        samples.push(
          `손 ${spec(hand)} (${shantenOf(read.hand.slice(0, 13), 0, read.opts)}샹텐)\n` +
            `   수비형이 고른 패 ${kindKey(k)} — 기대 실점 ${loss.toFixed(0)}점 · 안전도 ${read.safetyOf(k).toFixed(2)}\n` +
            `   손에 있던 현물 ${held.map(kindKey).join(",")} (기대 실점 ${bestSafeLoss.toFixed(0)}점)`,
        );
      }
    }
  }
}

console.log(`장면 ${scenes} (p1 리치 · 12순 · 내 손 3샹텐 이상 · 손에 현물 있음)`);
console.log("원형          밀기(비현물)  평균 기대실점  현물의 기대실점");
for (const a of ARCH) {
  const s = stats.get(a)!;
  console.log(
    `  ${a.padEnd(12)} ${String(s.push).padStart(4)}/${s.n} = ${((s.push / s.n) * 100).toFixed(1).padStart(5)}%   ` +
      `${(s.lossSum / s.n).toFixed(0).padStart(6)}점   ${(s.safeLossSum / s.n).toFixed(0).padStart(6)}점`,
  );
}
for (const s of samples) console.log("\n" + s);
