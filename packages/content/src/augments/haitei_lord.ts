/**
 * 해저의 지배자 (haitei_lord, prism).
 *
 * 텐파이 상태로 **해저패(패산 마지막 패)** 를 쯔모하면, 대기와 무관하게
 * 그 패가 오름패로 바뀌어 무조건 해저로월로 화료한다. 그리고 +3판을 얻는다.
 *
 * 설계 결정:
 * - **텐파이만이 조건이다.** 무엇을 기다리고 있었는지는 상관없다 — 패산 마지막 패는
 *   지배자의 것이다. 국의 마지막 순간이라는 타이밍 자체가 곧 발동 제한이다.
 * - 무페널티: 실패해도 잃는 것이 없다. 텐파이가 아니면 그냥 아무 일도 일어나지 않는다.
 *
 * 구현:
 * - TILE_DRAWN 리액션에서 ①보유자의 쯔모 ②영상패가 아님 ③이 쯔모로 패산이 비었음
 *   ④보유자가 텐파이임을 확인하고, 뽑은 패의 kind를 대기패 중 하나로 바꾼다
 *   (tileKindChanged, conjured=true → 클라가 증강이 만든 패로 표시).
 * - 화료 자체는 **표준 쯔모(win)** 가 처리한다(함정 6: 커스텀 액션으로 WIN_DECLARED를
 *   내면 정산이 멈춘다). 패산이 비었고 영상 쯔모가 아니므로 엔진이 haitei 플래그를
 *   자동으로 세워 해저로월이 그대로 붙는다.
 * - 발동한 국이면 정산에 +3판 (addWinHanBonus). 국 단위 플래그라 다음 국에 남지 않는다.
 */

import {
  TILE_DRAWN,
  WALL,
  augmentDataSet,
  defineAugment,
  kindKey,
  kindOf,
  meldCountOf,
  scoringOptionsOf,
  tileKindChanged,
  winHandIdsOf,
  winningKinds,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  TileDrawnPayload,
  TileKind,
} from "@majak/core";
import { addWinHanBonus, flagOf, roundKey, viewKey } from "../util.js";

const ID = "haitei_lord";
/** 발동한 국의 화료에 얹는 판수 (구 +4500점) */
const BONUS_HAN = 3;

/** 이번 국에 해저 지배가 발동했는가 */
const firedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:fired:${roundKey(state)}:${h}`;

export const haiteiLord: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  name: "해저의 지배자",
  description:
    "(상시) 텐파이 상태로 해저패(패산 마지막 패)를 쯔모하면 대기와 무관하게 그 패가 오름패로 바뀌어 무조건 해저로월로 화료하고 +3판을 얻는다.",
  detail:
    "(상시) 패산의 마지막 한 장을 자신이 뽑고 그때 텐파이였다면, 그 패가 무엇이든 자신의 오름패로 바뀐다. 무엇을 기다리고 있었는지는 상관없으며 그대로 해저로월 쯔모로 화료할 수 있고 +3판을 얻는다. 텐파이가 아니면 아무 일도 일어나지 않으며, 영상 쯔모는 해저패가 아니므로 발동하지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 발동한 국의 화료에 +3판
    addWinHanBonus(ctx, (state) =>
      flagOf(state, firedKey(state, holder)) ? BONUS_HAN : 0,
    );

    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder || p.rinshan === true) return;
      const state = rc.state;
      // 이 쯔모로 패산이 비었는가 = 방금 뽑은 것이 해저패인가
      if ((state.zones[WALL]?.tileIds.length ?? 0) !== 0) return;
      if (flagOf(state, firedKey(state, holder))) return;

      // 대기는 쯔모패를 뺀 13장으로 계산한다
      const hand13 = winHandIdsOf(state, engine.rules, holder)
        .filter((id) => id !== p.tileId)
        .map((id) => kindOf(state, id));
      const waits = winningKinds(
        hand13,
        meldCountOf(state, holder),
        undefined,
        scoringOptionsOf(state, engine.rules, holder),
      );
      if (waits.length === 0) return; // 텐파이가 아니면 아무 일도 없다

      const drawnKey = kindKey(kindOf(state, p.tileId));
      const already = waits.some((w) => kindKey(w) === drawnKey);
      const target = waits[0] as TileKind;

      // 이미 오름패면 굳이 바꾸지 않는다 — 그대로 해저로월이다
      if (!already) {
        rc.emit(
          tileKindChanged([
            { tileId: p.tileId, kind: target, attrs: { conjured: true } },
          ]),
        );
      }
      rc.emit(augmentDataSet(firedKey(state, holder), true));
      // 전원 공개 — 마지막 패가 무엇으로 바뀌었는지가 이 증강의 구경거리다
      rc.emit(
        augmentDataSet(
          viewKey("*", `${ID}:${holder}`),
          already ? drawnKey : kindKey(target),
        ),
      );
    });
  },
});
