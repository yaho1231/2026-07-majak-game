/**
 * **아키타입이 실제로 다르게 두는가.**
 *
 * `docs/00_MASTER_ARCHITECTURE.md §5.4`와 `bot/profile.ts`는 원형마다 미는 정도·우는
 * 문턱·타점 취향이 다르다고 약속한다. 같은 장면을 여섯 원형에게 주고 **버림 선택이
 * 실제로 갈리는 비율**을 잰다. 두 장면 묶음으로 나눠 본다.
 *
 *  - 평시: 상대에 리치 없음 (수비 축이 놀고 있는 장면)
 *  - 위험: p1이 리치 + 위험패/안전패가 섞인 손 (aggression이 갈라야 하는 장면)
 *
 *   tsx qa-lab/round2/bot/archetype_scan.ts [scenes] [seed]
 */
import { botScene } from "../../../packages/server/test/botTestView.js";
import { buildRead } from "../../../packages/server/src/bot/read.js";
import { bidDiscard } from "../../../packages/server/src/bot/discard.js";
import { profileOf } from "../../../packages/server/src/bot/profile.js";
import type { ArchetypeName } from "../../../packages/server/src/bot/profile.js";
import { kindKey, standardKinds } from "@majak/core";
import type { TileKind } from "@majak/core";

const SCENES = Number(process.argv[2] ?? 400);
const SEED = Number(process.argv[3] ?? 999);

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
    .map((k) =>
      k.suit === "wind" ? `${k.rank}z` : k.suit === "dragon" ? `${k.rank + 4}z` : `${k.rank}${SUIT_CH[k.suit]}`,
    )
    .join("");

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

/** 무작위 14장 (같은 종류 4장 제한) */
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

function run(label: string, danger: boolean, near: boolean): void {
  const disagreeCounts = new Map<string, number>();
  let scenes = 0;
  let anyDisagree = 0;
  const pairDisagree = new Map<string, number>();
  const pushCount = new Map<ArchetypeName, number>();
  const pushOpp = new Map<ArchetypeName, number>();

  for (let i = 0; i < SCENES; i++) {
    const hand = near ? nearTenpaiHand() : randomHand();
    if (hand === null) continue;
    const sc = botScene({
      hand: spec(hand),
      turnCount: danger ? 10 : 5,
      wallLeft: danger ? 30 : 50,
      ...(danger
        ? { riichi: ["p1"], riichiTileIndex: { p1: 2 }, discards: { p1: "1z2z9m9p", p2: "1z2z3z", p3: "1z2z3z" } }
        : { discards: { p1: "1z2z3z", p2: "1z2z3z", p3: "1z2z3z" } }),
    });
    const read = buildRead(sc.view, "p0", { mode: "hanchan" });
    const options = sc.discardOptions();
    // p1(리치자)에게 100% 안전한 패 = 그 사람 바닥에 있는 종류(후리텐)
    const safe = new Set(
      (sc.view.zones["discards:p1"]?.tileIds ?? []).map((id) => kindKey(sc.view.tiles[id]!.kind)),
    );
    const haveSafe = read.hand.some((k) => safe.has(kindKey(k)));
    const picks = new Map<ArchetypeName, string>();
    for (const a of ARCH) {
      const bid = bidDiscard(read, options, null, profileOf(a));
      const id = (bid?.option.payload as { tileId: number } | undefined)?.tileId;
      const key = id === undefined ? "?" : kindKey(sc.view.tiles[id]!.kind);
      picks.set(a, key);
      if (danger && haveSafe) {
        pushOpp.set(a, (pushOpp.get(a) ?? 0) + 1);
        if (!safe.has(key)) pushCount.set(a, (pushCount.get(a) ?? 0) + 1);
      }
    }
    scenes++;
    const distinct = new Set(picks.values());
    disagreeCounts.set(String(distinct.size), (disagreeCounts.get(String(distinct.size)) ?? 0) + 1);
    if (distinct.size > 1) anyDisagree++;
    for (let x = 0; x < ARCH.length; x++) {
      for (let y = x + 1; y < ARCH.length; y++) {
        const key = `${ARCH[x]}↔${ARCH[y]}`;
        if (picks.get(ARCH[x]!) !== picks.get(ARCH[y]!)) {
          pairDisagree.set(key, (pairDisagree.get(key) ?? 0) + 1);
        }
      }
    }
  }

  console.log(`\n── ${label} (${scenes}장면) ──`);
  console.log(`여섯 원형의 선택이 갈린 장면: ${anyDisagree} (${((anyDisagree / scenes) * 100).toFixed(1)}%)`);
  console.log(`서로 다른 선택지 개수 분포: ${[...disagreeCounts].sort().map(([k, v]) => `${k}종:${v}`).join(" ")}`);
  if (danger) {
    console.log("현물이 손에 있는 장면에서 **무스지/비현물을 낸 비율**(=밀기율):");
    for (const a of ARCH) {
      const n = pushOpp.get(a) ?? 0;
      const p = pushCount.get(a) ?? 0;
      console.log(`  ${a.padEnd(12)} ${p}/${n} = ${n === 0 ? "-" : ((p / n) * 100).toFixed(1) + "%"}`);
    }
  }
  console.log("쌍별 불일치율:");
  for (const [k, v] of [...pairDisagree].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(26)} ${((v / scenes) * 100).toFixed(1)}%`);
  }
}

run("평시 · 무작위 손", false, false);
run("위험(p1 리치) · 무작위 손", true, false);
run("평시 · 텐파이 근처 손", false, true);
run("위험(p1 리치) · 텐파이 근처 손", true, true);
