/**
 * 복수자 (avenger, silver) — 48차 도파민 개편.
 *
 * 이전: "원수에게 론으로 되갚으면 +2판" (보이지 않는 판 보너스).
 * 지금: 론당하면 그 상대가 **원수**로 전원에게 공개되고, 그 순간부터
 *       원수의 버림패에 한해 **후리텐도 역 없음도 무시하고 론**할 수 있다.
 *       복수에 성공하면 **+2판**을 얻고 원한이 풀린다.
 *
 * 2026-08-02 (사용자 지시): +2판을 되살렸다. 48차에 뗀 이유는 "보이지 않는 판
 * 보너스뿐인 증강"을 금지하는 §0 리트머스였는데, 지금은 원수 지목·후리텐 해제라는
 * 보이는 본체가 이미 있고 판은 그 위에 얹히는 보상이다. 조건은 후리텐·역 해제와
 * **완전히 같은 판정**(targetIsNemesis)을 쓴다 — 해제가 걸린 론에만 판이 붙는다.
 *
 * 부수는 상식: "내가 버린 패는 나에게 안전하다(후리텐)" · "역이 없으면 화료 못 한다".
 * 원수로 찍힌 사람은 그 순간부터 나에게 어떤 패도 안전하지 않다.
 *
 * 구현: win.furiten.enabled / win.requiresYaku 모디파이어가 rctx.state를 읽어
 * **지금 론 대상 버림패의 주인이 원수일 때만** 해제한다(그 외에는 규칙 불변).
 * 조건부 해석이 가능한 것은 standardActions가 두 규칙 resolve에 state를 넘기기 때문.
 */

import { ROUND_SETTLED, augmentDataSet, defineAugment } from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { addHanBonus, stringOf, viewKey } from "../util.js";

/** 원수를 론했을 때 얹히는 판 */
const REVENGE_HAN = 2;

const nemKey = (h: PlayerId): string => `avenger:nemesis:${h}`;

/**
 * 지금 **론**하려는 대상(버림패·창깡)의 주인이 이 보유자의 원수인가.
 *
 * `phase === "reaction"`을 반드시 함께 본다 — `lastDiscard`는 다음 사람의 `turn.act`까지
 * 살아 있으므로, 그것만 보면 **쯔모 화료에도** 후리텐·역 요구 해제가 붙어 설명과
 * 어긋난다("원수의 버림패에 한해"). 리액션 페이즈는 론·창깡 문맥에서만 유지되고,
 * `sys.settleWin`이 규칙을 다시 resolve하는 시점에도 그대로라 정산까지 일관된다
 * (WIN_DECLARED는 identityReducer라 페이즈를 바꾸지 않는다).
 */
function targetIsNemesis(state: GameState | undefined, holder: PlayerId): boolean {
  if (state === undefined) return false;
  if (state.round.phase !== "reaction") return false;
  const nemesis = stringOf(state, nemKey(holder));
  if (nemesis === null) return false;
  const from = state.round.lastDiscard?.player ?? state.round.chankan?.player;
  return from === nemesis;
}

export const avenger: AugmentDef = defineAugment({
  id: "avenger",
  tier: "silver",
  category: "shape",
  complexity: 3,
  name: "복수자",
  description:
    "내 복수 상대에게는 후리텐이어도, 역이없어도(단, 머리1+몸통4의 형태) 론할 수 있다. 그 론은 +2판",
  detail:
    "원수를 론으로 잡으면 그 화료에 +2판이 얹히고(역만에는 미적용) 원한이 풀려 해제된다. 원수의 가깡을 창깡으로 잡는 것도 같은 판정에 들어간다.\n\n쯔모나 다른 사람 론에는 판이 붙지 않는다. 다른 사람에게 방총당하면 원수가 그쪽으로 갱신되며, 방총당하기 전까지는 아무 효과도 없다.",
  // B급 무효(docs/25 §conflicts): 둘 다 win.furiten.enabled·win.requiresYaku를
  // 끈다. 만개 구간에서는 복수자의 해제 부분이 통째로 중복된다.
  conflicts: ["late_bloomer", "late_bloomer_east"],
  install(ctx) {
    const { holder } = ctx;

    // 복수 성공 보상 — 후리텐·역 해제와 **같은 판정**이라, 해제가 걸린 그 론에만 붙는다.
    // (쯔모나 제3자 론에는 targetIsNemesis가 false라 0판.)
    addHanBonus(ctx, (state) => (targetIsNemesis(state, holder) ? REVENGE_HAN : 0));

    // 원수의 버림패에 한해서만 후리텐·역 요구가 풀린다 (그 외에는 표준 규칙 그대로)
    ctx.engine.rules.addModifier<boolean>("win.furiten.enabled", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        return targetIsNemesis(rctx.state as GameState | undefined, holder)
          ? false
          : cur;
      },
    });
    ctx.engine.rules.addModifier<boolean>("win.requiresYaku", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        return targetIsNemesis(rctx.state as GameState | undefined, holder)
          ? false
          : cur;
      },
    });

    /*
     * 원수의 지정·해제는 **둘 다 정산(ROUND_SETTLED) 뒤에** 한다.
     *
     * ⚠ 해제를 WIN_DECLARED 반응으로 두면 안 된다: `sys.settleWin`이 정산 시점 state로
     *   `win.requiresYaku`를 **다시 resolve**하는데(standardActions sysSettleWin), 그 전에
     *   원한이 풀려 있으면 요구가 되살아나 "Invalid win by …"로 **국·매치가 통째로 죽는다**
     *   (역 없는 손으로 원수에게 론한 경우). 한 국에 지정과 해제가 함께 일어날 수는 없다 —
     *   론당한 사람은 그 국의 화료자가 될 수 없기 때문이다.
     */
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const infos = p.winInfos ?? [];

      // 복수 성공 — 원수에게 론으로 화료했으면 원한이 풀린다
      const nemesis = stringOf(rc.state, nemKey(holder));
      if (
        nemesis !== null &&
        infos.some(
          (w) => w.winner === holder && w.winType === "ron" && w.from === nemesis,
        )
      ) {
        rc.emit(augmentDataSet(nemKey(holder), ""));
        rc.emit(augmentDataSet(viewKey("*", `avenger:${holder}`), ""));
        return;
      }

      // 방총당하면 원수 지정 (전원 공개 — Rule #4 대응의 전제)
      const ronnedBy = infos.find(
        (w) => w.winType === "ron" && w.from === holder,
      )?.winner;
      if (ronnedBy === undefined || ronnedBy === holder) return;
      rc.emit(augmentDataSet(nemKey(holder), ronnedBy));
      rc.emit(augmentDataSet(viewKey("*", `avenger:${holder}`), ronnedBy));
    });
  },
});
