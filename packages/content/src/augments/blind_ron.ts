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
 * - 이 효과는 홀더가 아니라 **판 전체**에 걸린다. 그래서 몇 명이 들고 있든 재배선은
 *   **국당 정확히 한 번**이어야 한다 — payload 표식(`blindRonApplied`)으로 잠근다
 *   (`die_hard`의 ReviveMark·`devils_advance`의 BurstMark와 같은 패턴).
 * - 무작위 대상은 `(게임 시드 ⊕ 국 ⊕ 쏜 사람)`에서 파생한 **독립 PRNG**로 뽑는다.
 *   게임 진행용 PRNG를 소비하지 않아 패산이 흔들리지 않고, 리플레이·재개에서 같다.
 * - 더블론처럼 한 사람이 여러 화료자에게 무는 경우, 그 지불 **전체**가 같은 대상에게
 *   옮겨 간다 — 총알 한 발이 한 사람에게 박히는 그림이다.
 * - 쯔모는 애초에 쏜 사람이 없으므로 건드리지 않는다.
 */

import {
  AUGMENT_DISARMED,
  Prng,
  ROUND_SETTLED,
  SETTLE_STAGE,
  augmentDataSet,
  defineAugment,
} from "@majak/core";
import type {
  AugmentDef,
  AugmentDisarmedPayload,
  PlayerId,
  ProposedEvent,
  RoundSettledPayload,
} from "@majak/core";
import {
  armOnNextRound,
  armedNow,
  roundKey,
  roundViewKey,
  settleInterceptor,
  withAugNoteFor,
} from "../util.js";
import { installPreArmRecharge, rechargeBotPolicy } from "./preArmRecharge.js";

const ID = "blind_ron";

/**
 * 이번 정산에서 재배선이 이미 끝났다는 표식 (인터셉터 → 인터셉터 신호).
 *
 * 인터셉터는 `ctx.instanceId` 단위로 등록되므로 **보유자 수만큼** 돈다. 그런데
 * 이동량 `owed`는 재배선의 영향을 받지 않는 `winInfos`에서 다시 재기 때문에, 두 번째
 * 인스턴스는 "이미 옮겨졌다"를 볼 수 없어 **같은 이동을 한 번 더** 얹었다 — 8000점 론
 * 하나로 쏜 사람이 +8000을 **벌고** 엉뚱하게 맞은 사람이 16000을 무는 그림이 됐다
 * (2026-08-22 QA aug-1 확정 1). 총합은 0이라 합계 불변식으로는 잡히지 않는다.
 *
 * 이 증강의 효과는 홀더 개인이 아니라 **그 국의 모든 론**에 걸리므로, 몇 명이 들고
 * 있든 재배선은 한 번이면 충분하고 한 번이어야 맞다.
 */
interface BlindRonMark {
  blindRonApplied?: boolean;
}

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
    "(획득 즉시 · 이번 국만 · 반장전은 게임 내 1회 재장전) 이 국의 모든 론이 네 명 중 무작위 한 명에게 청구된다. 화료자 자신이 뽑히면 손의 화료점을 자기가 문다.",
  detail:
    "이 국의 론은 지불자가 다시 뽑힌다 — 대상은 보유자를 포함해 자리에 앉은 넷 전부에서 고르고, 쯔모에는 적용되지 않는다. 옮겨 가는 것은 손의 지불분이며 공탁·본장은 원래대로 정산된다.\n\n켜지는 순간 전원에게 공개된다.\n\n반장전에서는 게임 내 1회, 자기 순에 **다시 장전**할 수 있다 — 누르면 그 자리에서 곧바로 그 국에 켜진다. (동풍전에는 없다.)",
  install(ctx) {
    const { holder } = ctx;

    // 획득 뒤 처음 시작되는 국 하나에만 켜진다.
    // 켜지는 순간 전원 공개 — 이 국의 론이 어디로 날아갈지 모른다는 것을 모두가 안다.
    // 켜지는 순간의 공개 표시 — 국 시작 자동 발동과 재무장이 **같은 이벤트**를 낸다
    const announce = (): ProposedEvent<string, unknown>[] => [
      augmentDataSet(roundViewKey("*", `${ID}:${holder}`), true),
    ];
    armOnNextRound(ctx, ID, announce);

    /*
     * 반장전 한정 — 게임 내 1회, 원하는 타이밍에 다시 장전한다.
     * 국이 두 배인 판에서 "그 국 하나"의 비중이 절반이 되는 것을 되돌린다
     * (반장전 QA 2026-08-25, preArmRecharge.ts에 경위가 있다).
     */
    installPreArmRecharge(ctx, ID, announce);

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

    /*
     * 무장해제로 잠기면 표시도 함께 내린다 (2026-08-20 QA disrupt-b 확정 3 ②).
     *
     * 효과 쪽은 게이트가 정상적으로 막는데 전원 공개 표시만 남아, 상대들은 이 국의
     * 론이 여전히 어디로 날아갈지 모른다고 믿었다 — 잠긴 증강이 화면에서는 살아
     * 있는 셈이라 정보가 틀린다. 초읽기(time_pressure)와 같은 처리다.
     */
    ctx.reaction(AUGMENT_DISARMED, (event, rc) => {
      const p = event.payload as AugmentDisarmedPayload;
      if (p.augmentId !== ID || p.target !== holder) return;
      const key = roundViewKey("*", `${ID}:${holder}`);
      if (rc.state.augmentData[key] === undefined) return;
      rc.emit(augmentDataSet(key, ""));
    });

    // 정산 단계: Redistribute — 지불자만 재배선(총액 불변). 방어(Shield)보다 먼저 돌아야
    // 엉뚱하게 맞은 사람의 방어 증강이 "새로 부과된 지불"을 보고 막을 수 있다.
    settleInterceptor(ctx, SETTLE_STAGE.Redistribute, (event, ic) => {
      const p = event.payload as RoundSettledPayload & BlindRonMark;
      if (p.outcome !== "win") return event;
      if (!armedNow(ic.state, ID, holder)) return event;
      // 다른 보유자의 인스턴스가 이미 이 국의 총알을 날렸다 — 두 번 쏘지 않는다.
      if (p.blindRonApplied === true) return event;

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
        /*
         * 옮기는 것은 **손의 지불분뿐**이다 — 본장 가산분은 쏜 사람이 그대로 문다
         * (detail: "공탁·본장은 원래대로 정산된다").
         *
         * 예전에는 `-deltas[shooter]`를 통째로 옮겼는데, 론의 지불 델타에는 본장
         * 가산분(300×본장)이 이미 섞여 있어 남의 연장료까지 엉뚱한 사람이 물었다
         * (QA disrupt-b 확정 5). 파오분은 책임자가 따로 무는 돈이라 뺀다.
         */
        const hand = (p.winInfos ?? [])
          .filter((w) => w.winType === "ron" && w.from === shooter)
          .reduce((sum, w) => sum + w.points - (w.pao?.points ?? 0), 0);
        /*
         * **지금 그가 실제로 무는 것보다 많이 되돌려 줄 수는 없다** (2026-08-23 QA
         * synergy3 score 확정 1). 같은 `Redistribute` 단계의 다른 재배선(책임전가)이
         * 먼저 돌아 지불을 셋으로 흩어 놓으면, WinInfo의 원본 금액을 그대로 환급하는
         * 순간 **쏜 사람이 흑자가 된다** — 8판 24,000 론에서 방총자가 +16,000을 벌고
         * 총알을 맞은 사람이 손값보다 많은 32,000을 물었다(총합은 0이라 드리프트
         * 검사에도 안 걸렸다). 현재 음수 델타로 자르면 어느 쪽이 먼저 돌든
         * "쏜 사람이 이득을 본다"가 성립하지 않는다.
         */
        const owed = Math.min(hand, Math.max(0, -(deltas[shooter] ?? 0)));
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
      return {
        type: event.type,
        payload: { ...p, deltas, augPoints: notes, blindRonApplied: true },
      };
    });
  },
  // 자동 발동이라 선택 지점이 없었지만, 반장전 재장전 버튼만은 봇도 눌러야 한다
  // (정책이 없으면 봇은 그 버튼을 영영 누르지 않는다).
  bot: rechargeBotPolicy(ID),
});
