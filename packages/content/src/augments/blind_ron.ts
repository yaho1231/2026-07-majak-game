/**
 * 눈먼 총알 (blind_ron, prism) — "쏜 사람이 아니라, 아무나 맞는다".
 *
 * 뽑는 순간 자동으로 발동해 **그 국 하나 동안** 테이블의 **모든 론**이 엉뚱한 곳으로
 * 날아간다. 론의 지불자가 실제로 쏜 사람이 아니라 **네 명 중 무작위 한 명**으로
 * 다시 정해진다 — 자기 자신이 뽑힐 확률도 똑같이 25%다.
 *
 * 화료자 본인이 뽑히면 받을 점수를 자기가 내므로 그 화료는 **실질 0점**이 된다.
 * 즉 이 국에는 "안전패"라는 개념이 통째로 사라진다 — 아무것도 안 버리고 앉아 있어도
 * 남의 방총이 내 지갑을 열 수 있다.
 *
 * 구현: 정산 인터셉터 하나(`Redistribute` 단계 — 지불자만 재배선, 총액 불변).
 * - 무작위 대상은 `(게임 시드 ⊕ 국 ⊕ 쏜 사람)`에서 파생한 **독립 PRNG**로 뽑는다.
 *   게임 진행용 PRNG를 소비하지 않아 패산이 흔들리지 않고, 리플레이·재개에서 같다.
 * - 더블론처럼 한 사람이 여러 화료자에게 무는 경우, 그 지불 **전체**가 같은 대상에게
 *   옮겨 간다 — 총알 한 발이 한 사람에게 박히는 그림이다.
 * - 쯔모는 애초에 쏜 사람이 없으므로 건드리지 않는다.
 */

import {
  Prng,
  ROUND_SETTLED,
  SETTLE_STAGE,
  augmentDataSet,
  defineAugment,
} from "@majak/core";
import type { AugmentDef, PlayerId, RoundSettledPayload } from "@majak/core";
import {
  armOnNextRound,
  armedNow,
  roundKey,
  roundViewKey,
  settleInterceptor,
  withAugNoteFor,
} from "../util.js";

const ID = "blind_ron";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const blindRon: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 1,
  name: "눈먼 총알",
  description:
    "증강을 뽑은 국에만 적용되며, 이 국의 모든 론이 네 명 중 무작위 한 명에게 청구된다. 화료자도 포함될 수 있으며 이 경우 그 화료는 ±0점이 된다.",
  detail:
    "대상은 자리에 앉은 넷 전부에서 고르므로 보유자도 25%로 맞는다. 쯔모에는 적용되지 않고, 더블론처럼 한 사람이 여럿에게 물 때는 그 지불 전체가 같은 한 명에게 옮겨 간다. 켜지는 순간 전원에게 공개되고 국이 끝나면 저절로 꺼진다.",
  install(ctx) {
    const { holder } = ctx;

    // 획득 뒤 처음 시작되는 국 하나에만 켜진다.
    // 켜지는 순간 전원 공개 — 이 국의 론이 어디로 날아갈지 모른다는 것을 모두가 안다.
    armOnNextRound(ctx, ID, () => [
      augmentDataSet(roundViewKey("*", `${ID}:${holder}`), true),
    ]);

    /*
     * 그 국이 끝나는 순간 표시를 내린다.
     *
     * 국 스코프 키는 **다음 국이 시작될 때** 지워진다(setupRound). 그런데 국이 끝나고
     * 다음 국이 시작되기까지 정산 화면과 증강 드래프트가 통째로 끼어 있어서, 이미
     * 효과가 끝난 "눈먼 총알 발동" 표시가 그 내내 이름표에 서 있었다
     * (2026-08-12 사용자 지적: 해당 국이 지났는데도 표시가 남아 있음).
     * 값을 비우면 PlayerView가 채널 자체를 내려보내지 않는다.
     */
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      const key = roundViewKey("*", `${ID}:${holder}`);
      if (rc.state.augmentData[key] === undefined) return;
      rc.emit(augmentDataSet(key, ""));
    });

    // 정산 단계: Redistribute — 지불자만 재배선(총액 불변). 방어(Shield)보다 먼저 돌아야
    // 엉뚱하게 맞은 사람의 방어 증강이 "새로 부과된 지불"을 보고 막을 수 있다.
    settleInterceptor(ctx, SETTLE_STAGE.Redistribute, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      if (!armedNow(ic.state, ID, holder)) return event;

      // 이 국에 실제로 쏜 사람들 (더블론이면 한 명이 여러 번 나온다 → 중복 제거)
      const shooters = [
        ...new Set(
          (p.winInfos ?? [])
            .filter((w) => w.winType === "ron" && w.from !== null)
            .map((w) => w.from as PlayerId),
        ),
      ];
      if (shooters.length === 0) return event;

      const seats = ic.state.players.map((pl) => pl.id);
      const deltas = { ...p.deltas };
      let notes = p.augPoints ?? [];
      let moved = 0;
      for (const shooter of shooters) {
        const owed = -(deltas[shooter] ?? 0);
        if (owed <= 0) continue;
        const prng = new Prng(
          (ic.state.config.seed ^
            hashString(`${ID}:${roundKey(ic.state)}:${shooter}`)) >>>
            0,
        );
        const victim = seats[prng.int(seats.length)];
        if (victim === undefined || victim === shooter) continue;
        deltas[shooter] = (deltas[shooter] ?? 0) + owed;
        deltas[victim] = (deltas[victim] ?? 0) - owed;
        moved += owed;
        // 지불자만 바뀌었고 총액도 보유자 수령액도 그대로라 `withAugPoint`에는 남길 것이
        // 없다. 그래도 **당사자 둘의 증감표 줄에는 근거가 있어야 한다** — 쏜 사람은 왜
        // 안 내는지, 엉뚱한 사람은 왜 무는지가 화면에 한 글자도 없었다.
        notes = withAugNoteFor({ ...p, augPoints: notes }, ID, victim, -owed);
        notes = withAugNoteFor({ ...p, augPoints: notes }, ID, shooter, owed);
      }
      if (moved === 0) return event;
      return { type: event.type, payload: { ...p, deltas, augPoints: notes } };
    });
  },
  // 봇 정책 없음 — 자동 발동이라 선택 지점이 없다.
});
