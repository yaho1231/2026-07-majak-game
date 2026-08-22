/**
 * 연금술사(alchemist) × 천화 게이트 — 형제 카드(염색 tile_dyeing)와의 **비대칭**.
 *
 * 두 증강은 같은 기법(TileKindChanged)으로 손패를 갈아 끼운다. 염색은
 * `handAlteredKey` 를 찍어 천화·지화 게이트를 닫고, 연금술사는 찍지 않는다.
 *
 * 기대(먼저 적는다):
 *   "증강이 손패를 고쳤으면 그 손은 배패가 아니다"가 코어의 규약이다
 *   (packages/core/src/mahjong/flow/helpers.ts:884~897). 같은 장면을 염색으로 만들면
 *   천화가 붙지 않아야 하고, 연금술사로 만들어도 붙지 않아야 한다.
 *
 * (round2/aug-4-FIXED.md 의 '곁가지'로 지적만 돼 있고 측정된 적이 없다.)
 */
import { evaluateWin, buildWinContext } from "@majak/core";
import { alchemist } from "../../../packages/content/src/augments/alchemist.js";
import { tileDyeing } from "../../../packages/content/src/augments/tile_dyeing.js";
import { conjureDraw } from "../../../packages/content/src/augments/conjure_draw.js";
import {
  craft,
  withAugments,
  start,
  handIds,
  handSpec,
  check,
  section,
  done,
  validate,
  type GameState,
} from "./lib.js";

/** 오야(p0)의 첫 쯔모 직후 — 4만 하나만 3만이면 화료형 */
function scene(augs: string[], hand: string): GameState {
  const base = craft({
    hands: {
      p0: hand,
      p1: "*",
      p2: "*",
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...withAugments(base, { p0: augs }),
    round: { ...base.round, firstTurn: true, dealerSeat: 0 },
  };
}

function measure(label: string, augs: string[], hand: string, act: (s: GameState) => { type: string; payload: unknown } | null): void {
  const st = scene(augs, hand);
  const defs = { alchemist, tile_dyeing: tileDyeing, conjure_draw: conjureDraw } as const;
  const g = start(
    st,
    augs.map((a) => ({ def: defs[a as keyof typeof defs], holder: "p0" as const })),
  );
  const step = act(g.game.engine.state);
  if (step !== null) {
    const v = validate(g.game, step.type, "p0", step.payload);
    if (v !== null) console.log(`    (거부: ${v})`);
    else g.flow!.submit("p0", { type: step.type, payload: step.payload });
  }
  const s = g.game.engine.state;
  const ids = handIds(s, "p0");
  const win = ids[ids.length - 1] as number;
  const ctx = buildWinContext(s, "p0", "tsumo", win, { rules: g.game.engine.rules });
  const ev = evaluateWin(ctx, g.game.yaku);
  const names = ev?.yaku.map((y) => y.name) ?? [];
  console.log(
    `  [${label}] 손=${handSpec(s, "p0")}\n      → ${ev === null ? "화료형 아님" : `${ev.han}판 · ${names.join("+")} · yakuman=${ev.yakumanCount}`}`,
  );
  check(`${label}: 천화가 붙지 않는다`, !names.includes("천화"), names.join("+"));
}

section("손패를 고쳐 만든 손에 천화가 붙는가 (오야 첫 순)");

// 대조군: 아무것도 안 고치고 이미 완성형인 배패 → 진짜 천화 (이건 붙어야 정상)
{
  const st = craft({
    hands: { p0: "123m456m789m123p33m", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s2: GameState = { ...st, round: { ...st.round, firstTurn: true, dealerSeat: 0 } };
  const g = start(s2, []);
  const hand = handIds(s2, "p0");
  const ctx = buildWinContext(s2, "p0", "tsumo", hand[hand.length - 1] as number, {
    rules: g.game.engine.rules,
  });
  const ev = evaluateWin(ctx, g.game.yaku);
  console.log(`  [대조군: 배패 그대로] → ${ev?.yaku.map((y) => y.name).join("+")}`);
}

// 123m456m789m123p + 3m + 3s → 3삭을 3만으로 물들이면 3m3m 머리로 완성
measure("염색(tile_dyeing)으로 완성", ["tile_dyeing"], "123m456m789m123p3m3s", (s) => {
  const id = handIds(s, "p0").find((t) => {
    const k = s.tiles[t]?.kind;
    return k?.suit === "sou" && k.rank === 3;
  });
  return id === undefined ? null : { type: "tile_dye", payload: { tileId: id, suit: "man" } };
});

// 123m456m789m123p + 3m + 4m → 4만을 3만으로 옮기면 3m3m 머리로 완성
measure("연금술사(alchemist)로 완성", ["alchemist"], "123m456m789m123p3m4m", (s) => {
  const id = handIds(s, "p0").find((t) => {
    const k = s.tiles[t]?.kind;
    return k?.suit === "man" && k.rank === 4;
  });
  return id === undefined ? null : { type: "alchemy", payload: { tileId: id, delta: -1 } };
});

// 대조군: 소환(conjure_draw)은 handAltered 를 찍지 않지만 천화 창에서는 쓸 수 없다(다음 쯔모)

done();
