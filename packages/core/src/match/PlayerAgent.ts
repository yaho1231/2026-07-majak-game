/**
 * PlayerAgent 인터페이스 — 사람과 봇을 동일하게 취급한다.
 *
 * HanchanController는 이 인터페이스만 알고, 사람/봇/관전봇을
 * 구별하지 않는다. 구현은 @majak/server 에 있다.
 *
 * 설계: docs/00_MASTER_ARCHITECTURE.md §5.4, docs/12_NETWORK_REPLAY.md §3
 */

import type { PlayerId } from "../engine/zones/Zone.js";
import type { PlayerView } from "../information/PlayerView.js";
import type { ActionOption, DecisionPrompt } from "../mahjong/flow/FlowController.js";
import type { AugmentDef } from "../augment/Augment.js";
import type { DraftStage, ServerMessage } from "../network/protocol.js";

/**
 * 이 좌석에 «선택 판»이 열렸다 / 닫혔다 — 관전 중계용 신호 (`watchChoices`).
 *
 * 왜 구현체가 알려 줘야 하나: 컨트롤러는 `decide()`를 await할 뿐이라 **어떻게**
 * 끝났는지를 모른다. 시간 초과 폴백도, 더 높은 선언에 접힌 것도, 사람이 실제로
 * 누른 것도 전부 «옵션 하나가 resolve됐다»로 똑같이 보인다. 관전 화면은 그 셋을
 * 구별해 적어야 하므로(고른 것이 있는가) 아는 쪽인 좌석 구현체가 말한다.
 */
export type SeatChoiceEvent =
  | {
      open: true;
      seat: PlayerId;
      /** 지금 그 사람 화면에 서 있는 선택지 전부 (표준 마작 액션 포함 — 거르는 것은 컨트롤러) */
      options: readonly ActionOption[];
      /** 마감 시각 (Date.now 기준). 무제한이면 없다 */
      deadline?: number;
    }
  | {
      open: false;
      seat: PlayerId;
      /** 실제로 고른 것 (시간 초과·취소면 없다) */
      picked?: ActionOption;
    };

export interface PlayerAgent {
  readonly id: PlayerId;
  /** 닉네임 (로비·랭킹 표시용) */
  readonly nickname: string;
  /** 봇 여부 (인게임 표기·랭킹용) */
  readonly isBot: boolean;
  /**
   * 봇의 전략 원형 id (`attacker`·`defender`…). 사람이면 undefined.
   *
   * 표시 전용이다 — "봇1·봇2"만 보이면 셋이 같은 사람으로 읽히는데, 실제로는 미는
   * 정도도 우는 문턱도 다르다. 이 값을 이름표에 세워야 그 차이가 보인다.
   */
  readonly botArchetype?: string;
  /** 상태 갱신 수신. 봇은 무시하거나 다음 결정에 활용 */
  sendView(view: PlayerView): void;
  /**
   * 뷰 브로드캐스트 시 이 좌석 대신 다른 좌석 시점으로 뷰를 받고 싶을 때
   * 그 좌석 id(또는 SPECTATOR_ID)를 돌려준다. null/미구현이면 본인 좌석 기준.
   * 증강 테스트의 시점 전환(관찰) 전용 — 결정(decide)은 항상 본인 좌석으로 처리된다.
   */
  viewSeatOverride?(): PlayerId | null;
  /** 부가 서버 메시지 수신 (catalog·roundOver 등). 봇은 생략 가능 */
  notify?(msg: ServerMessage): void;
  /**
   * 결정 요청. offered 중 하나를 반환해야 한다.
   * 타임아웃 처리는 구현체(HumanAgent)의 몫.
   */
  decide(prompt: DecisionPrompt): Promise<ActionOption>;
  /**
   * 대기 중인 `decide`를 **지금 안전 폴백(패스)으로 끝낸다**.
   *
   * 리액션(후로·론) 프롬프트는 여러 명에게 동시에 나가지만, 우선순위가 더 높은
   * 선언이 이미 들어오면 나머지 사람의 선택은 결과를 바꿀 수 없다 — 그런데도
   * 전원의 응답을 기다리느라, 봇이 이미 론·펑을 부른 뒤에도 사람이 '치'나 '스킵'을
   * 누를 때까지 판이 멈춰 있었다(2026-07-31 사용자 보고). 컨트롤러가 이 메서드로
   * 남은 프롬프트를 접고 즉시 진행한다.
   *
   * 구현체는 클라이언트에 취소를 알리고(버튼이 남지 않게) 폴백으로 resolve한다.
   * 미구현(봇)이면 컨트롤러가 그냥 응답을 기다린다 — 봇은 즉시 답하므로 문제없다.
   */
  cancelDecision?(): void;
  /**
   * 관전 중계 창구를 꽂는다 — 이 좌석에 선택 판이 열리고 닫힐 때마다 부른다.
   *
   * `decideDraft`의 `onCardSwap`과 같은 방식이다: «지금 무엇을 보고 있나»는 결과만
   * 봐서는 복원할 수 없으므로, 그 순간에 알린다. 봇처럼 화면이 없는 구현체는
   * 구현하지 않으면 된다 — 중계할 판이 애초에 없다.
   */
  watchChoices?(watch: (ev: SeatChoiceEvent) => void): void;
  /**
   * **판이 섰다 / 다시 돈다** — 관리자 중계 일시정지 (docs/36 §7).
   *
   * 컨트롤러는 «결정을 시작하기 전»과 «엔진에 넣기 직전»에 문을 닫아 판의 진행
   * 자체를 세우지만, 이미 화면에 떠 있는 좌석의 제한 시간은 그 좌석이 직접 세워야
   * 한다 — 안 그러면 세워 둔 판에서 사람의 30초만 계속 줄어 폴백이 터진다.
   * 봇처럼 제 시계가 없는 구현체는 생략하면 된다.
   */
  setPaused?(paused: boolean): void;
  /**
   * 드래프트 선택 요청. choices(또는 갈아 낀 rerolls) 중 하나의 id를 반환.
   * 타임아웃 시 자동 선택(구현체 책임).
   *
   * @param rerolls 슬롯별 **새로고침 교체분** — `rerolls[i]`가 `choices[i]`를 대신한다.
   *   컨트롤러가 제시와 같은 추첨에서 미리 뽑아 넘긴다(좌석 간 겹침 금지가 여기에도 걸린다).
   *   봇처럼 새로고침을 쓰지 않는 구현체는 그냥 무시하면 된다.
   * @param onCardSwap 슬롯을 갈아 낀 **그 순간** 컨트롤러에 알린다 — 관전 중계가
   *   그 좌석의 카드를 실시간으로 따라 그린다(`SpectateDraftMessage`). 픽이 끝난 뒤에
   *   읽는 `rerolledDraftSlots`로는 «지금 무엇을 보고 있나»를 중계할 수 없다.
   *   새로고침이 없는 구현체(봇)는 부르지 않으면 된다.
   */
  decideDraft(
    stage: DraftStage,
    choices: AugmentDef[],
    rerolls?: readonly AugmentDef[],
    onCardSwap?: (slot: number, choice: AugmentDef) => void,
  ): Promise<string>;
  /**
   * 방금 끝난 드래프트에서 **새로고침으로 갈아 낀 슬롯 번호**.
   *
   * 컨트롤러가 `decideDraft` 직후에 읽어, 픽률 통계의 분모(=화면에 실제로 서 있던 3장)를
   * 맞춘다. 구현하지 않으면 "아무것도 안 갈았다"로 본다 — 봇이 그렇다.
   */
  rerolledDraftSlots?(): readonly number[];
  /**
   * 국 결과 화면을 닫고 다음 국으로 넘어갈 준비가 됐다는 신호를 기다린다.
   * 사람이 "다음 국으로"를 누르면(roundContinue) resolve 한다 —
   * 결과 화면은 스스로 닫히지 않는다.
   * 봇·미구현 에이전트는 이 메서드가 없으므로 즉시 진행된다.
   * @param maxWaitMs 이 시간이 지나면 응답이 없어도 자동 resolve (AFK·끊김 안전망).
   */
  awaitContinue?(maxWaitMs: number): Promise<void>;
}
