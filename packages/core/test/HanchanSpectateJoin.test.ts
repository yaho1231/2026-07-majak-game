/**
 * **결과 화면 도중에 붙은 관전석도 그 국의 결과를 본다** (docs/36 D4 · QA 2차 spectate 확정 7).
 *
 * `roundOver`는 국이 끝나는 순간 한 번 나가는 일회성 메시지다. 그래서 결과 화면
 * 구간에 합류한 관전석에는 영영 가지 않았다 — 합류 뷰의 `phase`는 `round.over`인데
 * 역·판·부·`revealedHands`·`settle`도 우라도라도 없으니, «결과 화면인 것은 아는데
 * 결과는 모르는» 빈 화면이 다음 국이 시작될 때까지 떠 있었다.
 *
 * 대회 중계에서 탁자를 옮기는 순간이 정확히 「방금 큰 판이 났다」는 순간이다.
 * D4 탁자 전환기의 실제 용도가 「리치 걸린 탁자로 옮긴다」이고, 그 직후가 이 사각의
 * 정면이다. 고침은 `catalogMsg`를 들고 있다가 합류할 때 다시 보내는 것과 **같은 방식**
 * 이다 — 새 메시지 타입도 새 경로도 만들지 않는다.
 *
 * 짝이 되는 반대편도 함께 못 박는다: **국이 시작되면 지난 국의 결과는 더 이상 안 간다.**
 * 안 그러면 국 중간에 붙은 관전석이 지난 국의 결과 패널을 받아 화면이 거꾸로 어긋난다.
 */

import { describe, expect, it } from "vitest";
import { HanchanController, DEFAULT_HANCHAN_CONFIG } from "../src/match/HanchanController.js";
import type { HanchanConfig, SpectatorSink } from "../src/match/HanchanController.js";
import type { PlayerAgent } from "../src/match/PlayerAgent.js";
import type { ActionOption, DecisionPrompt } from "../src/mahjong/flow/FlowController.js";
import type { DraftStage, ServerMessage } from "../src/network/protocol.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { PlayerView } from "../src/information/PlayerView.js";
import { Prng } from "../src/engine/random/Prng.js";

/** 최소 봇 — 무엇이 뽑히든 상관없다. 여기서 보는 것은 관전석이 받는 것뿐이다. */
class QuietAgent implements PlayerAgent {
  readonly nickname: string;
  readonly isBot = true;
  private readonly rng: Prng;

  constructor(
    readonly id: string,
    seed: number,
    /** 결과 화면(`roundOver`)을 받은 순간 부른다 — 관전석이 «지금» 붙는 자리다. */
    private readonly onRoundOver?: () => void,
  ) {
    this.nickname = `Bot-${id}`;
    this.rng = new Prng(seed);
  }

  sendView(): void {}

  notify(msg: ServerMessage): void {
    if (msg.type !== "roundOver") return;
    /*
     * **마이크로태스크로 미룬다.** 지금은 `notifyAll`이 좌석들을 도는 한가운데라,
     * 여기서 곧바로 `addSpectator`를 부르면 그 뒤에 이어지는 관전자 루프가 방금
     * 넣은 sink 까지 훑어 결과가 두 번 간다 — 이 테스트가 재는 것과 다른 상황이 된다.
     * 한 틱 미루면 `notifyAll`이 끝난 «결과 화면이 떠 있는 구간»에 정확히 들어간다.
     */
    queueMicrotask(() => this.onRoundOver?.());
  }

  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const opts = prompt.options;
    return opts[this.rng.int(opts.length)] as ActionOption;
  }

  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    return choices[0]?.id ?? "";
  }
}

/** 관전석 하나 — 받은 것을 그대로 쌓아 둔다. */
class RecordingSink implements SpectatorSink {
  readonly views: PlayerView[] = [];
  readonly msgs: ServerMessage[] = [];
  constructor(readonly id: string) {}
  sendView(view: PlayerView): void {
    this.views.push(view);
  }
  notify(msg: ServerMessage): void {
    this.msgs.push(msg);
  }
  types(): string[] {
    return this.msgs.map((m) => m.type);
  }
}

const CFG: Partial<HanchanConfig> = {
  ...DEFAULT_HANCHAN_CONFIG,
  maxWind: 1,
  westEntry: false,
  dobi: false,
  draftSchedules: [],
  seed: 7,
  // 결과 화면이 실제로 «떠 있는» 구간을 만든다 — 0이면 국과 국 사이가 없다시피 하다.
  interRoundDelayMs: 300,
};

describe("HanchanController — 결과 화면 도중 합류한 관전석", () => {
  it("합류 직후에 그 국의 결과(roundOver)와 뒷도라를 받는다", async () => {
    /** 첫 결과 화면에서 붙인 관전석. */
    const late = new RecordingSink("late");
    let joined = false;
    let ctrl: HanchanController;
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) =>
        new QuietAgent(id, i + 1, () => {
          if (joined) return; // 첫 국의 결과 화면에서 한 번만
          joined = true;
          ctrl.addSpectator(late);
        }),
    );
    ctrl = new HanchanController(agents, CFG);
    await ctrl.run();

    expect(joined, "국이 하나도 안 끝났다 — 이 테스트가 노리는 자리가 아니다").toBe(true);
    const first = late.msgs.find((m) => m.type === "roundOver");
    expect(
      first,
      `합류한 관전석이 지금 떠 있는 국의 결과를 못 받았다 — 빈 결과 화면이 뜬다. 받은 것=${late.types().join(",")}`,
    ).toBeDefined();
    // 결과 패널이 실제로 그릴 수 있는 내용이어야 한다 — 「왔다」만으로는 부족하다.
    expect((first as { settle?: unknown }).settle, "결과에 정산이 없다").toBeDefined();

    // 뷰는 결과 **앞에** 온다 — 패널은 뷰 위에 얹히는 것이라 순서가 뒤집히면 깜빡인다.
    const viewIdx = late.msgs.findIndex((m) => m.type === "view");
    const overIdx = late.msgs.findIndex((m) => m.type === "roundOver");
    if (viewIdx >= 0) expect(viewIdx).toBeLessThan(overIdx);
    // 합류 뷰에 뒷도라가 실렸는가는 화료로 끝난 국에서만 의미가 있다 —
    // 유국이면 우라가 없는 것이 정답이라 값 자체로 갈라 본다.
    const over = first as { outcome: string; uraDoraIndicators?: number[] };
    if (over.outcome === "win" && (over.uraDoraIndicators?.length ?? 0) > 0) {
      expect(
        late.views[0]?.round.uraDoraIndicators,
        "결과 화면에 합류했는데 뷰의 뒷도라가 비어 있다 — 화면의 두 자리가 어긋난다",
      ).toEqual(over.uraDoraIndicators);
    }
  }, 30_000);

  it("국이 시작된 뒤에 붙으면 지난 국의 결과는 오지 않는다", async () => {
    const mid = new RecordingSink("mid");
    let armed = false;
    let ctrl: HanchanController;
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) =>
        new QuietAgent(id, i + 1, () => {
          // 첫 국이 끝난 것을 보고, **다음 국이 돌기 시작한 뒤** 붙는다.
          if (armed) return;
          armed = true;
          setTimeout(() => ctrl.addSpectator(mid), CFG.interRoundDelayMs! + 60);
        }),
    );
    ctrl = new HanchanController(agents, CFG);
    await ctrl.run();

    expect(armed, "국이 하나도 안 끝났다 — 이 테스트가 노리는 자리가 아니다").toBe(true);
    /*
     * 합류 **직후에** 받은 것만 본다. 붙은 뒤로는 이 관전석도 정상 스트림을 받으므로
     * 다음 국의 `roundOver`가 오는 것은 당연하다 — 지난 국의 것을 «다시» 받았는가만이
     * 이 테스트의 관심사다. 그래서 합류하자마자 오는 첫 뷰 이전 구간을 본다.
     */
    const firstView = mid.msgs.findIndex((m) => m.type === "view");
    const before = firstView < 0 ? mid.msgs : mid.msgs.slice(0, firstView + 1);
    expect(
      before.some((m) => m.type === "roundOver"),
      "국 중간에 붙었는데 지난 국의 결과 패널이 왔다 — 화면이 거꾸로 어긋난다",
    ).toBe(false);
  }, 30_000);
});
