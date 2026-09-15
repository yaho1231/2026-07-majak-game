/**
 * 한 끗 차이 (off_by_one, prism).
 *
 * 리치 후, 쯔모한 패가 **오름패의 ±1**이면 그 패가 스르륵 한 칸 밀려
 * 오름패로 바뀐다. 3통을 기다리는데 2통이나 4통을 잡아도 화료다.
 *
 * 설계 결정:
 * - **리치 필수 + 쯔모 한정.** 리치를 걸어 손을 굳힌 사람에게만 주는 보상이며,
 *   론에는 적용하지 않는다(후리텐 판정과 상대의 버림 선택을 흔들지 않기 위해).
 * - **1↔9 순환 없음** — 단, 끝없는 윤회(broken_wall)가 켜는 `hand.wrapRanks`가 있으면
 *   9와 1도 이웃이 되어 9 대기에 1을(1 대기에 9를) 잡아도 밀린다(2026-08-27 버프).
 *   규칙으로만 통신하므로 이 파일은 그 증강의 id를 모른다 — wrapRanks.ts 머리말 참고.
 * - 자패는 대상이 아니다(±1이라는 개념이 없다).
 * - 추가 점수 없음. "빗나간 패가 오름패가 된다"는 그림 하나가 보상의 전부다.
 *
 * 구현: TILE_DRAWN 리액션에서 뽑은 패의 rank±1(같은 무늬) 중 하나가 대기패이면
 * 그 kind로 갈아 끼운다(tileKindChanged, conjured=true). 화료는 표준 쯔모(win)가
 * 그대로 처리한다 — 커스텀 화료 처리는 하지 않는다(함정 6).
 * 이미 진짜 오름패를 뽑았으면 아무것도 하지 않는다.
 *
 * «어느 kind로 미는가»의 술어(`offByOneTarget`)는 `drawMutators.ts`에 있다 — 죽은 대기
 * (남은 장수 0)에 밀지 않는 규칙(2026-08-20 QA 리치 확정 3)도 거기 적혀 있다. 같은
 * 쯔모에서 kind를 바꾸는 다른 카드(해저의 지배자·거신병·만개·소환)가 그 술어를 읽고
 * 물러날지 정하므로, 이 파일이 따로 계산하면 두 판정이 어긋날 수 있다(단일 진실).
 */

import {
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  kindKey,
  tileKindChanged,
} from "@majak/core";
import type { AugmentDef, TileDrawnPayload } from "@majak/core";
import { roundViewKey } from "../util.js";
import { offByOneTarget, yieldsDrawTo } from "./drawMutators.js";

const ID = "off_by_one";

export const offByOne: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  complexity: 2,
  name: "한 끗 차이",
  description:
    "(상시) 리치 후 쯔모한 패가 오름패보다 숫자가 1 크거나 작으면 그 패가 오름패로 바뀐다.",
  detail:
    "리치 후 쯔모한 패가 오름패와 같은 무늬이고 숫자가 1 크거나 작으면 그 패가 오름패로 바뀐다.\n\n1과 9는 이어지지 않는다. 끝없는 윤회를 함께 가지고 있으면 이어진다. 오름패 4장이 모두 나온 대기에는 적용되지 않는다.\n\n주의: 바뀐 패로 화료하지 않으면 그 패는 버려지고 후리텐이 된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder) return;
      const state = rc.state;

      const target = offByOneTarget(state, engine.rules, holder, p.tileId);
      if (target === null) return;
      /*
       * ⚠ **더 센 쯔모 변형에 이 한 장을 양보한다.**
       *
       * 같은 좌석이 해저의 지배자·거신병·만개를 함께 들면 그쪽도 같은 tileId에
       * `tileKindChanged`를 쏴서, 나중에 설치된 쪽(= 드래프트 픽 순서)이 이기고 진 쪽의
       * 효과는 조용히 죽었다(2026-09-16 docs/55 C-1 — 소환과의 경합에서 확인). 우선순위와
       * 근거는 `drawMutators.ts` 한곳에 모여 있다. 이 카드는 상시라 물러나도 자원이 타지
       * 않고, 이기는 쪽은 어차피 이 쯔모로 화료(또는 그 이상)를 준다.
       */
      if (yieldsDrawTo(ID, state, engine.rules, holder, p.tileId, p.rinshan === true)) {
        return;
      }

      rc.emit(
        tileKindChanged([
          { tileId: p.tileId, kind: target, attrs: { conjured: true } },
        ]),
      );
      // 전원 공개 — 한 칸 밀려 바뀐 그 패가 이 증강의 구경거리다
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), kindKey(target)));
    });
  },
});
