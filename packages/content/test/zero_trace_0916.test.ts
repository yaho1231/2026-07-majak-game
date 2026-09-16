/**
 * zero_trace_0916 — QA 5라운드 단독 스위프(B-1)에서 «모든 판에서 흔적 없음 + 훅도 상태를
 * 안 바꿈»으로 나온 5종이 «조건 희소»인지 «경로가 죽음»인지 가른다.
 *
 * 스위프 계수기(qa-lab/round5/solo/hooks.ts)는 ctx.reaction/interceptor/setHolderRule/
 * holder*Options 만 센다. 여기 5종은 전부 **ctx.yaku.register / ctx.engine.rules.addModifier**
 * 로만 등록하므로 계수기의 사각이다. 이 파일은 각 카드의 발동 조건을 **정확히** 맞춘 장면을
 * 진짜 액션 경로(FlowController → win / ankan → sysSettleWin)로 굴려 효과가 실제로 나는지
 * 확인한다 — 통과하면 «희소(+사각)» 확정, 실패하면 결함이다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  buildPlayerView,
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { bottomYaku } from "../src/augments/bottom_yaku.js";
import { doraConceal } from "../src/augments/dora_conceal.js";
import { mixedNineGates } from "../src/augments/mixed_nine_gates.js";
import { soulHunt } from "../src/augments/soul_hunt.js";
import { voidKan } from "../src/augments/void_kan.js";

function withAugment(state: GameState, player: PlayerId, id: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, id] } : p,
    ),
  };
}

function startFlow(state: GameState, def: AugmentDef, holder: PlayerId = "p0") {
  const game = createStandardGameFromState(withAugment(state, holder, def.id));
  installAugment(game.engine, def, holder, { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error(`expected awaiting, got ${status.kind}`);
  return { game, flow, status };
}

function lastSettled(game: { engine: { eventLog: readonly GameEvent[] } }): RoundSettledPayload {
  const log = game.engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) return log[i]!.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

const yakuIds = (s: RoundSettledPayload): string[] =>
  (s.winInfos?.[0]?.yaku ?? []).map((y) => y.id);

// ── soul_hunt ──────────────────────────────────────────────────────────────

describe("혼 사냥 (soul_hunt) — 리치 중인 상대를 론하는 실제 정산 경로", () => {
  function scene(): GameState {
    const base = craft({
      // 탕야오 손(실역 1개) — 5s 대기
      hands: { p0: "234m567m234p678p5s", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "5s" },
    });
    return {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p1: {
            ...base.round.byPlayer["p1"]!,
            riichi: { double: false, ippatsu: false, discardIndex: 0 },
          },
        },
      },
    };
  }

  it("방총자 리치 → RoundSettled 에 soul_hunt 역이 붙고 뒷도라 문(uraAlways)이 열린다", () => {
    const { game, flow } = startFlow(scene(), soulHunt);
    // ② 뒷도라: sysSettleWin 이 쓰는 buildWinContext 경로에서 규칙이 켜지는가
    const ronTile = game.engine.state.round.lastDiscard!.tileId;
    const wctx = buildWinContext(game.engine.state, "p0", "ron", ronTile, {
      includeUra: true,
      rules: game.engine.rules,
      from: "p1",
    });
    expect(wctx.fromRiichi).toBe(true);
    expect(wctx.uraAlways).toBe(true);

    // ① 역: 실제 win 액션 → 정산
    const status = flow.submit("p0", { type: "win", payload: {} });
    expect(status.kind).toBe("roundOver");
    const settled = lastSettled(game);
    expect(settled.winInfos?.[0]?.winner).toBe("p0");
    expect(yakuIds(settled)).toContain("soul_hunt");
    expect(yakuIds(settled)).not.toContain("riichi");
  });

  it("대조군: 방총자가 리치가 아니면 붙지 않는다", () => {
    const base = scene();
    const noRiichi: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: { ...base.round.byPlayer, p1: { ...base.round.byPlayer["p1"]!, riichi: null } },
      },
    };
    const { game, flow } = startFlow(noRiichi, soulHunt);
    flow.submit("p0", { type: "win", payload: {} });
    expect(yakuIds(lastSettled(game))).not.toContain("soul_hunt");
  });
});

// ── bottom_yaku ────────────────────────────────────────────────────────────

describe("바닥의 족보 (bottom_yaku) — 실제 정산 경로", () => {
  function scene(bottom: string): GameState {
    return craft({
      hands: { p0: "234m567m234p678p5s", p1: "*", p2: "*", p3: "*" },
      discards: { p0: bottom },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "5s" },
    });
  }

  it("같은 패 3장을 버리고 론 → 미련 없음(bottom_letgo) 1판이 정산에 붙는다", () => {
    const { game, flow } = startFlow(scene("111z"), bottomYaku);
    expect(flow.submit("p0", { type: "win", payload: {} }).kind).toBe("roundOver");
    const s = lastSettled(game);
    expect(yakuIds(s)).toContain("tanyao");
    expect(yakuIds(s)).toContain("bottom_letgo");
    expect(s.winInfos?.[0]?.yaku.find((y) => y.id === "bottom_letgo")?.han).toBe(1);
  });

  it("한 무늬 숫자 7종 + 같은 패 3장 → 역류 통관 2판 + 미련 없음 1판", () => {
    // 5s 는 대기패라 바닥에서 뺀다(후리텐 방지) — 1·2·3·4·6·7·8 = 7종
    const { game, flow } = startFlow(scene("1234678s111z"), bottomYaku);
    expect(flow.submit("p0", { type: "win", payload: {} }).kind).toBe("roundOver");
    const s = lastSettled(game);
    expect(yakuIds(s)).toContain("bottom_flow");
    expect(yakuIds(s)).toContain("bottom_letgo");
  });
});

// ── mixed_nine_gates ───────────────────────────────────────────────────────

describe("뒤섞인 아홉 개의 연꽃 (mixed_nine_gates) — 실제 정산 경로", () => {
  it("무늬 섞인 1112345678999 + 수패 1장 론 → 역만으로 정산된다", () => {
    // 랭크 1112345678999 (만·통·삭 혼합, 13장) — 아무 수패 랭크로 화료
    const base = craft({
      hands: { p0: "111m23p45s67m8p99s9m", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "5p" },
    });
    const { game, flow } = startFlow(base, mixedNineGates);
    const status = flow.submit("p0", { type: "win", payload: {} });
    expect(status.kind).toBe("roundOver");
    const s = lastSettled(game);
    expect(s.winInfos?.[0]?.winner).toBe("p0");
    expect(yakuIds(s)).toContain("mixed_nine_gates");
    expect(s.winInfos?.[0]?.yakumanCount ?? 0).toBeGreaterThan(0);
  });

  it("대조군: 증강이 없으면 그 손은 화료가 아니다", () => {
    const base = craft({
      hands: { p0: "111m23p45s67m8p99s9m", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "5p" },
    });
    const game = createStandardGameFromState(base);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    // 론 창구가 p0 에게 아예 열리지 않는다
    const p0 = status.kind === "awaiting" ? status.prompts.find((p) => p.player === "p0") : undefined;
    expect(p0?.options.find((o) => o.type === "win")).toBeUndefined();
  });
});

// ── void_kan ───────────────────────────────────────────────────────────────

describe("성립하지 않는 깡 (void_kan) — 상대의 진짜 안깡 액션에 반응한다", () => {
  function scene(): GameState {
    return craft({
      // p0: 1s 단기 텐파이(리치 아님). p1: 동 4장 + 쯔모 직후 14장 → 안깡 가능
      hands: { p0: "123m456m789m123p1s", p1: "1111z234m567m23p55s", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
  }

  it("p1 안깡 → p0 손패 한 장이 동(1z)으로 위조되고 챤깡 론이 제시된다", () => {
    const { game, flow } = startFlow(scene(), voidKan);
    const st0 = game.engine.state;
    const eastIds = handIdsOf(st0, "p1").filter((id) => kindKey(kindOf(st0, id)) === "wind1");
    expect(eastIds).toHaveLength(4);
    const status = flow.submit("p1", {
      type: "ankan",
      payload: { tileIds: eastIds as [TileId, TileId, TileId, TileId] },
    });
    const st = game.engine.state;
    // 손패 위조 (tileKindChanged, conjured)
    const forged = handIdsOf(st, "p0").filter(
      (id) => st.tiles[id]?.attrs.conjured === true && kindKey(kindOf(st, id)) === "wind1",
    );
    expect(forged).toHaveLength(1);
    // 컷인 채널
    const dataKeys = Object.keys(st.augmentData).filter((k) => k.includes("void_kan:p0"));
    expect(dataKeys.length).toBeGreaterThan(0);
    // 챤깡 론 창구가 p0 에게 열린다
    expect(status.kind).toBe("awaiting");
    if (status.kind === "awaiting") {
      const p0 = status.prompts.find((p) => p.player === "p0");
      const win = p0?.options.find((o) => o.type === "win");
      expect(win).toBeDefined();
      const done = flow.submit("p0", win!);
      expect(done.kind).toBe("roundOver");
      expect(yakuIds(lastSettled(game))).toContain("chankan");
    }
  });

  it("대조군: p0 가 리치 중이면 아무 것도 바꾸지 않는다", () => {
    const base = scene();
    const riichi: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: { ...base.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
        },
      },
    };
    const { game, flow } = startFlow(riichi, voidKan);
    const st0 = game.engine.state;
    const eastIds = handIdsOf(st0, "p1").filter((id) => kindKey(kindOf(st0, id)) === "wind1");
    flow.submit("p1", { type: "ankan", payload: { tileIds: eastIds as [TileId, TileId, TileId, TileId] } });
    const st = game.engine.state;
    expect(handIdsOf(st, "p0").some((id) => st.tiles[id]?.attrs.conjured === true)).toBe(false);
  });
});

// ── dora_conceal ───────────────────────────────────────────────────────────

describe("가려진 도라 (dora_conceal) — 뷰 채널만 쓰는 순수 정보형", () => {
  it("설치 즉시 비보유자 뷰의 도라 표시패가 비고 보유자 뷰는 그대로다 (상태·이벤트 흔적 없음)", () => {
    const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });
    const game = createStandardGameFromState(withAugment(base, "p0", "dora_conceal"));
    const before = JSON.stringify(game.engine.state.augmentData);
    installAugment(game.engine, doraConceal, "p0", { yaku: game.yaku });
    const st = game.engine.state;
    const v0 = buildPlayerView(st, "p0", game.engine.rules);
    const v1 = buildPlayerView(st, "p1", game.engine.rules);
    expect(v0.round.doraIndicators.length).toBe(1);
    expect(v1.round.doraIndicators.length).toBe(0);
    // augmentData·이벤트 로그에는 아무것도 남지 않는다 — 스위프 계수기가 볼 수 있는 흔적이 없다
    expect(JSON.stringify(st.augmentData)).toBe(before);
    expect(game.engine.eventLog.some((e) => JSON.stringify(e).includes("dora_conceal"))).toBe(false);
    // p1 바닥 zone 등 다른 것은 건드리지 않는다
    expect(st.zones[discardsZone("p1")]?.tileIds).toEqual([]);
  });
});
