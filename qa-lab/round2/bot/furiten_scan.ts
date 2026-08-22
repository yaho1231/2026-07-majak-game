/**
 * 무작위 14장 손을 만들어 **"론이 되는 텐파이"와 "스스로 후리텐이 되는 텐파이"가
 * 동시에 열려 있는 장면**만 골라, 봇의 평시 버림(`bidDiscard`)이 어느 쪽을 고르는지 센다.
 *
 * 엔진을 돌리지 않고 뷰만 세우므로 빠르고 결정적이다.
 *
 *   tsx qa-lab/round2/bot/furiten_scan.ts [hands] [seed]
 */
import { botScene } from "../../../packages/server/test/botTestView.js";
import { buildRead } from "../../../packages/server/src/bot/read.js";
import { bidDiscard } from "../../../packages/server/src/bot/discard.js";
import { profileOf } from "../../../packages/server/src/bot/profile.js";
import { kindKey, winningKinds, shantenOf, standardKinds } from "@majak/core";
import type { PlayerView, TileKind } from "@majak/core";

const HANDS = Number(process.argv[2] ?? 3000);
const SEED = Number(process.argv[3] ?? 12345);

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
      k.suit === "wind"
        ? `${k.rank}z`
        : k.suit === "dragon"
          ? `${k.rank + 4}z`
          : `${k.rank}${SUIT_CH[k.suit]}`,
    )
    .join("");
}

/**
 * **텐파이 근처의** 무작위 14장. 완전 무작위 14장은 4000손 중 6손만 텐파이라
 * 표본이 안 쌓인다 — 완성형(4멘쯔+머리)을 만든 뒤 한 장을 무작위로 바꿔치기한다.
 */
function randomHand(): TileKind[] | null {
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

interface Row {
  key: string;
  waits: string[];
  tiles: number;
  furiten: boolean;
  ev: number;
}

let scanned = 0;
let bothOpen = 0;
let furOpen = 0;
let tenpaiAvailable = 0;
let tenpaiBroken = 0;
let cleanOpen = 0; // 론가능 텐파이와 후리텐 텐파이가 모두 열린 장면
let choseFuriten = 0;
let choseFuritenDespiteWider = 0; // 론가능 쪽이 (론 배수까지 감안하면) 명백히 나은데도
const samples: string[] = [];

for (let i = 0; i < HANDS; i++) {
  const hand = randomHand();
  if (hand === null) continue;
  const sc = botScene({
    hand: spec(hand),
    turnCount: 8,
    wallLeft: 50,
    discards: { p1: "1z2z3z", p2: "1z2z3z", p3: "1z2z3z" },
  });
  const view: PlayerView = sc.view;
  const options = sc.discardOptions();
  const read = buildRead(view, "p0", { mode: "hanchan" });

  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const o of options) {
    const id = (o.payload as { tileId: number }).tileId;
    const key = kindKey(view.tiles[id]!.kind);
    if (seen.has(key)) continue;
    seen.add(key);
    const rest = [...read.hand];
    rest.splice(
      rest.findIndex((x) => kindKey(x) === key),
      1,
    );
    if (shantenOf(rest, 0, read.opts) !== 0) continue;
    const waits = winningKinds(rest, 0, undefined, read.opts).map(kindKey);
    const furiten = waits.includes(key);
    const tiles = waits.reduce((n, w) => {
      const m = /^([a-z]+)(\d+)$/.exec(w)!;
      return n + read.remainingOf({ suit: m[1] as TileKind["suit"], rank: Number(m[2]) });
    }, 0);
    rows.push({ key, waits, tiles, furiten, ev: bidDiscard(read, [o], null, profileOf("balanced"))?.value ?? NaN });
  }
  if (rows.length === 0) continue;
  scanned++;
  {
    // 텐파이를 잡을 수 있는 장면인데 봇이 텐파이를 깼는가 (위협 없음 · 8순 · 패산 50)
    const bidAll = bidDiscard(read, options, null, profileOf("balanced"));
    const idAll = (bidAll?.option.payload as { tileId: number } | undefined)?.tileId;
    const keyAll = idAll === undefined ? "?" : kindKey(view.tiles[idAll]!.kind);
    const live = rows.filter((r) => r.tiles > 0);
    if (live.length > 0) {
      tenpaiAvailable++;
      if (!live.some((r) => r.key === keyAll)) tenpaiBroken++;
    }
  }
  const clean = rows.filter((r) => !r.furiten && r.tiles > 0);
  const fur = rows.filter((r) => r.furiten && r.tiles > 0);
  if (fur.length > 0) furOpen++;
  if (clean.length > 0) cleanOpen++;
  if (clean.length === 0 || fur.length === 0) continue;
  bothOpen++;

  const bid = bidDiscard(read, options, null, profileOf("balanced"));
  const id = (bid?.option.payload as { tileId: number } | undefined)?.tileId;
  const pickedKey = id === undefined ? "?" : kindKey(view.tiles[id]!.kind);
  const picked = rows.find((r) => r.key === pickedKey);
  if (picked?.furiten !== true) continue;
  choseFuriten++;

  // 론 배수(2.2)를 감안한 '유효 대기 장수'로 비교 — 사람이 쓰는 어림
  const bestClean = clean.reduce((a, b) => (b.tiles > a.tiles ? b : a));
  if (bestClean.tiles * 2.2 > picked.tiles) {
    choseFuritenDespiteWider++;
    if (samples.length < 8) {
      samples.push(
        `손 ${spec(hand)}\n   고른 패 ${picked.key} → 대기[${picked.waits.join(",")}] ${picked.tiles}장 ✗론불가 (EV ${picked.ev.toFixed(0)})\n` +
          `   있었던 길 ${bestClean.key} → 대기[${bestClean.waits.join(",")}] ${bestClean.tiles}장 ○론가능 (EV ${bestClean.ev.toFixed(0)})`,
      );
    }
  }
}

console.log(
  JSON.stringify(
    {
      hands: HANDS,
      tenpaiScenes: scanned,
      tenpaiAvailable,
      tenpaiBrokenByBot: tenpaiBroken,
      scenesWithFuritenLine: furOpen,
      scenesWithCleanLine: cleanOpen,
      bothLinesOpen: bothOpen,
      choseFuritenLine: choseFuriten,
      choseFuritenLineThoughCleanWasBetter: choseFuritenDespiteWider,
      rate: bothOpen === 0 ? 0 : +(choseFuriten / bothOpen).toFixed(3),
    },
    null,
    1,
  ),
);
for (const s of samples) console.log("\n" + s);
