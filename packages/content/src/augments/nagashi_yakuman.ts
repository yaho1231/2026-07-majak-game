/**
 * 유국역만 (nagashi_yakuman, prism).
 * 유국(황패평국) 시, 자신의 버림패가 전부 요구패(1·9 수패)나 자패라면 —
 * 본래 "유국만관(流し満貫)"인 이 손을 역만으로 처리한다.
 * 쯔모 역만과 같은 지불(오야 48000 / 자 32000)을 판이 아니라 실제 상대에게서 받는다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b D (52차 버프)
 *
 * ## 이 증강이 부수는 규칙은 정확히 하나 — "울리면 무효"
 *
 * 정통 유국만관은 두 가지를 함께 요구한다.
 *   ① 내 버림이 **전부** 요구패·자패일 것
 *   ② 그 버림을 **아무도 울지 않았을** 것
 *
 * 이 증강은 ②만 없앤다. 상대가 내 요구패를 울어 가도 유국역만은 살아 있다 —
 * 원래는 그 순간 무효가 되어 사실상 장식이었던 손을 실제로 성립시킨다.
 * ①은 그대로다. 요구패가 아닌 패를 한 장이라도 버렸으면 성립하지 않는다.
 *
 * ## 판정은 바닥이 아니라 **버림 이력**으로 한다 (2026-08-03 사용자 확정)
 *
 * 바닥에 남은 패만 보면 규칙이 거꾸로 선다. 5통을 버렸는데 상대가 그걸 울어 가면
 * 5통이 바닥에서 사라져, 남은 버림이 전부 요구패라는 이유로 **없던 역만이 생겼다**.
 * 보유자가 잡패를 일부러 울리기 쉽게 흘리는 것이 최적 전략이 되고, 상대의 정상적인
 * 후로가 자기 자신에게 -16000을 만드는 구조였다(docs/25 역/점수 #13).
 *
 * `round.byPlayer[x].discardedKinds`는 버림 시점의 스냅샷이라 울려 나가도 남는다 —
 * 후리텐 판정이 쓰는 바로 그 이력이다. 이것으로 ①을 판정하면 "무엇을 버렸는가"가
 * 울림 여부와 무관해지고, 이 증강이 부수는 것은 ②뿐이 된다.
 *
 * 구현:
 * - ROUND_SETTLED(outcome=draw) 인터셉터: 유효하면 쯔모 역만 지불을 deltas에 더한다.
 *   노텐 벌점 정산 위에 얹으므로(둘 다 적용) 여러 명이 동시에 유국역만이어도 안전하다.
 * - 역만 방어술(yakuman_shield) 보유자는 이 지불에서 면제된다(완전 면역 연동).
 *   유국은 outcome=draw라 방어술 인터셉터가 잡지 못하므로 여기서 연동한다.
 */

import {
  ROUND_SETTLED,
  SETTLE_STAGE,
  augmentInstanceId,
  defineAugment,
  isSourceDisarmed,
  isTerminalOrHonor,
  playerOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileKind,
} from "@majak/core";
import { settleInterceptor, withAugNoteFor } from "../util.js";
import { giantGodNagashiBaseKey } from "./giant_god.js";

const ID = "nagashi_yakuman";

/**
 * `discardedKinds`의 kindKey("man1"·"wind3")를 TileKind로 되돌린다.
 * 이력은 문자열 스냅샷이라 tileId가 없다 — 종류만 알면 요구패 판정에는 충분하다.
 */
function kindFromKey(key: string): TileKind {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return { suit: "man", rank: 5 }; // 파싱 실패 = 요구패 아님으로 취급
  return { suit: m[1] as TileKind["suit"], rank: Number(m[2]) };
}

/**
 * 유국역만 성립 여부 — **버린 이력 전체**가 요구패·자패이고 하나 이상.
 *
 * 바닥(zones)이 아니라 이력(discardedKinds)을 보는 것이 핵심이다. 울려 나간 패도
 * "내가 버린 패"이므로 판정에 포함된다 — 이 증강이 없애 주는 것은 "울리면 무효"라는
 * 제약이지, "무엇을 버렸는가"가 아니다.
 */
function nagashiValid(state: GameState, holder: PlayerId): boolean {
  const history = state.round.byPlayer[holder]?.discardedKinds ?? [];
  if (history.length === 0) return false;
  /*
   * 거신병 각성은 **버림 이력을 갈아 끼운다** — 요구패 이력을 통째로 지우고 내려보낸
   * 손패(중장패)를 대신 넣는다(13면 후리텐을 푸는 정당한 처리다). 그 결과 각성 조건
   * ("요구패 13종을 내가 전부 버려 뒀다")을 만족한 국에서 이 판정이 거짓이 되어
   * 48,000이 통째로 사라졌다(QA synergy3 shape 확정 3, 2026-08-23).
   *
   * 각성이 남긴 스냅샷의 값은 "각성 직후 이력의 길이"다 — 그 앞은 각성이 만든 가짜
   * 이력이니 건너뛰고, **각성 이후에 실제로 버린 패만** 검사한다(그 뒤 잡패를 버리면
   * 유국역만은 여전히 깨진다).
   */
  const base = state.augmentData[giantGodNagashiBaseKey(state, holder)];
  const rest = typeof base === "number" ? history.slice(base) : history;
  return rest.every((key) => isTerminalOrHonor(kindFromKey(key)));
}

export const nagashiYakuman: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 3,
  name: "유국역만",
  description:
    "(상시) 유국까지 요구패(1·9)와 자패만 버렸다면 유국만관이 역만이 된다. 원래는 그 버림패를 남이 울어 가면 무효가 되지만, 이 증강은 울려도 성립한다.",
  detail:
    "유국까지 내 버림패가 전부 요구패(1·9)·자패이면 유국만관이 역만이 된다 — 남이 울어 갔어도 성립한다.\n\n다른 패를 한 장이라도 버렸으면 안 된다. 역만 방어술을 든 상대는 지불을 면제받지만 내 수령액은 줄지 않는다.",
  install(ctx) {
    const { holder } = ctx;

    // 표준 유국만관을 보유자에게만 끈다 — 이 증강은 그 자리를 **역만으로** 대신한다.
    // 안 끄면 같은 유국에서 만관과 역만을 겹쳐 받는다.
    ctx.setHolderRule("draw.nagashiMangan", false);

    // 유국 정산: 성립 시 쯔모 역만 지불을 얹는다
    // 정산 단계: DrawPatch — 유국 전용 재정산.
    settleInterceptor(ctx, SETTLE_STAGE.DrawPatch, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "draw") return event;
      if (!nagashiValid(ic.state, holder)) return event;

      const dealerSeat = ic.state.round.dealerSeat;
      const holderIsDealer = playerOf(ic.state, holder).seat === dealerSeat;
      const deltas = { ...p.deltas };
      // 유국 정산의 증강 내역 — 유국에는 승자 블록이 없으므로, 여기 남기지 않으면
      // ±32,000이 오간 화면에 근거가 한 줄도 없다.
      let notes = p.augPoints ?? [];
      for (const pl of ic.state.players) {
        if (pl.id === holder) continue;
        // 쯔모 역만: 오야 화료 = 전원 16000 / 자 화료 = 오야 16000·자 8000
        const pay = holderIsDealer ? 16000 : pl.seat === dealerSeat ? 16000 : 8000;

        // 역만 방어술 보유자는 유국역만 지불에서 면제된다 (완전 면역 연동).
        // 단 **무장해제로 잠긴 방어막은 면제하지 않는다** — 보유 문자열만 보면 잠긴
        // 방어막까지 공짜로 막아 줬다(2026-07-29 감사).
        const shielded =
          pl.augments.includes("yakuman_shield") &&
          !isSourceDisarmed(ic.state, augmentInstanceId(pl.id, "yakuman_shield"));

        // **면제분은 뱅크가 낸다** — 화료자 몫은 깎지 않는다.
        //
        // 예전에는 방어막 보유자를 건너뛰면서 화료자 수령까지 같이 줄였다. 자 역만이
        // 32000을 받을 자리에서 남이 방어막을 뽑았다는 이유로 24000이 됐다 —
        // 내 손과 무관한 남의 드래프트 결과가 내 타점을 33% 깎는 것이라
        // 무페널티 원칙(PROJECT_CHARTER)에 어긋난다. 일확천금의 0.5배 굴림을 고칠
        // 때와 같은 판단이다: **한쪽을 지키느라 다른 쪽을 손해 보게 하지 않는다.**
        if (!shielded) {
          deltas[pl.id] = (deltas[pl.id] ?? 0) - pay;
          notes = withAugNoteFor({ ...p, augPoints: notes }, ID, pl.id, -pay);
        }
        deltas[holder] = (deltas[holder] ?? 0) + pay;
        notes = withAugNoteFor({ ...p, augPoints: notes }, ID, holder, pay);
      }
      // 결과 화면의 부제를 갈아 끼운다 — 예전에는 32,000점이 오가는 화면에도
      // 컷인은 그냥 "유 국", 부제는 "패산 소진"이라 역만이라는 말조차 없었다.
      return {
        type: event.type,
        payload: {
          ...p,
          deltas,
          augPoints: notes,
          drawSpecial: {
            augId: ID,
            label: "유국역만 — 버림패가 전부 요구패·자패",
            holder,
          },
        },
      };
    });
  },
});
