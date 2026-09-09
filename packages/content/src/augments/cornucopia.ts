/**
 * 수상한 주사위 (cornucopia, prism) — "한 장을 골랐는데 두 장이 쏟아진다".
 *
 * 뽑는 순간 **무작위 증강 2개**가 함께 굴러 들어온다. 드래프트 한 칸으로 세 칸을 먹는
 * 셈이라, 이걸 집은 사람은 그 자리에서 판 위에서 가장 무거운 사람이 된다. 무엇이
 * 나왔는지는 **전원에게 공개**된다 — 상대는 그 조합을 보고 남은 국을 다시 짠다.
 *
 * 구현: 코어의 지급 API(`ctx.grantAugments`) 하나만 쓴다.
 * - 후보는 **전체 카탈로그**다. 드래프트의 좌석 칸·"남이 이미 가진 것 제외"는 적용하지
 *   않는다(2026-08-04 사용자 확정: 남과 겹쳐도 된다). 다만 **자기 자신·이미 보유한 것**,
 *   그리고 **상호 배제·모드 부적합**은 코어가 후보에서 걸러 낸다 — 그 조합은 손패 장수나
 *   화료형이 어긋나 국을 벽돌로 만들기 때문이다.
 * - 선택은 `(게임 시드 ⊕ 보유자)`에서 파생된 **독립 PRNG**다. 게임 진행용 PRNG를
 *   건드리지 않으므로 이 증강이 있고 없고로 패산이 달라지지 않는다.
 * - **추첨은 일반 드래프트와 같은 가중 추출이다** (2026-08-27). 예전에는 후보에서
 *   완전 균등으로 뽑아, 드래프트가 `powerTier.ts`의 `POWER_TIER_WEIGHT`로 눌러 둔
 *   확률(SS+ ×0.70 … D ×1.12)과 서버의 실전 자동 조정 오프셋을 이 경로만 통째로
 *   우회했다. 이제 코어가 넘겨 주는 `rollWeighted`(=`AugmentRegistry.rollFrom`)를
 *   쓴다 — 티어와 등장 확률이 갈라지지 않는다. 시드 파생은 그대로라 결정성은 유지된다.
 * - 지급 결과는 상태(`augmentGrantKey`)에 남아, 이어하기·리플레이의 재설치에서
 *   **다시 뽑지 않는다**.
 */

import {
  Prng,
  ROUND_STARTED,
  augmentDataSet,
  augmentGrantKey,
  defineAugment,
} from "@majak/core";
import type { AugmentDef, PlayerId } from "@majak/core";import { viewKey } from "../util.js";

const ID = "cornucopia";

/** 한 번에 쏟아지는 장수 */
const GRANT_COUNT = 2;

/** 전원 공개 채널 — 값 = 쏟아진 증강 id 목록 (국을 넘어 유지되므로 고정 키) */
const publicKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const cornucopia: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "etc",
  complexity: 1,
  name: "수상한 주사위",
  description:
    "(획득 즉시) 무작위 증강 2개를 획득한다. 무엇이 나왔는지는 전원에게 공개된다.",
  detail:
    "획득 즉시 무작위 증강 2개를 받는다.\n\n획득 즉시 무작위 증강 2개를 받는다.\n\n이미 가진 증강, 함께 가질 수 없는 증강, 이 모드에 없는 증강은 나오지 않는다. 후보가 모자라면 1개만 받거나 하나도 받지 못할 수 있다.",
  install(ctx) {
    const { holder } = ctx;

    ctx.grantAugments((available, rollWeighted) => {
      if (available.length === 0) return [];
      // 게임 진행용 PRNG를 건드리지 않는 독립 시드 — 리플레이·재개에서도 같은 결과
      const prng = new Prng(
        (ctx.engine.state.config.seed ^ hashString(`${ID}:${holder}`)) >>> 0,
      );
      // 드래프트와 **같은** 비복원 가중 추출(AugmentRegistry.rollFrom)이다.
      return rollWeighted(prng, GRANT_COUNT, available);
    });

    // 무엇이 쏟아졌는지 전원 공개.
    // 지급 자체는 install에서 이미 끝났고 결과는 지급 이력 키에 남아 있다 —
    // install에서는 뷰 채널에 쓸 수단(emit)이 없으므로 다음 국 시작에 옮겨 싣는다.
    // (증강 보유 목록 자체는 이름표에 항상 보이므로, 이 채널은 "이 둘이 화수분에서
    //  나왔다"는 출처 표시용이다.)
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const granted = rc.state.augmentData[augmentGrantKey(holder, ID)];
      if (!Array.isArray(granted) || granted.length === 0) return;
      const prev = rc.state.augmentData[publicKey(holder)];
      if (Array.isArray(prev) && prev.length === granted.length) return;
      rc.emit(augmentDataSet(publicKey(holder), granted));
    });
  },
});
