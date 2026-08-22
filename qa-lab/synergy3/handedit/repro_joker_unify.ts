/**
 * 조커(joker) × 단색 세계(suit_unify) / 편식(picky_eater) — 백(白)이 낀 청일색.
 *
 * 기대(먼저 적는다):
 *   단색 세계 detail: "통일된 색으로 **청일색이 인정된다**". 자패는 통일 대상이 아니므로
 *   백이 손에 남아 있으면 청일색은 성립하지 않고 혼일색이다.
 *   조커 detail: "손에 있는 백은 전부 조커이고 머리도 몸통도 된다 … **도라는 백 그대로 센다**"
 *   → 조커는 '해석'이므로 실물 백은 그대로 손에 있다. 청일색(수패 한 색만)의 정의상
 *     백이 손에 있으면 청일색이 아니어야 자연스럽다. 반대로 "가장 비싼 형태"로 읽는다면
 *     청일색이 붙는다 — 어느 쪽이든 **설명에는 한 줄도 없다.**
 *   측정: (없음) / (조커만) / (단색만) / (조커+단색) 4칸으로 판수와 역 이름을 찍는다.
 */
import { evaluateWin, buildWinContext } from "@majak/core";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { suitUnify } from "../../../packages/content/src/augments/suit_unify.js";
import type { AugmentDef } from "@majak/core";
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

const DEFS: Record<string, AugmentDef> = { joker, suit_unify: suitUnify };

/**
 * p0 손: 234p 567p 234s 78s 99p + 백 (14장, 백이 쯔모패)
 *   → 단색(pin)으로 통일하면 수패는 전부 통(백은 남는다).
 *   → 조커를 켜면 백이 아무 패로나 읽힌다.
 */
function scene(augs: string[]): GameState {
  return withAugments(
    craft({
      hands: { p0: "234p567p234s78s99p5z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: augs },
  );
}

function measure(label: string, augs: string[], unify: boolean, jokerOn: boolean): void {
  const st = scene(augs);
  const g = start(
    st,
    augs.map((a) => ({ def: DEFS[a] as AugmentDef, holder: "p0" as const })),
  );
  if (jokerOn) {
    const v = validate(g.game, "joker_call", "p0", {});
    if (v === null) g.flow!.submit("p0", { type: "joker_call", payload: {} });
    else console.log(`    (joker_call 거부: ${v})`);
  }
  if (unify) {
    const v = validate(g.game, "mono_world", "p0", { suit: "pin" });
    if (v === null) g.flow!.submit("p0", { type: "mono_world", payload: { suit: "pin" } });
    else console.log(`    (mono_world 거부: ${v})`);
  }
  const s = g.game.engine.state;
  const hand = handIds(s, "p0");
  const win = hand[hand.length - 1] as number;
  const ctx = buildWinContext(s, "p0", "tsumo", win, { rules: g.game.engine.rules });
  const ev = evaluateWin(ctx, g.game.yaku);
  console.log(
    `  [${label}] 손=${handSpec(s, "p0")}\n      → ${
      ev === null ? "화료형 아님" : `${ev.han}판 ${ev.fu}부 · ${ev.yaku.map((y) => y.name).join("+")}`
    }`,
  );
  return;
}

section("조커 × 단색 세계 — 백이 낀 청일색");
measure("없음", [], false, false);
measure("A: 조커만", ["joker"], false, true);
measure("B: 단색만", ["suit_unify"], true, false);
measure("A+B: 조커+단색", ["joker", "suit_unify"], true, true);

check(
  "위 네 칸을 눈으로 대조 (청일색이 어디서 붙는지)",
  true,
  "판정은 보고서에서",
);

done();
