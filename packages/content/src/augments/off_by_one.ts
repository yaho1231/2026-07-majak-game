/**
 * 한 끗 차이 (off_by_one, prism).
 *
 * 리치 후, 쯔모한 패가 **오름패의 ±1**이면 그 패가 스르륵 한 칸 밀려
 * 오름패로 바뀐다. 3통을 기다리는데 2통이나 4통을 잡아도 화료다.
 *
 * 설계 결정:
 * - **리치 필수 + 쯔모 한정.** 리치를 걸어 손을 굳힌 사람에게만 주는 보상이며,
 *   론에는 적용하지 않는다(후리텐 판정과 상대의 버림 선택을 흔들지 않기 위해).
 * - **1↔9 순환 없음.** 랭크 1의 -1, 랭크 9의 +1은 존재하지 않으므로 자연히 빠진다.
 * - 자패는 대상이 아니다(±1이라는 개념이 없다).
 * - 추가 점수 없음. "빗나간 패가 오름패가 된다"는 그림 하나가 보상의 전부다.
 *
 * 구현: TILE_DRAWN 리액션에서 뽑은 패의 rank±1(같은 무늬) 중 하나가 대기패이면
 * 그 kind로 갈아 끼운다(tileKindChanged, conjured=true). 화료는 표준 쯔모(win)가
 * 그대로 처리한다 — 커스텀 화료 처리는 하지 않는다(함정 6).
 * 이미 진짜 오름패를 뽑았으면 아무것도 하지 않는다.
 */

import {
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  isNumberSuit,
  kindOf,
  kindKey,
  meldCountOf,
  sameKind,
  scoringOptionsOf,
  tileKindChanged,
  winHandIdsOf,
  winningKinds,
} from "@majak/core";
import type { AugmentDef, TileDrawnPayload } from "@majak/core";
import { viewKey } from "../util.js";

const ID = "off_by_one";

export const offByOne: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  name: "한 끗 차이",
  description:
    "(상시) 리치 후 쯔모한 패가 오름패의 ±1이면 그 패가 한 칸 밀려 오름패로 바뀐다. 3통 대기에 2통·4통을 잡아도 화료다.",
  detail:
    "(상시) 리치를 선언한 뒤의 쯔모에만 적용된다. 뽑은 수패가 자신의 오름패와 같은 무늬이고 숫자가 1만큼 어긋나 있으면 그 패가 그 자리에서 오름패로 바뀌어 그대로 쯔모 화료할 수 있다. 1과 9를 잇는 순환은 없고 자패에도 적용되지 않으며, 론이나 추가 점수와는 무관하다.",
  install(ctx) {
    const { engine, holder } = ctx;

    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder) return;
      const state = rc.state;
      if (state.round.byPlayer[holder]?.riichi == null) return; // 리치 필수

      const drawn = kindOf(state, p.tileId);
      if (!isNumberSuit(drawn)) return;

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
      if (waits.length === 0) return;
      // 이미 진짜 오름패면 손대지 않는다
      if (waits.some((w) => sameKind(w, drawn))) return;

      const target = waits.find(
        (w) => w.suit === drawn.suit && Math.abs(w.rank - drawn.rank) === 1,
      );
      if (target === undefined) return;

      rc.emit(
        tileKindChanged([
          { tileId: p.tileId, kind: target, attrs: { conjured: true } },
        ]),
      );
      // 전원 공개 — 한 칸 밀려 바뀐 그 패가 이 증강의 구경거리다
      rc.emit(augmentDataSet(viewKey("*", `${ID}:${holder}`), kindKey(target)));
    });
  },
});
