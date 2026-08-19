/**
 * 카운터(counter) 문구 검증 2건.
 *  A. "내 공탁 1000점을 그 상대가 대납하고" — 내 추격 리치가 공탁을 내지 않는 리치
 *     (물러설 수 없는 선언 / 스텔스 리치)면 대납액이 0이 된다. 카드가 예외로 적어 둔 것은
 *     "상대의 남은 점수를 넘지 않는다" 하나뿐이다.
 *  B. 스텔스 리치를 건 상대를 카운터가 대상으로 잡고 **전원 공개 채널**로 지목을 광고한다
 *     → 스텔스 리치의 "타가에게는 평범한 타패로 보인다"가 그 자리에서 깨진다.
 */
import { buildPlayerView, createStandardGameFromState, installAugment } from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { counter } from "../../../packages/content/src/augments/counter.js";
import { noRetreat } from "../../../packages/content/src/augments/no_retreat.js";
import { stealthRiichi } from "../../../packages/content/src/augments/stealth_riichi.js";

const P0 = "234m345p345s678s5s";        // 13장 텐파이 (5s 대기)
const P1 = "123m456m789m11p234p";      // 14장, 4p를 버리면 1p/4p 대기

function build(p0augs: string[], p1augs: string[], defs: [AugmentDef, PlayerId][]) {
  const base = craft({
    hands: { p0: P0, p1: P1, p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  const st: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: p0augs } : p.id === "p1" ? { ...p, augments: p1augs } : p,
    ),
  };
  const game = createStandardGameFromState(st);
  for (const [d, who] of defs) installAugment(game.engine, d, who, { yaku: game.yaku });
  return game;
}
function toP0Turn(st: GameState): GameState {
  const wall = st.zones["wall"]!.tileIds;
  const t = wall[0] as TileId;
  return {
    ...st,
    zones: {
      ...st.zones,
      wall: { ...st.zones["wall"]!, tileIds: wall.slice(1) },
      "hand:p0": { ...st.zones["hand:p0"]!, tileIds: [...st.zones["hand:p0"]!.tileIds, t] },
    },
    round: { ...st.round, phase: "turn.act", turnSeat: 0, lastDrawnTile: t },
  };
}

// ── A: p1 표준 리치 → p0가 no_retreat 리치로 추격 ──────────────────────────
for (const chase of ["riichi", "no_retreat_riichi"] as const) {
  let g = build(["counter", "no_retreat"], [], [[counter, "p0"], [noRetreat, "p0"]]);
  g.engine.submit({ player: "p1", type: "riichi", payload: { tileId: g.engine.state.zones["hand:p1"]!.tileIds.at(-1) as TileId } });
  const p1Before = g.engine.state.players.find((p) => p.id === "p1")!.score;
  const st2 = toP0Turn(g.engine.state);
  const g2 = build(["counter", "no_retreat"], [], []);
  const game = createStandardGameFromState(st2);
  installAugment(game.engine, counter, "p0", { yaku: game.yaku });
  installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
  const r = game.engine.submit({ player: "p0", type: chase, payload: { tileId: st2.round.lastDrawnTile as TileId } });
  const s = game.engine.state;
  const p1After = s.players.find((p) => p.id === "p1")!.score;
  console.log(
    `A 추격리치=${chase.padEnd(18)} ok=${r.ok} p0공탁=${s.round.byPlayer["p0"]?.riichi?.cost} ` +
      `p1점수 ${p1Before}→${p1After} (대납 ${p1Before - p1After}) p1일발=${s.round.byPlayer["p1"]?.riichi?.ippatsu} ` +
      `struck=${s.augmentData["counter:struck:p0"]}`,
  );
}

// ── B: p1이 스텔스 리치 → p0 카운터가 전원 공개로 지목 ────────────────────
{
  const g = build(["counter"], ["stealth_riichi"], [[counter, "p0"], [stealthRiichi, "p1"]]);
  const r1 = g.engine.submit({ player: "p1", type: "stealth_riichi", payload: { tileId: g.engine.state.zones["hand:p1"]!.tileIds.at(-1) as TileId } });
  const st2 = toP0Turn(g.engine.state);
  const game = createStandardGameFromState(st2);
  installAugment(game.engine, counter, "p0", { yaku: game.yaku });
  installAugment(game.engine, stealthRiichi, "p1", { yaku: game.yaku });
  const p1Before = game.engine.state.players.find((p) => p.id === "p1")!.score;
  const r2 = game.engine.submit({ player: "p0", type: "riichi", payload: { tileId: st2.round.lastDrawnTile as TileId } });
  const s = game.engine.state;
  const v2 = buildPlayerView(s, "p2", game.engine.rules);
  console.log(
    `B 스텔스선언ok=${r1.ok} 추격리치ok=${r2.ok}\n` +
      `  p2가 보는 p1의 리치표시 = ${v2.round.byPlayer["p1"]?.riichiDeclared}  ← 은닉은 유지\n` +
      `  전원 공개 채널 view:*:counter:p0 = ${JSON.stringify(s.augmentData["view:*:counter:p0"])}  ← p1이 리치라는 사실이 여기서 샌다\n` +
      `  p1 점수 ${p1Before}→${s.players.find((p) => p.id === "p1")!.score} (숨은 리치자가 남의 공탁을 대납) p1일발=${s.round.byPlayer["p1"]?.riichi?.ippatsu}`,
  );
}
