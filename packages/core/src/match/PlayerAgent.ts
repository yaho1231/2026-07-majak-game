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

export interface PlayerAgent {
  readonly id: PlayerId;
  /** 닉네임 (로비·랭킹 표시용) */
  readonly nickname: string;
  /** 봇 여부 (인게임 표기·랭킹용) */
  readonly isBot: boolean;
  /** 상태 갱신 수신. 봇은 무시하거나 다음 결정에 활용 */
  sendView(view: PlayerView): void;
  /** 부가 서버 메시지 수신 (catalog·roundOver 등). 봇은 생략 가능 */
  notify?(msg: ServerMessage): void;
  /**
   * 결정 요청. offered 중 하나를 반환해야 한다.
   * 타임아웃 처리는 구현체(HumanAgent)의 몫.
   */
  decide(prompt: DecisionPrompt): Promise<ActionOption>;
  /**
   * 드래프트 선택 요청. choices 중 하나의 id를 반환.
   * 타임아웃 시 자동 선택(구현체 책임).
   */
  decideDraft(stage: DraftStage, choices: AugmentDef[]): Promise<string>;
  /**
   * 국 결과 화면을 닫고 다음 국으로 넘어갈 준비가 됐다는 신호를 기다린다.
   * 사람이 "닫기"(또는 자동 닫힘) 신호를 보내면 resolve 한다.
   * 봇·미구현 에이전트는 이 메서드가 없으므로 즉시 진행된다.
   * @param maxWaitMs 이 시간이 지나면 응답이 없어도 자동 resolve (AFK·끊김 안전망).
   */
  awaitContinue?(maxWaitMs: number): Promise<void>;
}
