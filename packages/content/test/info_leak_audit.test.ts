/**
 * 정보 누설 전수 감사 (2026-08-02) — 숨겨진 정보가 **프롬프트·연출**로 새지 않는가.
 *
 * 이 게임의 은닉은 두 겹이다.
 *   ① `buildPlayerView` — 뷰에서 안 보이는 것은 클라이언트에 아예 가지 않는다.
 *   ② 그 바깥 — **프롬프트 후보**와 **연출 브로드캐스트**. 여기가 감사의 대상이다.
 *
 * ⚠ 후보 목록이 곧 정보인 이유: `FlowController`는 `validate`를 통과한 후보만 제시한다.
 * 그래서 "가려진 것을 조건으로 거르는" 코드는 그 자리에서 정답을 알려 준다 —
 * 뜨지 않는 후보도, 뜨는 후보도 모두 신호다.
 *
 * 여기서 잠그는 세 가지:
 *   1. 스텔스 리치 발동 연출(actionFx)이 **타가에게 가지 않는다**.
 *   2. 무덤 도굴은 **안개로 가려진 바닥**을 후보로 내지 않는다.
 *   3. 정적의 손도 마찬가지 (보이지 않는 패는 집지 않는다).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_HANCHAN_CONFIG,
  FlowController,
  HanchanController,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  DecisionPrompt,
  DraftStage,
  GameState,
  PlayerAgent,
  PlayerId,
  PlayerView,
  ServerMessage,
} from "@majak/core";
import { craft } from "./helpers.js";
import { graveRob } from "../src/augments/grave_rob.js";
import { silentSwap } from "../src/augments/silent_swap.js";
import { briefFog } from "../src/augments/brief_fog.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function turnOptions(game: Game, player: PlayerId): ActionOption[] {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === player)?.options ?? [];
}

// ───────────── 1. 스텔스 리치 — 발동 연출이 타가에게 가지 않는다 ─────────────

/** 스텔스 리치가 뜨면 무조건 누르고, 나머지는 결정론적으로 첫 후보를 고르는 봇 */
class StealthBot implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  /** 이 좌석이 받은 actionFx의 actionType 목록 */
  readonly fx: string[] = [];
  /** 스텔스 리치를 한 번 관측하면 호출된다 — 게임을 더 돌릴 이유가 없다 */
  onStealthSeen: (() => void) | null = null;
  constructor(
    readonly id: string,
    private readonly grab: boolean,
  ) {
    this.nickname = `B-${id}`;
  }
  sendView(_v: PlayerView): void {}
  notify(msg: ServerMessage): void {
    if (msg.type !== "actionFx") return;
    this.fx.push(msg.actionType);
    if (msg.actionType === "stealth_riichi") this.onStealthSeen?.();
  }
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    if (this.grab) {
      const stealth = prompt.options.find((o) => o.type === "stealth_riichi");
      if (stealth !== undefined) return stealth;
    }
    const pass = prompt.options.find((o) => o.type === "pass");
    if (pass !== undefined) return pass;
    const discards = prompt.options.filter((o) => o.type === "discard");
    return (discards[0] ?? prompt.options[0]) as ActionOption;
  }
  async decideDraft(_s: DraftStage, choices: AugmentDef[]): Promise<string> {
    return choices[0]!.id;
  }
}

describe("스텔스 리치 — 발동 연출(actionFx)이 타가에게 가지 않는다", () => {
  it("보유자만 자기 발동 연출을 받는다", async () => {
    const bots = [
      new StealthBot("p0", true),
      new StealthBot("p1", false),
      new StealthBot("p2", false),
      new StealthBot("p3", false),
    ];
    const ctrl = new HanchanController(bots as unknown as PlayerAgent[], {
      ...DEFAULT_HANCHAN_CONFIG,
      maxWind: 1,
      westEntry: false,
      dobi: false,
      draftSchedules: [],
      seed: 7,
      presetAugments: { p0: ["stealth_riichi"] },
      // 첫 순부터 텐파이 — 무엇을 버려도 스텔스 리치가 성립한다
      presetHands: {
        p0: [
          "man2", "man3", "man4",
          "pin3", "pin4", "pin5",
          "sou3", "sou4", "sou5",
          "sou6", "sou7", "sou8",
          "sou9",
        ],
      },
      extraAugments: [
        // 스텔스 리치 정의는 콘텐츠 팩에서 온다
        (await import("../src/augments/stealth_riichi.js")).stealthRiichi,
      ],
    });
    // 연출이 어느 좌석으로 갔는지만 보면 되므로, 관측되는 즉시 게임을 끝낸다
    // (전 국을 완주시키면 봇 결정만으로 100초가 든다).
    for (const b of bots) b.onStealthSeen = () => ctrl.requestAbort();
    await ctrl.run();

    const p0 = bots[0]!;
    expect(p0.fx).toContain("stealth_riichi"); // 보유자에게는 확인이 간다
    for (const other of bots.slice(1)) {
      expect(other.fx).not.toContain("stealth_riichi"); // 타가에게는 한 번도 가지 않는다
    }
  });
});

// ───────────── 2·3. 안개로 가려진 바닥은 후보가 되지 않는다 ─────────────

/**
 * p1이 박무를 선언해 **모두의 바닥이 장수만** 보이는 국면.
 * p0는 무덤 도굴 + 정적의 손을 들고 자기 순을 맞는다.
 */
function foggedScene(withFog: boolean): Game {
  const base = craft({
    // p0: 2s/5s/8s 대기 텐파이 + 쯔모패 — 무덤에 5s가 있으면 도굴 후보가 생긴다
    hands: {
      p0: "234m345p345s678s55s",
      p1: "*",
      p2: "*",
      p3: "*",
    },
    discards: { p1: "5s", p2: "1z", p3: "2z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const r = base.round;
  const fogKeys = withFog
    ? {
        // 박무가 **지금** 선언된 상태 (선언 순 = 현재 순, 게임 단위 사용 1회)
        [`brief_fog:turn:${r.prevalentWind}-${r.roundNumber}-${r.honba}:p1`]: r.turnCount,
        "brief_fog:uses:p1": 1,
      }
    : {};
  const state = withAug(
    withAug(
      { ...base, augmentData: { ...base.augmentData, ...fogKeys } },
      "p0",
      ["grave_rob", "silent_swap"],
    ),
    "p1",
    withFog ? ["brief_fog"] : [],
  );
  const game = createStandardGameFromState(state);
  installAugment(game.engine, graveRob, "p0", { yaku: game.yaku });
  installAugment(game.engine, silentSwap, "p0", { yaku: game.yaku });
  if (withFog) installAugment(game.engine, briefFog, "p1", { yaku: game.yaku });
  return game;
}

describe("안개 낀 바닥 — 가려진 패는 후보가 되지 않는다", () => {
  it("안개가 없으면 무덤 도굴·정적의 손 후보가 뜬다 (대조군)", () => {
    const opts = turnOptions(foggedScene(false), "p0");
    expect(opts.some((o) => o.type === "grave_rob")).toBe(true);
    expect(opts.some((o) => o.type === "silent_take")).toBe(true);
  });

  it("박무가 걸리면 두 증강 모두 후보가 사라진다", () => {
    const game = foggedScene(true);
    // 전제: 이 국면에서 p0에게 남의 바닥이 실제로 가려져 있다
    expect(
      game.engine.rules.resolve("visibility.discards", {
        playerId: "p0",
        state: game.engine.state,
        zoneOwner: "p1",
      }),
    ).toBe("count_only");

    const opts = turnOptions(game, "p0");
    // 보이지 않는 패는 팔 수도, 집을 수도 없다 — 후보가 곧 정보이기 때문이다
    expect(opts.some((o) => o.type === "grave_rob")).toBe(false);
    expect(opts.some((o) => o.type === "silent_take")).toBe(false);
    // 그래도 평범한 버림은 남아 국이 진행된다
    expect(opts.some((o) => o.type === "discard")).toBe(true);
  });

  it("안개가 없을 때 정적의 손 후보는 **보이는 바닥 장수와 정확히 같다**", () => {
    const game = foggedScene(false);
    const state = game.engine.state;
    const pondTiles = state.players.flatMap(
      (p) => state.zones[discardsZone(p.id)]?.tileIds ?? [],
    );
    const takes = turnOptions(game, "p0").filter((o) => o.type === "silent_take");
    // 후보가 바닥 장수보다 많으면 어딘가에서 안 보이는 패를 긁어 온 것이다
    expect(takes).toHaveLength(pondTiles.length);
    expect(pondTiles.length).toBeGreaterThan(0);
  });
});
