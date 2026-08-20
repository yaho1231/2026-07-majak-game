/**
 * bot 의심 2 재검증 — `shantenOf`가 `kokushiOnly` / `kokushiMeldKinds`를 보지 않는다.
 *
 *   npx tsx qa-lab/verify-shape/repro_kokushi_only_shanten.ts
 *
 * 우는 국사(open_kokushi)가 `kokushi_pon`을 한 순간 `scoringOptionsOf`가
 *   opts.kokushiMeldKinds = [3종] ; opts.kokushiOnly = true
 * 를 켠다(core/flow/helpers.ts:196-206). 그 손은 **국사로만** 화료할 수 있다.
 * 그런데 shanten.ts:318 게이트는 `meldCount === 0 && totalSets === 4`뿐이라
 *  (a) 표준형 샹텐이 그대로 답이 되고 (실제로는 표준형으로 화료 불가)
 *  (b) 울어 국사 샹텐은 아예 계산되지 않는다.
 *
 * "진짜 샹텐"은 화료형 판정기(decompose)로 직접 잰다 — n장 더해서 화료형이 되는
 * 최소 장수 - 1.
 */
import { shantenOf, isWinningShape, kindKey } from "@majak/core";
import type { TileKind, DecomposeOptions } from "@majak/core";
import { h } from "../../packages/server/test/botTestView.js";

const ORPHANS = h("19m19p19s1234567z");

/** 요구패 전체 + 손에 있는 종류를 후보로, 브루트포스로 진짜 샹텐을 잰다 (최대 3장까지) */
function trueShanten(hand: TileKind[], meldCount: number, opts: DecomposeOptions): number {
  const uni: TileKind[] = [];
  const seen = new Set<string>();
  for (const k of [...ORPHANS, ...hand]) {
    if (!seen.has(kindKey(k))) { seen.add(kindKey(k)); uni.push(k); }
  }
  const need = 14 - (opts.kokushiMeldKinds?.length ?? meldCount * 3);
  const rec = (cur: TileKind[], depth: number, max: number): boolean => {
    if (cur.length === need && isWinningShape(cur, meldCount, opts)) return true;
    if (depth >= max) return false;
    for (const c of uni) {
      // 한 장 넣고 한 장 뺀다(교환) 또는 그냥 넣는다
      if (cur.length < need) { if (rec([...cur, c], depth + 1, max)) return true; }
      for (let i = 0; i < cur.length; i++) {
        if (kindKey(cur[i] as TileKind) === kindKey(c)) continue;
        const next = [...cur]; next[i] = c;
        if (rec(next, depth + 1, max)) return true;
      }
    }
    return false;
  };
  for (let d = 0; d <= 3; d++) if (rec(hand, 0, d)) return d - 1;
  return 99;
}

interface Case { name: string; hand: string; meldKinds: string }
const CASES: Case[] = [
  // kokushi_pon 1개 = 요구패 3종을 덮는다. 손패는 14-3 = 11장(쯔모 전 10장 + 쯔모 1)
  { name: "우는 국사 텐파이 (나머지 10종 + 머리, 1장 부족)", hand: "9m19p19s123456z", meldKinds: "1m7z9s" },
  { name: "우는 국사 1샹텐", hand: "9m19p19s12345z5m", meldKinds: "1m7z9s" },
];

let bug = 0, total = 0;
for (const c of CASES) {
  const meldKinds = h(c.meldKinds);
  const hand = h(c.hand);
  const opts: DecomposeOptions = { kokushiMeldKinds: meldKinds, kokushiOnly: true };
  const reported = shantenOf(hand, 1, opts);
  const truth = trueShanten(hand, 1, opts);
  const ok = reported === truth;
  if (!ok) bug++;
  total++;
  console.log(
    `${c.name.padEnd(38)} 손=${c.hand} 후로=${c.meldKinds}\n` +
    `   shantenOf → ${reported}   진짜(decompose) → ${truth}   ${ok ? "OK" : "**어긋남**"}`,
  );
}
// 대조: 같은 손을 kokushiOnly 없이 보면 shantenOf가 무엇을 보고 있었는지 드러난다
for (const c of CASES) {
  const bare = shantenOf(h(c.hand), 1, {});
  console.log(`대조: ${c.name.padEnd(34)} 옵션 없는 표준형 샹텐 = ${bare}`);
}
console.log(`BUG=${bug}/${total}`);

// ── 봇 쪽 발현: buildRead가 이 손을 어떻게 읽는가 ──
{
  const { botScene } = await import("../../packages/server/test/botTestView.js");
  const { buildRead } = await import("../../packages/server/src/bot/read.js");
  for (const c of CASES) {
    const opts = { kokushiMeldKinds: h(c.meldKinds), kokushiOnly: true };
    const scene = botScene({
      hand: c.hand,
      melds: [`kokushi_pon:${c.meldKinds}`],
      scoringOptions: opts as never,
    });
    const read = buildRead(scene.view, "p0", { mode: "hanchan" });
    console.log(
      `봇 읽기: ${c.name.padEnd(38)} read.shanten=${read.shanten} read.tenpai=${read.tenpai} read.waits=${read.waits.length}종`,
    );
  }
}
