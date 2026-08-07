/**
 * SandboxBotAgent — 증강 테스트 방의 봇. 평소에는 그냥 BotAgent지만,
 * 관리자가 **이 좌석 시점으로 들어와 조종하는 동안**에는 결정을 사람에게 넘긴다.
 *
 * 왜 봇 자리를 직접 두게 하나: 증강 중에는 "상대가 이 패를 이 타이밍에 버려야"
 * 비로소 확인되는 것(론 조건·후로 반응·상대 발동형 증강)이 많다. 봇이 알아서 치면
 * 그 상황을 만들 수가 없다. 그래서 시점 전환에 조작권을 얹었다.
 *
 * 조종 중 결정은 `HumanAgent.decideAs(seat, prompt)`로 나가고, 클라이언트는
 * `action.seat`에 그 좌석을 실어 답한다 — 내 좌석 프롬프트와 섞이지 않는다.
 * 조종을 놓으면(시점 이동·모드 끔) 대기 중이던 결정은 즉시 봇에게 돌아간다.
 */

import type { ActionOption, DecisionPrompt } from "@majak/core/mahjong/flow/FlowController.js";
import { BotAgent } from "./BotAgent.js";
import type { HumanAgent } from "./HumanAgent.js";

export class SandboxBotAgent extends BotAgent {
  /** 지금 이 좌석을 조종 중인 사람 (없으면 봇이 스스로 둔다) */
  private controller: HumanAgent | null = null;
  /** 조종 해제를 기다리는 결정들을 깨우는 신호 */
  private releaseWaiters: (() => void)[] = [];

  /**
   * 이 좌석의 조종자를 지정·해제한다.
   * 해제 시 이미 사람에게 넘어가 대기 중인 결정이 있으면 즉시 회수해 봇이 잇는다
   * (안 그러면 30초 타임아웃까지 판이 멈춘다).
   */
  setController(human: HumanAgent | null): void {
    if (this.controller === human) return;
    const prev = this.controller;
    this.controller = human;
    if (prev !== null) {
      const waiters = this.releaseWaiters;
      this.releaseWaiters = [];
      for (const w of waiters) w();
    }
  }

  /** 지금 사람이 조종 중인가 */
  get controlledBy(): HumanAgent | null {
    return this.controller;
  }

  /**
   * 조종자가 바뀌면(A→B) **새 조종자에게 다시 묻는다.**
   *
   * 예전에는 해제 신호를 받으면 곧장 봇 판단으로 넘어갔다. 시점을 A에서 B로 옮기는
   * 것은 "조종을 놓는다"가 아니라 "조종자가 바뀐다"인데, 그 자리에서 진행 중이던
   * 프롬프트가 **봇에게 떨어져** B는 자기가 잡은 좌석의 첫 결정을 보지도 못했다.
   * 그래서 루프로 두고, 조종자가 아직 있으면 그 사람에게 다시 낸다.
   */
  override async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    for (;;) {
      const human = this.controller;
      if (human === null) return super.decide(prompt);

      /**
       * 해제 신호를 기다리는 손잡이. **응답을 받으면 반드시 걷어낸다** — 예전에는
       * 그냥 밀어 넣기만 해서 `releaseWaiters`가 결정마다 한 칸씩 자랐다. 배열은
       * 조종을 놓을 때에만 비워지므로, 조종을 켠 채 한 반장전을 두면 수백 개의
       * 죽은 클로저가 쌓인 채로 매번 전부 호출됐다.
       */
      let waiter: (() => void) | null = null;
      const released = new Promise<null>((resolve) => {
        waiter = (): void => resolve(null);
        this.releaseWaiters.push(waiter);
      });
      const drop = (): void => {
        const i = waiter === null ? -1 : this.releaseWaiters.indexOf(waiter);
        if (i >= 0) this.releaseWaiters.splice(i, 1);
      };

      const answer = await Promise.race([
        human.decideAs(this.id, prompt).then((option) => ({ option })),
        released,
      ]);
      drop();
      if (answer !== null) return answer.option;

      // 조종이 풀렸다 — 사람 쪽 대기를 접는다. 새 조종자가 있으면 그쪽에 다시 묻고,
      // 아무도 없으면 봇의 판단으로 잇는다(루프 첫머리의 null 분기).
      human.cancelDecisionFor(this.id);
    }
  }

  /**
   * 상위 선언이 확정돼 이 결정이 무의미해졌다 — 조종 중이면 사람 쪽 프롬프트를 접고,
   * 봇이 스스로 두는 중이면 남은 생각 시간을 끊는다(`BotAgent.cancelDecision`).
   */
  override cancelDecision(): void {
    this.controller?.cancelDecisionFor(this.id);
    super.cancelDecision();
  }
}
