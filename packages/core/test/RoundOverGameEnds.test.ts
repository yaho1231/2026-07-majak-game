/**
 * 결과 화면이 «이 국으로 대국이 끝난다»를 **roundOver 안에서** 안다 (2026-09-25, docs/59 U77).
 *
 * 예전에는 종국 판정이 roundOver 뒤에 있어, 마지막 국 결과창도 «다음 국으로»·«N초 뒤에
 * 다음 국이 자동으로 시작됩니다»·«친 넘어감»을 띄웠다 — 눌렀더니 순위표가 뜨는 어긋남.
 * 서버가 판정을 먼저 끝내 `gameEnds`에 싣는다.
 *
 * 이 파일이 못박는 계약:
 *  1. 마지막 roundOver에만 `gameEnds`가 있고, 그 값은 실제 종국 사유(onGameOver)와 같다.
 *  2. 그 앞의 roundOver에는 필드 자체가 없다(옛 메시지와 같은 모양).
 *  3. 관전 합류 재전송(`lastRoundOverMsg`)도 같은 메시지라 필드가 그대로 실린다 — 같은 객체다.
 *
 * 그리고 관전 선택 라벨(`optionLabel`)이 **키 기반**으로 패를 읽는다(docs/59 U65).
 */

import { describe, expect, it, vi } from "vitest";
import { HanchanController, DEFAULT_HANCHAN_CONFIG } from "../src/match/HanchanController.js";
import type { HanchanConfig, SpectatorSink } from "../src/match/HanchanController.js";
import type { PlayerAgent, SeatChoiceEvent } from "../src/match/PlayerAgent.js";
import type { ActionOption, DecisionPrompt } from "../src/mahjong/flow/FlowController.js";
import type { DraftStage, GameEndReason, ServerMessage } from "../src/network/protocol.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { PlayerView } from "../src/information/PlayerView.js";
import { Prng } from "../src/engine/random/Prng.js";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import type { GameState } from "../src/engine/state/GameState.js";
import { createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";
import { DEAD_WALL, WALL, createZone, handZone } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";

class Seat implements PlayerAgent {
  readonly nickname: string;
  readonly isBot = true;
  readonly seen: ServerMessage[] = [];
  watch: ((ev: SeatChoiceEvent) => void) | null = null;
  private readonly rng: Prng;

  constructor(readonly id: string, seed: number) {
    this.nickname = `Bot-${id}`;
    this.rng = new Prng(seed);
  }

  sendView(): void {}
  notify(msg: ServerMessage): void {
    this.seen.push(msg);
  }
  watchChoices(watch: (ev: SeatChoiceEvent) => void): void {
    this.watch = watch;
  }
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    // 화료가 있으면 화료한다 — 국이 빨리 끝나 점수가 움직여야 토비·종국 분기가 선다
    const win = prompt.options.find((o) => o.type === "win");
    if (win !== undefined) return win;
    return prompt.options[this.rng.int(prompt.options.length)] as ActionOption;
  }
  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    return choices[0]?.id ?? "";
  }
}

class RecordingSink implements SpectatorSink {
  readonly msgs: ServerMessage[] = [];
  constructor(readonly id: string) {}
  sendView(_view: PlayerView): void {}
  notify(msg: ServerMessage): void {
    this.msgs.push(msg);
  }
}

async function play(config: Partial<HanchanConfig>): Promise<{
  roundOvers: Extract<ServerMessage, { type: "roundOver" }>[];
  reason: GameEndReason | null;
}> {
  const agents = ["p0", "p1", "p2", "p3"].map((id, i) => new Seat(id, i + 11));
  let reason: GameEndReason | null = null;
  const ctrl = new HanchanController(
    agents,
    { ...DEFAULT_HANCHAN_CONFIG, draftSchedules: [], ...config },
    { onGameOver: (_r, why) => (reason = why) },
  );
  await ctrl.run();
  const roundOvers = agents[0]!.seen.filter(
    (m): m is Extract<ServerMessage, { type: "roundOver" }> => m.type === "roundOver",
  );
  return { roundOvers, reason };
}

/**
 * 오야(p0, 자리 0)가 첫 쯔모에 멘젠 쯔모(1판 30부, 500올)로 화료하는 국 — Hanchan.test.ts의
 * 아가리야메 회귀(gameId 857) 상태를 장풍·국번·점수만 바꿔 쓴다.
 */
function dealerTsumoState(
  wind: number,
  roundNumber: number,
  scoreOf: Record<string, number>,
  /** 오야 자리 — 0이 아니면 p0의 쯔모는 자화(오야 아님)라 국이 넘어간다 */
  dealerSeat = 0,
): GameState {
  const ids = ["p0", "p1", "p2", "p3"];
  const base = createInitialGameState(
    { seed: 7, playerIds: ids },
    { startScore: 25000, redFivesPerSuit: 0 },
  );
  const pool = new Map<string, number[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  const take = (key: string): number => {
    const id = pool.get(key)?.shift();
    if (id === undefined) throw new Error(`no tile left: ${key}`);
    return id;
  };
  const zones = { ...base.zones };
  zones[handZone("p0")] = {
    ...createZone(handZone("p0"), "hand", "p0"),
    tileIds: [
      "man1", "man2", "man3", "man2", "man3", "man4",
      "pin4", "pin5", "pin6", "sou7", "sou8", "sou9", "sou5",
    ].map(take),
  };
  const winning = take("sou5");
  const indicator = take("wind1");
  let rest = [...pool.values()].flat().sort((a, b) => a - b);
  ids.slice(1).forEach((p, i) => {
    zones[handZone(p)] = {
      ...createZone(handZone(p), "hand", p),
      tileIds: rest.filter((_, k) => k % 3 === i).slice(0, 13),
    };
  });
  const dealt = new Set(ids.slice(1).flatMap((p) => zones[handZone(p)]!.tileIds));
  rest = rest.filter((id) => !dealt.has(id));
  zones[DEAD_WALL] = {
    ...createZone(DEAD_WALL, "deadWall"),
    tileIds: [...rest.slice(0, 4), indicator, ...rest.slice(4, 13)],
  };
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: [winning, ...rest.slice(13)] };
  return {
    ...base,
    zones,
    players: base.players.map((p) => ({ ...p, score: scoreOf[p.id]! })),
    round: {
      ...base.round,
      prevalentWind: wind,
      roundNumber,
      honba: 0,
      dealerSeat,
      phase: "turn.draw",
      turnSeat: 0,
      firstTurn: false,
      doraIndicators: [zones[DEAD_WALL].tileIds[4] as number],
    },
  };
}

async function resumeFrom(
  state: GameState,
  config: Partial<HanchanConfig>,
): Promise<{
  roundOvers: Extract<ServerMessage, { type: "roundOver" }>[];
  reason: GameEndReason | null;
  drafts: string[];
}> {
  const agents = ["p0", "p1", "p2", "p3"].map((id, i) => new Seat(id, i + 21));
  let reason: GameEndReason | null = null;
  const ctrl = new HanchanController(
    agents,
    { ...DEFAULT_HANCHAN_CONFIG, draftSchedules: [], seed: 857, ...config },
    { onGameOver: (_r, why) => (reason = why) },
  );
  // 중반 드래프트가 열렸는가 — runDraft는 private이라 인스턴스에 스파이를 건다
  const drafts: string[] = [];
  const spy = vi.spyOn(ctrl as unknown as { runDraft: (g: unknown, s: string) => Promise<void> }, "runDraft");
  spy.mockImplementation(async (_g, stage) => {
    drafts.push(stage);
  });
  await ctrl.resume(createStandardGameFromState(state));
  const roundOvers = agents[0]!.seen.filter(
    (m): m is Extract<ServerMessage, { type: "roundOver" }> => m.type === "roundOver",
  );
  return { roundOvers, reason, drafts };
}

function expectOnlyLastEnds(
  roundOvers: Extract<ServerMessage, { type: "roundOver" }>[],
  reason: GameEndReason | null,
): void {
  expect(roundOvers.length, "국이 한 번도 끝나지 않았다").toBeGreaterThan(0);
  expect(reason).not.toBeNull();
  const last = roundOvers[roundOvers.length - 1]!;
  expect(last.gameEnds, "마지막 국 결과창이 종국을 모른다").toBe(reason);
  for (const m of roundOvers.slice(0, -1)) {
    expect("gameEnds" in m, "끝나지 않는 국인데 종국 표식이 실렸다").toBe(false);
  }
}

describe("roundOver.gameEnds — 마지막 국 결과창은 종국을 안다", () => {
  it("동풍전 끝까지 — 마지막 roundOver에만 실제 종국 사유가 실린다", async () => {
    const { roundOvers, reason } = await play({ maxWind: 1, seed: 7 });
    expectOnlyLastEnds(roundOvers, reason);
  }, 30_000);

  it("토비 — 0점 미만이 나온 국의 결과창에 «dobi»가 실린다", async () => {
    // 동1국 오야 p0가 첫 쯔모에 500올 — 300점이던 p1이 -200이 된다
    const { roundOvers, reason } = await resumeFrom(
      dealerTsumoState(1, 1, { p0: 25000, p1: 300, p2: 25000, p3: 49700 }),
      { dobi: true },
    );
    expect(roundOvers).toHaveLength(1);
    expect(reason).toBe("dobi");
    expectOnlyLastEnds(roundOvers, reason);
  }, 30_000);

  it("토비 규칙이 꺼져 있으면 같은 국이 끝나도 다음 국이 이어진다 — 표식이 없다", async () => {
    const { roundOvers, reason } = await resumeFrom(
      dealerTsumoState(1, 1, { p0: 25000, p1: 300, p2: 25000, p3: 49700 }),
      { dobi: false, maxWind: 1 },
    );
    expect(roundOvers.length).toBeGreaterThan(1);
    expect("gameEnds" in roundOvers[0]!).toBe(false);
    expectOnlyLastEnds(roundOvers, reason);
  }, 30_000);

  it("아가리야메 — 오라스 오야가 화료해 반환점을 넘긴 단독 1위면 그 국 결과창에 실린다", async () => {
    // 남4국 오야 p0가 500올로 29000 → 30500 단독 1위
    const { roundOvers, reason } = await resumeFrom(
      dealerTsumoState(2, 4, { p0: 29000, p1: 24000, p2: 23500, p3: 23500 }),
      { dobi: false },
    );
    expect(roundOvers).toHaveLength(1);
    expect(reason).toBe("agariYame");
    expectOnlyLastEnds(roundOvers, reason);
  }, 30_000);
});

describe("끝나는 판은 중반 드래프트를 열지 않는다 (W5 통합 리뷰 regression-1)", () => {
  // 동풍전(maxWind 1)·서입 없음에서 동4국 자화(p0, 오야는 p3)로 국이 남1국으로 넘어가면 그 자리에서
  // 끝난다(normal). 그런데 남1국 진입은 southEntry 드래프트의 트리거이기도 하다 — 예전에는 결과창이
  // «최종 결과 보기»라 한 뒤 증강 선택창이 떴다.
  it("preEnd가 있으면 트리거 국이어도 드래프트 없이 끝나고 결과창 표식과 사유가 같다", async () => {
    const { roundOvers, reason, drafts } = await resumeFrom(
      dealerTsumoState(1, 4, { p0: 25000, p1: 25000, p2: 25000, p3: 25000 }, 3),
      { dobi: false, maxWind: 1, westEntry: false, draftSchedules: ["southEntry"] },
    );
    expect(roundOvers).toHaveLength(1);
    expect(reason).toBe("normal");
    expect(drafts, "끝나는 판에서 드래프트가 열렸다").toEqual([]);
    expectOnlyLastEnds(roundOvers, reason);
  }, 30_000);

  it("끝나지 않는 판이면 같은 트리거에서 드래프트가 그대로 열린다", async () => {
    // 반장전(maxWind 2)이면 남1국 진입은 종국이 아니다 — southEntry 드래프트가 열린다
    const { drafts } = await resumeFrom(
      dealerTsumoState(1, 4, { p0: 25000, p1: 25000, p2: 25000, p3: 25000 }, 3),
      { dobi: false, maxWind: 2, draftSchedules: ["southEntry"] },
    );
    expect(drafts[0]).toBe("southEntry");
  }, 30_000);
});

describe("관전 선택 라벨 — 패는 패 id 키에서만 읽는다 (docs/59 U65)", () => {
  it("연금술 delta·파혼 meldIndex·붉은 손길 rank는 패 그림(kindKey)이 되지 않는다", async () => {
    const agents = ["p0", "p1", "p2", "p3"].map((id, i) => new Seat(id, i + 1));
    const ctrl = new HanchanController(agents, {
      ...DEFAULT_HANCHAN_CONFIG,
      maxWind: 1,
      seed: 7,
      draftSchedules: [],
    });
    const sink = new RecordingSink("spec");
    ctrl.addSpectator(sink);
    // 판이 실제로 돌아야 state가 있다 — 첫 뷰가 나가는 자리에서 선택 판을 세운다
    let armed = false;
    agents[0]!.sendView = (): void => {
      if (armed) return;
      armed = true;
      agents[0]!.watch!({
        open: true,
        seat: "p0",
        options: [
          { type: "alchemy", payload: { tileId: 3, delta: 1 } },
          { type: "alchemy", payload: { tileId: 3, delta: -1 } },
          { type: "meld_dissolve", payload: { meldIndex: 0 } },
          { type: "red_touch", payload: { rank: 5 } },
          { type: "disarm", payload: { target: "p2", augmentId: "swamp" } },
        ],
      });
    };
    await ctrl.run();
    expect(armed).toBe(true);
    const msg = sink.msgs.find((m) => m.type === "spectateChoice") as
      | Extract<ServerMessage, { type: "spectateChoice" }>
      | undefined;
    expect(msg).toBeDefined();
    const labels = msg!.options.map((o) => o.label);
    // 패 id 키(tileId)는 kindKey로 — 3번 패는 man·pin·sou·wind·dragon 중 하나다
    expect(labels[0]).toMatch(/^alchemy [a-z]+\d \+1$/);
    expect(labels[1]).toMatch(/^alchemy [a-z]+\d -1$/);
    // 순번·숫자 인자는 숫자 그대로 — 예전에는 0번·5번 패의 그림이 됐다
    expect(labels[2]).toBe("meld_dissolve 0");
    expect(labels[3]).toBe("red_touch 5");
    // 좌석 id는 그대로 둔다 — 이름은 화면(ChoiceLabel)이 뷰에서 찾는다
    expect(labels[4]).toBe("disarm p2 swamp");
  }, 30_000);
});
