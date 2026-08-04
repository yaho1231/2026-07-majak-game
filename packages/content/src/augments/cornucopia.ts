/**
 * 화수분 (cornucopia, prism) — "한 장을 골랐는데 두 장이 쏟아진다".
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
import type { AugmentDef, PlayerId } from "@majak/core";
import { viewKey } from "../util.js";

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
  name: "수상한 주사위",
  description:
    "획득하는 순간 무작위 증강 2개가 함께 쏟아진다 — 한 칸으로 세 칸을 먹는다. 무엇이 나왔는지는 전원에게 공개된다.",
  detail:
    "드래프트에서 이 증강을 고르는 순간, 카탈로그 전체에서 무작위로 뽑힌 증강 2개가 즉시 함께 지급된다. 이미 가진 증강과 같이 쓸 수 없는 조합(상호 배제)이나 이 모드에서 쓰이지 않는 증강은 후보에서 빠지므로, 손패 장수나 화료형이 어긋나 국이 망가지는 일은 없다.\n\n쏟아진 2개는 전원에게 공개된다. 한 사람이 갑자기 증강 셋을 들고 있는 판이 되므로 나머지 셋은 그 조합을 보고 남은 국의 방침을 다시 짜게 된다. 지급은 획득 순간 한 번뿐이며, 그 뒤로는 늘어난 증강들이 각자의 능력으로 남는다.",
  install(ctx) {
    const { holder } = ctx;

    ctx.grantAugments((available) => {
      if (available.length === 0) return [];
      // 게임 진행용 PRNG를 건드리지 않는 독립 시드 — 리플레이·재개에서도 같은 결과
      const prng = new Prng(
        (ctx.engine.state.config.seed ^ hashString(`${ID}:${holder}`)) >>> 0,
      );
      const pool = [...available];
      const chosen: AugmentDef[] = [];
      for (let i = 0; i < GRANT_COUNT && pool.length > 0; i++) {
        chosen.push(...pool.splice(prng.int(pool.length), 1));
      }
      return chosen;
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
