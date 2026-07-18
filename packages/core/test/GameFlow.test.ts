import { describe, expect, it } from "vitest";
import { Prng } from "../src/engine/random/Prng.js";
import { RuleLayer } from "../src/engine/rules/RuleRegistry.js";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import type { GameState } from "../src/engine/state/GameState.js";
import {
  DEAD_WALL,
  WALL,
  createZone,
  discardsZone,
  handZone,
  meldsZone,
} from "../src/engine/zones/Zone.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type { TileId, TileKind } from "../src/mahjong/tiles/Tile.js";
import { FlowController } from "../src/mahjong/flow/FlowController.js";
import type { FlowStatus } from "../src/mahjong/flow/FlowController.js";
import {
  createStandardGame,
  createStandardGameFromState,
} from "../src/mahjong/flow/standardGame.js";
import type { StandardGame } from "../src/mahjong/flow/standardGame.js";

/** "123m45p6z" → TileKind[] (z: 1~4 동남서북, 5~7 백발중) */
function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

/** 원하는 손패·버림패·페이즈를 가진 상태를 수작업으로 만든다 */
function craft(cfg: {
  hands: Record<PlayerId, string>;
  discards?: Record<PlayerId, string>;
  phase: string;
  turnSeat: number;
  /** 이 플레이어의 손패 마지막 장을 lastDrawnTile로 */
  drawnLastFor?: PlayerId;
}): GameState {
  const base = createInitialGameState(
    { seed: 1, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
  const pool = new Map<string, TileId[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  const take = (kind: TileKind): TileId => {
    const id = pool.get(kindKey(kind))?.shift();
    if (id === undefined) throw new Error(`No tiles left of ${kindKey(kind)}`);
    return id;
  };

  const zones = { ...base.zones };
  for (const p of PLAYERS) {
    zones[handZone(p)] = {
      ...createZone(handZone(p), "hand", p),
      tileIds: h(cfg.hands[p] ?? "").map(take),
    };
    zones[discardsZone(p)] = {
      ...createZone(discardsZone(p), "discards", p),
      tileIds: h(cfg.discards?.[p] ?? "").map(take),
    };
    zones[meldsZone(p)] = createZone(meldsZone(p), "melds", p);
  }
  const rest = [...pool.values()].flat().sort((a, b) => a - b);
  zones[DEAD_WALL] = { ...createZone(DEAD_WALL, "deadWall"), tileIds: rest.slice(0, 14) };
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: rest.slice(14) };

  const drawn =
    cfg.drawnLastFor === undefined
      ? null
      : (zones[handZone(cfg.drawnLastFor)]?.tileIds.at(-1) ?? null);

  // 버림 존과 함께 버림 '이력'도 채운다 (후리텐은 이력 기준)
  const byPlayer = { ...base.round.byPlayer };
  for (const p of PLAYERS) {
    byPlayer[p] = {
      ...byPlayer[p]!,
      discardedKinds: h(cfg.discards?.[p] ?? "").map(kindKey),
    };
  }

  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: cfg.phase,
      turnSeat: cfg.turnSeat,
      doraIndicators: [zones[DEAD_WALL]?.tileIds[4] as TileId],
      lastDrawnTile: drawn,
      byPlayer,
    },
  };
}

function totalPoints(game: StandardGame): number {
  return (
    game.engine.state.players.reduce((sum, p) => sum + p.score, 0) +
    game.engine.state.round.riichiPot
  );
}

function allZoneTiles(game: StandardGame): TileId[] {
  return Object.values(game.engine.state.zones).flatMap((z) => z.tileIds);
}

/** 봇 정책으로 한 국을 끝까지 둔다 */
function playRound(
  game: StandardGame,
  botSeed: number,
  policy: "any" | "discardOnly",
): FlowStatus {
  const flow = new FlowController(game.engine);
  const rng = new Prng(botSeed);
  let status = flow.begin();
  let guard = 0;
  while (status.kind === "awaiting") {
    if (++guard > 2000) throw new Error("round did not terminate");
    for (const prompt of [...status.prompts]) {
      if (!flow.isPending(prompt.player)) continue;
      let choice = prompt.options.find((o) => o.type === "win");
      if (choice === undefined || policy === "discardOnly") {
        const candidates =
          policy === "discardOnly"
            ? prompt.options.filter((o) => o.type === "discard" || o.type === "pass")
            : prompt.options;
        choice = candidates[rng.int(candidates.length)];
      }
      status = flow.submit(prompt.player, choice as { type: string; payload: unknown });
      if (status.kind !== "awaiting") break;
    }
  }
  return status;
}

describe("FlowController — 기본 진행", () => {
  it("begin: 배패·친의 첫 쯔모까지 자동 진행, 친에게 버림 프롬프트", () => {
    const game = createStandardGame({ seed: 42 });
    const flow = new FlowController(game.engine);
    const status = flow.begin();

    expect(status.kind).toBe("awaiting");
    if (status.kind !== "awaiting") return;
    expect(status.prompts).toHaveLength(1);
    expect(status.prompts[0]?.player).toBe("p0");
    expect(game.engine.state.zones[handZone("p0")]?.tileIds).toHaveLength(14);
    expect(game.engine.state.zones[WALL]?.tileIds).toHaveLength(69);
    expect(
      status.prompts[0]?.options.filter((o) => o.type === "discard").length,
    ).toBe(14);
  });

  it("프롬프트에 없는 선택·대기 없는 플레이어는 거부된다", () => {
    const game = createStandardGame({ seed: 42 });
    const flow = new FlowController(game.engine);
    flow.begin();
    expect(() => flow.submit("p1", { type: "discard", payload: { tileId: 0 } })).toThrow(
      "No pending decision",
    );
    expect(() => flow.submit("p0", { type: "discard", payload: { tileId: 999 } })).toThrow(
      "not offered",
    );
  });
});

describe("FlowController — 봇 관통전", () => {
  it("봇 4명이 한 국을 끝까지 둔다 (점수·패 보존 불변식)", () => {
    const game = createStandardGame({ seed: 7 });
    const status = playRound(game, 123, "any");

    expect(status.kind).toBe("roundOver");
    expect(game.engine.state.round.phase).toBe("round.over");
    expect(totalPoints(game)).toBe(100000);
    const tiles = allZoneTiles(game);
    expect(tiles).toHaveLength(136);
    expect(new Set(tiles).size).toBe(136);
  });

  it("여러 시드에서도 항상 종국한다", () => {
    for (const seed of [1, 2, 3, 99]) {
      const game = createStandardGame({ seed });
      const status = playRound(game, seed * 31, "any");
      expect(status.kind).toBe("roundOver");
      expect(totalPoints(game)).toBe(100000);
    }
  });

  it("아무도 화료하지 않으면 황패유국 — 노텐 벌부 합계 0, 본장+1", () => {
    const game = createStandardGame({ seed: 11 });
    const status = playRound(game, 55, "discardOnly");

    expect(status).toEqual({ kind: "roundOver", outcome: "draw" });
    expect(game.engine.state.zones[WALL]?.tileIds).toHaveLength(0);
    expect(game.engine.state.round.honba).toBe(1);
    expect(totalPoints(game)).toBe(100000);
  });

  it("결정론: 같은 시드 = 같은 이벤트 로그", () => {
    const run = () => {
      const game = createStandardGame({ seed: 21 });
      playRound(game, 77, "any");
      return JSON.stringify(game.engine.eventLog);
    };
    expect(run()).toBe(run());
  });
});

describe("FlowController — 시나리오 (수작업 상태)", () => {
  const JUNK1 = "147m147p147s11z22z"; // 확실한 노텐
  const JUNK2 = "258m258p258s33z44z";
  const JUNK3 = "369m369p369s12z34z";

  it("리치: 첫 버림 리치는 더블리치, 공탁 1000이 걸린다", () => {
    const state = craft({
      hands: {
        p0: "123m456p789s55z66z1m", // 1m 버리면 샹퐁 텐파이
        p1: JUNK1,
        p2: JUNK2,
        p3: JUNK3,
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const drawn = game.engine.state.round.lastDrawnTile;
    const riichiOption = status.prompts[0]?.options.find(
      (o) => o.type === "riichi" && (o.payload as { tileId: number }).tileId === drawn,
    );
    expect(riichiOption).toBeDefined();

    flow.submit("p0", riichiOption as { type: string; payload: unknown });

    const p0 = game.engine.state.players[0];
    expect(p0?.score).toBe(24000);
    expect(game.engine.state.round.riichiPot).toBe(1000);
    expect(game.engine.state.round.byPlayer["p0"]?.riichi).toMatchObject({
      double: true,
      ippatsu: true,
    });
  });

  it("론: 대기패가 버려지면 win 옵션이 뜨고, 정산까지 흐른다", () => {
    const state = craft({
      hands: {
        p0: "129m258p369s124z5s", // 5s를 버릴 친
        p1: "234m345p345s678s5s", // 5s 단기 대기 (탕야오)
        p2: JUNK2,
        p3: JUNK3,
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const fiveSou = game.engine.state.zones[handZone("p0")]?.tileIds.find(
      (t) => kindKey(game.engine.state.tiles[t]?.kind as TileKind) === "sou5",
    );
    status = flow.submit("p0", { type: "discard", payload: { tileId: fiveSou } });

    if (status.kind !== "awaiting") throw new Error("expected reaction");
    const p1Prompt = status.prompts.find((p) => p.player === "p1");
    const winOption = p1Prompt?.options.find((o) => o.type === "win");
    expect(winOption).toBeDefined();

    // p1 외에 실제 옵션이 있는 플레이어들도 전부 패스시킨다
    for (const prompt of status.prompts) {
      if (prompt.player === "p1") continue;
      status = flow.submit(prompt.player, { type: "pass", payload: {} });
    }
    status = flow.submit("p1", { type: "win", payload: {} });

    expect(status).toEqual({ kind: "roundOver", outcome: "win" });
    const [p0, p1] = game.engine.state.players;
    expect((p1?.score ?? 0) > 25000).toBe(true);
    expect((p0?.score ?? 0) + (p1?.score ?? 0)).toBe(50000); // 이동만, 생성 없음
    expect(game.engine.state.round.honba).toBe(0); // 자 화료 → 본장 리셋
    expect(game.engine.state.round.dealerSeat).toBe(1); // 친 이동
  });

  it("후리텐: 대기패를 이미 버렸으면 론 옵션이 없다", () => {
    const state = craft({
      hands: {
        p0: "129m258p369s124z5s",
        p1: "234m345p345s678s5s",
        p2: JUNK3,
        p3: JUNK1, // 5s가 없는 정크만 사용 (5s 재고 4장)
      },
      discards: { p1: "5s" }, // p1이 이미 5s를 버렸다
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const fiveSou = game.engine.state.zones[handZone("p0")]?.tileIds.find(
      (t) => kindKey(game.engine.state.tiles[t]?.kind as TileKind) === "sou5",
    );
    status = flow.submit("p0", { type: "discard", payload: { tileId: fiveSou } });

    if (status.kind === "awaiting") {
      const p1Prompt = status.prompts.find((p) => p.player === "p1");
      expect(p1Prompt?.options.find((o) => o.type === "win")).toBeUndefined();
    }
  });

  it("일시 후리텐: 론 가능한 패를 넘기면 다음 자기 쯔모 전까지 론할 수 없다", () => {
    const state = craft({
      hands: {
        p0: "129m258p369s124z5s",
        p1: "123m123p123s34s55z", // 2s/5s 양면 대기
        p2: "555s29m258p369s34z",
        p3: "147m147p147s11z22z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const firstFiveSou = game.engine.state.zones[handZone("p0")]?.tileIds.find(
      (t) => kindKey(game.engine.state.tiles[t]?.kind as TileKind) === "sou5",
    );
    status = flow.submit("p0", { type: "discard", payload: { tileId: firstFiveSou } });
    if (status.kind !== "awaiting") throw new Error("expected reaction");

    const p1Prompt = status.prompts.find((p) => p.player === "p1");
    const p2Prompt = status.prompts.find((p) => p.player === "p2");
    expect(p1Prompt?.options.find((o) => o.type === "win")).toBeDefined();
    const ponOption = p2Prompt?.options.find((o) => o.type === "pon");
    expect(ponOption).toBeDefined();

    status = flow.submit("p1", { type: "pass", payload: {} });
    if (status.kind !== "awaiting") throw new Error("expected p2 decision");
    status = flow.submit("p2", ponOption as { type: string; payload: unknown });
    if (status.kind !== "awaiting") throw new Error("expected p2 turn");

    const secondFiveSou = game.engine.state.zones[handZone("p2")]?.tileIds.find(
      (t) => kindKey(game.engine.state.tiles[t]?.kind as TileKind) === "sou5",
    );
    expect(secondFiveSou).toBeDefined();
    status = flow.submit("p2", { type: "discard", payload: { tileId: secondFiveSou } });

    if (status.kind === "awaiting") {
      const furitenPrompt = status.prompts.find((p) => p.player === "p1");
      expect(furitenPrompt?.options.find((o) => o.type === "win")).toBeUndefined();
    }
  });

  it("펑: 버림패를 가져와 턴을 빼앗고, 첫 바퀴·일발이 깨진다", () => {
    const state = craft({
      hands: {
        p0: "129m258p369s334z6z",
        p1: JUNK1,
        p2: "66z129m258p369s34z",
        p3: JUNK3,
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const hatsu = game.engine.state.zones[handZone("p0")]?.tileIds.find(
      (t) => kindKey(game.engine.state.tiles[t]?.kind as TileKind) === "dragon2",
    );
    status = flow.submit("p0", { type: "discard", payload: { tileId: hatsu } });

    if (status.kind !== "awaiting") throw new Error("expected reaction");
    const p2Prompt = status.prompts.find((p) => p.player === "p2");
    const ponOption = p2Prompt?.options.find((o) => o.type === "pon");
    expect(ponOption).toBeDefined();

    for (const prompt of status.prompts) {
      if (prompt.player === "p2") continue;
      status = flow.submit(prompt.player, { type: "pass", payload: {} });
    }
    status = flow.submit("p2", ponOption as { type: string; payload: unknown });

    const s = game.engine.state;
    expect(s.zones[meldsZone("p2")]?.tileIds).toHaveLength(3);
    expect(s.round.byPlayer["p2"]?.melds[0]?.kind).toBe("pon");
    expect(s.round.turnSeat).toBe(2);
    expect(s.round.goAroundBroken).toBe(true);
    if (status.kind !== "awaiting") throw new Error("expected p2 discard prompt");
    expect(status.prompts[0]?.player).toBe("p2");
    expect(s.zones[handZone("p2")]?.tileIds).toHaveLength(11);
  });

  it("안깡: 안깡을 선언하면 도라표시패가 추가되고, 영상쯔모 후 버림 프롬프트가 나온다", () => {
    const state = craft({
      hands: {
        p0: "7777z258p369s34z55z", // 7z 4장, 5z 2장 -> 총 14장
        p1: JUNK1,
        p2: JUNK2,
        p3: JUNK3,
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const ankanOption = status.prompts[0]?.options.find((o) => o.type === "ankan");
    expect(ankanOption).toBeDefined();
    // 같은 4장에 대해 안깡 옵션은 정확히 1개만 (버튼 4개 중복 방지 회귀)
    expect(status.prompts[0]?.options.filter((o) => o.type === "ankan")).toHaveLength(1);

    const prevDoraCount = game.engine.state.round.doraIndicators.length;
    status = flow.submit("p0", ankanOption as { type: string; payload: unknown });

    // 영상쯔모 후 다시 act 페이즈
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const s = game.engine.state;
    expect(s.round.doraIndicators).toHaveLength(prevDoraCount + 1);
    expect(s.round.kanCount).toBe(1);
    expect(s.round.byPlayer["p0"]?.melds[0]?.kind).toBe("kan_closed");
    expect(s.zones[meldsZone("p0")]?.tileIds).toHaveLength(4);
    expect(s.zones[handZone("p0")]?.tileIds).toHaveLength(11); // 14 - 4(깡) + 1(영상쯔모)
  });

  it("깡 도라 타이밍: afterDiscard 룰이면 깡 후 버림 뒤에 신도라가 열린다", () => {
    const state = craft({
      hands: {
        p0: "7777z258p369s34z55z",
        p1: JUNK1,
        p2: JUNK2,
        p3: JUNK3,
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    game.engine.rules.addModifier<"beforeRinshan" | "afterDiscard">("dora.kanTiming", {
      source: "test:after_discard_dora",
      layer: RuleLayer.System,
      apply: () => "afterDiscard",
    });
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const prevDoraCount = game.engine.state.round.doraIndicators.length;
    const ankanOption = status.prompts[0]?.options.find((o) => o.type === "ankan");
    expect(ankanOption).toBeDefined();
    status = flow.submit("p0", ankanOption as { type: string; payload: unknown });

    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    expect(game.engine.state.round.doraIndicators).toHaveLength(prevDoraCount);
    expect(game.engine.state.round.pendingDora).toBe(1);

    const discardOption = status.prompts[0]?.options.find((o) => o.type === "discard");
    expect(discardOption).toBeDefined();
    flow.submit("p0", discardOption as { type: string; payload: unknown });

    expect(game.engine.state.round.doraIndicators).toHaveLength(prevDoraCount + 1);
    expect(game.engine.state.round.pendingDora).toBe(0);
  });

  it("리치 중 안깡: 마지막 쯔모패로 만들고 대기가 유지되면 허용된다", () => {
    const state = craft({
      hands: {
        p0: "11122233344451m", // 1m 안깡 전후 모두 5m 대기
        p1: "258m258p258s33z44z",
        p2: "369m369p369s22z33z",
        p3: "47m147p147s11z22z",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const p0rs = state.round.byPlayer["p0"];
    if (p0rs === undefined) throw new Error("missing p0");
    const game = createStandardGameFromState({
      ...state,
      round: {
        ...state.round,
        byPlayer: {
          ...state.round.byPlayer,
          p0: {
            ...p0rs,
            riichi: { double: false, ippatsu: true, discardIndex: 0 },
          },
        },
      },
    });
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const ankanOption = status.prompts[0]?.options.find((o) => o.type === "ankan");
    expect(ankanOption).toBeDefined();

    status = flow.submit("p0", ankanOption as { type: string; payload: unknown });
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    expect(game.engine.state.round.byPlayer["p0"]?.riichi).not.toBeNull();
    expect(game.engine.state.round.byPlayer["p0"]?.melds[0]?.kind).toBe("kan_closed");
    expect(game.engine.state.round.lastDrawRinshan).toBe(true);
  });

  it("안깡 창깡: 국사무쌍만 안깡을 론할 수 있다", () => {
    const state = craft({
      hands: {
        p0: "1111m258p369s34z66z",
        p1: "99m19p19s1234567z", // 1m 대기 국사
        p2: "23m123p123s555z11z", // 1m이면 일반 화료지만 안깡 창깡 불가
        p3: JUNK3,
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const ankanOption = status.prompts[0]?.options.find((o) => o.type === "ankan");
    expect(ankanOption).toBeDefined();
    status = flow.submit("p0", ankanOption as { type: string; payload: unknown });

    if (status.kind !== "awaiting") throw new Error("expected chankan reaction");
    expect(status.prompts.map((p) => p.player)).toEqual(["p1"]);
    const winOption = status.prompts[0]?.options.find((o) => o.type === "win");
    expect(winOption).toBeDefined();

    status = flow.submit("p1", winOption as { type: string; payload: unknown });
    expect(status).toEqual({ kind: "roundOver", outcome: "win" });
  });

  it("구종구패: 9종 이상의 요구패가 있으면 도중유국 선언 가능", () => {
    const state = craft({
      hands: {
        p0: "19m19p19s123z4z", // 10종
        p1: JUNK1,
        p2: JUNK2,
        p3: JUNK3,
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    const abortOption = status.prompts[0]?.options.find((o) => o.type === "kyushuKyuhai");
    expect(abortOption).toBeDefined();

    status = flow.submit("p0", abortOption as { type: string; payload: unknown });
    expect(status).toEqual({ kind: "roundOver", outcome: "abort" });
  });
});
