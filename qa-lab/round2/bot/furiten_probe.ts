/**
 * 봇의 평시 버림 판단은 "이 패를 버리면 **내가 후리텐이 된다**"를 세지 않는다.
 *
 * - `bot/discard.ts:bidRiichi`는 후리텐을 본다(`myDiscards ∩ waits` → 사실상 리치 금지).
 * - `bot/discard.ts:bidDiscard`(평시 버림)에는 그 검사가 **없다**.
 *   `read.winChanceOf`의 `furiten` 인자는 `read.furiten`(=이미 후리텐인가)과
 *   `tsumoOnly`(=역이 없는가)만 본다(`bot/read.ts:426`) — **이 버림이 만들 후리텐**은
 *   어디에도 들어가지 않는다. 그래서 론 배수(`RON_MULTIPLIER 2.2`, `bot/value.ts:418`)가
 *   론이 불가능한 손에도 그대로 붙는다.
 *
 * 장면: 111m 999m 111p 555s 67s (14장).
 *   어느 자패/커쯔 한 장을 버려도, 5s를 버려도 **대기는 똑같이 5s·8s(잔량 5장)** 다.
 *   다른 것은 하나뿐이다 — 5s를 버리면 그 손은 **국이 끝날 때까지 론을 못 한다.**
 *
 *   tsx qa-lab/round2/bot/furiten_probe.ts
 */
import { botScene } from "../../../packages/server/test/botTestView.js";
import { buildRead } from "../../../packages/server/src/bot/read.js";
import { bidDiscard } from "../../../packages/server/src/bot/discard.js";
import { profileOf } from "../../../packages/server/src/bot/profile.js";
import { kindKey, winningKinds, shantenOf } from "@majak/core";
import type { PlayerView, TileKind } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";

const HAND = "111m999m111p555s67s"; // 14장
const ARCHETYPES = ["balanced", "attacker", "defender", "speedster", "valueHunter", "wildcard"] as const;

const parseKey = (key: string): TileKind => {
  const m = /^([a-z]+)(\d+)$/.exec(key)!;
  return { suit: m[1] as TileKind["suit"], rank: Number(m[2]) };
};

const build = (knownFuriten: boolean) => {
  const s = botScene({
    hand: HAND,
    turnCount: 8,
    wallLeft: 50,
    ...(knownFuriten ? { furiten: true } : {}),
    discards: { p1: "1z2z3z", p2: "1z2z3z", p3: "1z2z3z" },
  });
  return { view: s.view as PlayerView, options: s.discardOptions() as ActionOption[], read: buildRead(s.view, "p0", { mode: "hanchan" }) };
};
const { view, options, read } = build(false);
// 대조군 — 봇이 **이미 후리텐인 줄 아는** 같은 손. 이때만 론 배수가 빠진다.
const known = build(true);

console.log(`손패 ${HAND} · read.furiten=${read.furiten} · 순 ${read.turn} · 패산 ${read.wallLeft}`);
console.log("\n후보         버린 뒤 대기            잔량  론?      bidDiscard EV(balanced)");
console.log("  (모든 후보가 스스로 후리텐이 되는 손이다 — 그런데 EV에는 그 사실이 없다)");

const seen = new Set<string>();
const rows: { key: string; waits: string[]; tiles: number; furiten: boolean; ev: number; evKnown: number }[] = [];
for (const o of options) {
  const id = (o.payload as { tileId: number }).tileId;
  const key = kindKey(view.tiles[id]!.kind);
  if (seen.has(key)) continue;
  seen.add(key);
  const rest: TileKind[] = [...read.hand];
  rest.splice(
    rest.findIndex((x) => kindKey(x) === key),
    1,
  );
  if (shantenOf(rest, 0, read.opts) !== 0) continue;
  const waits = winningKinds(rest, 0, undefined, read.opts).map(kindKey);
  const furiten = waits.includes(key);
  const tiles = waits.reduce((n, w) => n + read.remainingOf(parseKey(w)), 0);
  // 이 후보 하나만 놓고 입찰시키면 그 후보의 EV가 그대로 나온다
  const ev = bidDiscard(read, [o], null, profileOf("balanced"))?.value ?? NaN;
  const o2 = known.options.find(
    (x) => kindKey(known.view.tiles[(x.payload as { tileId: number }).tileId]!.kind) === key,
  )!;
  const evKnown = bidDiscard(known.read, [o2], null, profileOf("balanced"))?.value ?? NaN;
  rows.push({ key, waits, tiles, furiten, ev, evKnown });
}
for (const r of rows) {
  console.log(
    `  ${r.key.padEnd(10)} [${r.waits.join(",").padEnd(20)}] ${String(r.tiles).padStart(3)}장  ` +
      `${r.furiten ? "✗ 론불가(후리텐)" : "○ 론가능      "}  EV ${r.ev.toFixed(0)}` +
      `   (후리텐을 아는 봇이 매기는 EV ${r.evKnown.toFixed(0)} — 차이 ${(r.ev - r.evKnown).toFixed(0)})`,
  );
}

console.log("\n원형별 실제 선택:");
for (const a of ARCHETYPES) {
  const bid = bidDiscard(read, options, null, profileOf(a));
  const id = (bid?.option.payload as { tileId: number } | undefined)?.tileId;
  const k = id === undefined ? "?" : kindKey(view.tiles[id]!.kind);
  const row = rows.find((r) => r.key === k);
  console.log(
    `  [${a.padEnd(11)}] ${k}  EV ${bid?.value.toFixed(0)}` +
      `${row?.furiten === true ? "   ← 스스로 후리텐이 된다" : ""}`,
  );
}

const fur = rows.find((r) => r.furiten);
const clean = rows.filter((r) => !r.furiten && r.tiles === fur?.tiles);
if (fur !== undefined && clean.length > 0) {
  console.log(
    `\n→ 같은 잔량 ${fur.tiles}장인데 EV 차이: 후리텐행 ${fur.ev.toFixed(0)} vs 론가능행 ` +
      `${clean.map((c) => `${c.key} ${c.ev.toFixed(0)}`).join(" · ")}`,
  );
}
