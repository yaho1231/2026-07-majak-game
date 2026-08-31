/**
 * 깡·도라 축 시너지 회귀 — 2026-08-23 QA synergy3 kandora가 확정한 결함들.
 *
 * 이 라운드가 찾은 것은 전부 "**한 증강이 다른 증강의 전제를 조용히 무너뜨린다**"는
 * 부류다. 어느 쪽 카드에도 상대에 대한 말이 없어서, 진 쪽은 자기가 죽은 줄도 몰랐다.
 *
 * 1. 확정 1 `dora_conceal` × `mirror_dora` — 거울의 **전원 공개** 채널이 앞도라를 실어,
 *    `표시패 = 앞도라 + 1` 산수로 가려진 표시패가 통째로 되돌려졌다. 은닉자도 거울
 *    보유자도 아닌 제3자까지 도라를 알았다.
 * 2. 확정 2 `haitei_lord` × `conjure_draw` — 같은 해저패에 둘 다 `tileKindChanged`를 쏴서
 *    **나중에 설치된 쪽(= 드래프트 픽 순서)** 이 이겼다. 진 쪽은 1회 사용권만 소모했다.
 * 3. 확정 3 `triple_peek` × `bottom_deal` — "어긋나지 않는다"고 적힌 실시간 예고가
 *    밑장빼기 앞에서 어긋났다(남의 좌석이 써도 깨졌다).
 * 4. 확정 4 `ura_peek` × `dead_wall_master` — 왕패의 주인이 뒷도라 표시패 자리를 갈아
 *    끼워도 이면투시 화면은 낡은 패를 계속 보여 줬다(갱신이 `DORA_FLIPPED`에만 걸림).
 * 5. 의심 1 `foresight` × `bottom_deal` — 밑장 쯔모가 패산 **앞**을 안 줄였는데도
 *    `peekLeft`를 깎아, 아직 패산에 있는 예언패가 화면에서 사라졌다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  SPECTATOR_ID,
  WALL,
  buildPlayerView,
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  uraIndicatorIds,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
  Zone,
  ZoneId,
} from "@majak/core";
import { craft, h } from "./helpers.js";
import { roundKey } from "../src/util.js";
import { bottomDeal } from "../src/augments/bottom_deal.js";
import { conjureDraw } from "../src/augments/conjure_draw.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { doraConceal } from "../src/augments/dora_conceal.js";
import { foresight } from "../src/augments/foresight.js";
import { haiteiLord } from "../src/augments/haitei_lord.js";
import { mirrorDora } from "../src/augments/mirror_dora.js";
import { triplePeek } from "../src/augments/triple_peek.js";
import { uraPeek } from "../src/augments/ura_peek.js";

// ── 픽스처 도구 (qa-lab/synergy3/kandora/lib.ts 와 같은 계산) ────────────────

/** 존재가 보장된 Zone (픽스처가 만든 판이라 없으면 그 자체가 버그다) */
function zoneOf(state: GameState, id: ZoneId): Zone {
  const z = state.zones[id];
  if (z === undefined) throw new Error(`no zone ${id}`);
  return z;
}

/** 그 Zone의 tileIds */
const tilesOf = (state: GameState, id: ZoneId): TileId[] => [...zoneOf(state, id).tileIds];

interface Install {
  def: AugmentDef;
  holder: PlayerId;
}

function setup(state: GameState, installs: readonly Install[]) {
  const ids = new Map<PlayerId, string[]>();
  for (const i of installs) ids.set(i.holder, [...(ids.get(i.holder) ?? []), i.def.id]);
  const seeded: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...p.augments, ...(ids.get(p.id) ?? [])],
    })),
  };
  const game = createStandardGameFromState(seeded);
  for (const i of installs) installAugment(game.engine, i.def, i.holder, { yaku: game.yaku });
  return game;
}

function base(hands = "123456789m234p5s"): GameState {
  return craft({
    hands: { p0: hands, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** 패산에 원하는 종류를 확보한다 (다른 좌석 손패와 맞바꾼다 — 장면 조립용) */
function reserveInWall(state: GameState, specs: readonly string[]): GameState {
  let st = state;
  for (const spec of specs) {
    const want = kindKey(h(spec)[0] as TileKind);
    const wallIds = tilesOf(st, WALL);
    if (wallIds.some((id) => kindKey(kindOf(st, id)) === want)) continue;
    let done = false;
    for (const d of ["p1", "p2", "p3"] as PlayerId[]) {
      const hand = tilesOf(st, handZone(d));
      const hi = hand.findIndex((id) => kindKey(kindOf(st, id)) === want);
      if (hi < 0) continue;
      const swapId = hand[hi] as TileId;
      hand[hi] = wallIds[0] as TileId;
      wallIds[0] = swapId;
      st = {
        ...st,
        zones: {
          ...st.zones,
          [handZone(d)]: { ...zoneOf(st, handZone(d)), tileIds: hand },
          [WALL]: { ...zoneOf(st, WALL), tileIds: wallIds },
        },
      };
      done = true;
      break;
    }
    if (!done) throw new Error(`cannot reserve ${spec}`);
  }
  return st;
}

/** 도라 표시패를 원하는 종류로 갈아 끼운다 (패산의 그 종류 한 장과 자리 교환) */
function setIndicator(state: GameState, spec: string): GameState {
  const want = kindKey(h(spec)[0] as TileKind);
  const dead = tilesOf(state, DEAD_WALL);
  const wallIds = tilesOf(state, WALL);
  const idx = dead.length - 10;
  const cur = dead[idx] as TileId;
  if (kindKey(kindOf(state, cur)) === want) return state;
  const wi = wallIds.findIndex((id) => kindKey(kindOf(state, id)) === want);
  if (wi < 0) throw new Error(`no ${spec} left in wall`);
  dead[idx] = wallIds[wi] as TileId;
  wallIds[wi] = cur;
  return {
    ...state,
    zones: {
      ...state.zones,
      [DEAD_WALL]: { ...zoneOf(state, DEAD_WALL), tileIds: dead },
      [WALL]: { ...zoneOf(state, WALL), tileIds: wallIds },
    },
    round: {
      ...state.round,
      doraIndicators: state.round.doraIndicators.map((id, i) => (i === 0 ? (dead[idx] as TileId) : id)),
    },
  };
}

/** 패산을 n장만 남긴다 (뒤쪽 = 해저패 쪽을 남긴다) */
function truncateWall(state: GameState, n: number): GameState {
  const w = zoneOf(state, WALL);
  return {
    ...state,
    zones: {
      ...state.zones,
      [WALL]: { ...w, tileIds: w.tileIds.slice(w.tileIds.length - n) },
    },
  };
}

type Game = ReturnType<typeof setup>;
type Status = ReturnType<FlowController["begin"]>;

/** 지금 프롬프트에서 그 좌석의 특정 액션 후보를 고른다 */
function opt(
  status: Status,
  player: PlayerId,
  type: string,
  filter: (o: { type: string; payload: unknown }) => boolean = () => true,
): { type: string; payload: unknown } | undefined {
  if (status.kind !== "awaiting") return undefined;
  return status.prompts
    .find((p) => p.player === player)
    ?.options.filter((o) => o.type === type)
    .find(filter);
}

/** 그 좌석의 증강 뷰 채널 (view: 접두는 벗겨져서 온다) */
function channels(game: Game, viewer: PlayerId | typeof SPECTATOR_ID): Record<string, unknown> {
  return buildPlayerView(game.engine.state, viewer, game.engine.rules).augmentView ?? {};
}

// ── 확정 1 ─────────────────────────────────────────────────────────────────

describe("확정 1 dora_conceal × mirror_dora — 앞도라 공개가 가려진 표시패를 되돌린다", () => {
  /** 표시패 4m → 표준 도라 5m · 거울의 앞도라 3m. 앞도라를 알면 표시패도 안다. */
  function scene(installs: readonly Install[]): Game {
    let st = base();
    st = reserveInWall(st, ["4m"]);
    st = setIndicator(st, "4m");
    const game = setup(st, installs);
    // 거울의 announce는 매 이벤트마다 도는 리액션이라 흐름을 한 번 태운다
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    const d = opt(status, "p0", "discard");
    if (d !== undefined) flow.submit("p0", d as never);
    return game;
  }

  it("가리는 사람이 없으면 예전처럼 전원 공개다 (관전자 포함)", () => {
    const game = scene([{ def: mirrorDora, holder: "p0" }]);
    expect(channels(game, "p1")["mirror_dora:p0"]).toEqual(["man3"]);
    expect(channels(game, SPECTATOR_ID)["mirror_dora:p0"]).toEqual(["man3"]);
  });

  it("가려진 국에는 앞도라가 비보유자에게 가지 않는다 (표시패를 보는 은닉자 본인은 그대로)", () => {
    const game = scene([
      { def: doraConceal, holder: "p0" },
      { def: mirrorDora, holder: "p0" },
    ]);
    // 표시패는 실제로 가려져 있다 (전제 확인)
    const v1 = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(v1.round.doraIndicators).toHaveLength(0);
    // 예전에는 여기에 ["man3"]이 실려 man3+2 = man5 로 도라가 되돌려졌다
    expect(channels(game, "p1")["mirror_dora:p0"]).toBeUndefined();
    expect(channels(game, "p0")["mirror_dora:p0"]).toEqual(["man3"]);
  });

  it("은닉자도 거울 보유자도 아닌 제3자에게는 더더욱 가지 않는다", () => {
    const game = scene([
      { def: doraConceal, holder: "p0" },
      { def: mirrorDora, holder: "p1" },
    ]);
    // p2·p3 은 증강이 하나도 없는 좌석이다 — 이번 국 도라를 알 방법이 없어야 한다
    expect(channels(game, "p2")["mirror_dora:p1"]).toBeUndefined();
    expect(channels(game, "p3")["mirror_dora:p1"]).toBeUndefined();
    // 2026-08-31(synergy4 C-3) — **거울 보유자 본인에게도 가지 않는다.** 예전에는
    // dora_conceal의 「면책 문구」를 근거로 면제했는데 그런 문구는 카드에 없었고,
    // 앞도라는 표시패의 정확한 역함수라 그 한 줄이 은폐를 산수로 뚫었다.
    expect(channels(game, "p1")["mirror_dora:p1"]).toBeUndefined();
    // 은닉자는 표시패를 직접 보므로 앞도라를 스스로 계산할 수 있다 — 숨길 것이 없다
    expect(channels(game, "p0")["mirror_dora:p1"]).toEqual(["man3"]);
  });
});

// ── 확정 2 ─────────────────────────────────────────────────────────────────

describe("확정 2 haitei_lord × conjure_draw — 해저패의 주인이 설치 순서로 갈렸다", () => {
  /** p0 텐파이(…5s 단기), 패산 1장 = 다음 쯔모가 곧 해저패 */
  function run(installs: readonly Install[], conjure: boolean) {
    let st = truncateWall(
      craft({
        hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.draw",
        turnSeat: 0,
      }),
      1,
    );
    if (conjure) {
      // 소환 예약을 미리 심는다 (액션 경로는 conjure_draw 자체 테스트가 본다)
      st = {
        ...st,
        augmentData: {
          ...st.augmentData,
          [`conjure_draw:pending:${roundKey(st)}:p0#round`]: { suit: "man", rank: 1 },
        },
      };
    }
    const game = setup(st, installs);
    new FlowController(game.engine).begin();
    const s = game.engine.state;
    return {
      drawn: s.round.lastDrawnTile === null ? null : kindKey(kindOf(s, s.round.lastDrawnTile)),
      fired: s.augmentData[`haitei_lord:fired:${roundKey(s)}:p0#round`] === true,
      pending: s.augmentData[`conjure_draw:pending:${roundKey(s)}:p0#round`],
    };
  }

  const HAITEI: Install = { def: haiteiLord, holder: "p0" };
  const CONJURE: Install = { def: conjureDraw, holder: "p0" };

  it("혼자면 각자 하던 대로 동작한다", () => {
    expect(run([HAITEI], false).drawn).toBe("sou5"); // 오름패로 바뀐다
    expect(run([CONJURE], true).drawn).toBe("man1"); // 부른 패로 바뀐다
  });

  it("함께 들면 설치 순서와 무관하게 해저의 지배자가 가져간다", () => {
    for (const order of [
      [HAITEI, CONJURE],
      [CONJURE, HAITEI],
    ]) {
      const r = run(order, true);
      // 예전에는 나중에 설치된 쪽이 이겨 man1(화료 불가)/sou5 로 갈렸다
      expect(r.drawn).toBe("sou5");
      expect(r.fired).toBe(true);
      // 진 쪽의 예약은 소모되지 않는다 — 양보한 것이지 발동한 것이 아니다
      expect(r.pending).toEqual({ suit: "man", rank: 1 });
    }
  });
});

// ── 확정 3 ─────────────────────────────────────────────────────────────────

describe("확정 3 triple_peek × bottom_deal — 실시간 예고가 밑장빼기 앞에서 어긋났다", () => {
  /** 결정론 셔플 (재현 스크립트와 같은 수열) */
  function shuffleWall(st: GameState): GameState {
    const ids = tilesOf(st, WALL);
    let seed = 12345;
    for (let i = ids.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const j = seed % (i + 1);
      [ids[i], ids[j]] = [ids[j] as TileId, ids[i] as TileId];
    }
    return {
      ...st,
      zones: { ...st.zones, [WALL]: { ...zoneOf(st, WALL), tileIds: ids } },
    };
  }

  /** 예고 첫 항목과 실제로 p0에게 들어온 패를 checks회 대조한다 */
  function mismatches(bottomSeat: PlayerId | null, checks = 4): string[] {
    const installs: Install[] = [{ def: triplePeek, holder: "p0" }];
    if (bottomSeat !== null) installs.push({ def: bottomDeal, holder: bottomSeat });
    const game = setup(shuffleWall(base("123456789m234p5s")), installs);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    status = flow.submit("p0", opt(status, "p0", "triple_peek_use") as never);

    const chan = (): string[] =>
      (game.engine.state.augmentData["view:p0:triple_peek#round"] as string[]) ?? [];
    const bad: string[] = [];
    let expectNext: string | null = null;
    let done = 0;
    for (let step = 0; step < 200 && done < checks && status.kind === "awaiting"; step++) {
      const pr = status.prompts[0];
      if (pr === undefined) break;
      // 밑장빼기는 선언할 수 있을 때 늘 선언한다
      if (bottomSeat !== null && pr.player === bottomSeat) {
        const arm = opt(status, bottomSeat, "bottom_deal");
        if (arm !== undefined) {
          status = flow.submit(bottomSeat, arm as never);
          continue;
        }
      }
      // 선언까지 끝난 p0의 행동 시점에서 예고를 읽는다 (여기가 "지금 기준")
      const s = game.engine.state;
      if (s.round.phase === "turn.act" && s.round.turnSeat === 0 && expectNext === null) {
        expectNext = chan()[0] ?? null;
      }
      const o =
        pr.options.find((x) => x.type === "discard") ??
        pr.options.find((x) => x.type === "pass") ??
        pr.options[0];
      status = flow.submit(pr.player, o as never);
      const s2 = game.engine.state;
      if (
        s2.round.phase === "turn.act" &&
        s2.round.turnSeat === 0 &&
        s2.round.lastDrawnTile !== null &&
        expectNext !== null
      ) {
        const got = kindKey(kindOf(s2, s2.round.lastDrawnTile));
        done++;
        if (got !== expectNext) bad.push(`예고 ${expectNext} → 실제 ${got}`);
        expectNext = null;
      }
    }
    expect(done).toBe(checks); // 장면이 실제로 굴러갔는지 (빈 검사 방지)
    return bad;
  }

  it("아무도 밑장을 빼지 않으면 예고가 맞는다 (기준선)", () => {
    expect(mismatches(null)).toEqual([]);
  });

  it("남의 좌석이 밑장을 빼도 내 예고가 깨지지 않는다", () => {
    // 예전에는 하가·대면 각각 3/4가 틀렸다 — 뒤따르는 좌석의 몫이 한 칸씩 밀렸다
    expect(mismatches("p1")).toEqual([]);
    expect(mismatches("p2")).toEqual([]);
  });

  it("내가 밑장을 빼면 예고 첫 장이 패산 최후미로 바뀐다", () => {
    const game = setup(shuffleWall(base("123456789m234p5s")), [
      { def: triplePeek, holder: "p0" },
      { def: bottomDeal, holder: "p0" },
    ]);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    status = flow.submit("p0", opt(status, "p0", "triple_peek_use") as never);
    const chan = (): string[] =>
      (game.engine.state.augmentData["view:p0:triple_peek#round"] as string[]) ?? [];
    const wallOf = (): TileId[] => tilesOf(game.engine.state, WALL);
    // 선언 전 — p0는 하가·대면·상가 다음이므로 예고 첫 장은 패산 앞에서 네 번째
    const front = wallOf()[3] as TileId;
    expect(chan()[0]).toBe(kindKey(kindOf(game.engine.state, front)));
    status = flow.submit("p0", opt(status, "p0", "bottom_deal") as never);
    const w = wallOf();
    const bottom = w[w.length - 1] as TileId;
    // 선언 후 — 예고 첫 장은 패산 최후미(= 밑장빼기로 실제 들어올 패)
    expect(chan()[0]).toBe(kindKey(kindOf(game.engine.state, bottom)));
  });
});

// ── 확정 4 ─────────────────────────────────────────────────────────────────

describe("확정 4 ura_peek × dead_wall_master — 갈아 끼운 뒷도라를 낡은 값으로 보여 줬다", () => {
  it("왕패의 주인이 뒷도라 표시패 자리를 바꾸면 이면투시 화면이 따라온다", () => {
    let st = craft({
      hands: { p0: "123456789m234p55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    st = reserveInWall(st, ["4m"]);
    st = setIndicator(st, "4m");
    const game = setup(st, [
      { def: uraPeek, holder: "p0" },
      { def: deadWallMaster, holder: "p1" },
    ]);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    status = flow.submit("p0", opt(status, "p0", "ura_peek_reveal") as never);
    const seen = [...((game.engine.state.augmentData["view:p0:ura#round"] as string[]) ?? [])];
    expect(seen).toHaveLength(1);

    status = flow.submit("p0", opt(status, "p0", "discard") as never);
    let swapped = false;
    for (let i = 0; i < 6 && status.kind === "awaiting"; i++) {
      const s = game.engine.state;
      const uraIdx = tilesOf(s, DEAD_WALL).indexOf(uraIndicatorIds(s)[0] as TileId);
      const o = opt(
        status,
        "p1",
        "dw_swap",
        (x) => (x.payload as { deadIndex: number }).deadIndex === uraIdx,
      );
      if (o !== undefined) {
        status = flow.submit("p1", o as never);
        swapped = true;
        break;
      }
      const pr = status.kind === "awaiting" ? status.prompts[0] : undefined;
      if (pr === undefined) break;
      status = flow.submit(
        pr.player,
        (pr.options.find((x) => x.type === "pass") ?? pr.options[0]) as never,
      );
    }
    expect(swapped).toBe(true); // 장면이 실제로 성립했는지

    const s = game.engine.state;
    const actual = uraIndicatorIds(s).map((id) => kindKey(kindOf(s, id)));
    const shown = [...((s.augmentData["view:p0:ura#round"] as string[]) ?? [])];
    expect(actual).not.toEqual(seen); // 실제로 갈렸는지 (전제 확인)
    // 예전에는 갱신이 DORA_FLIPPED에만 걸려 있어 화면이 확인 시점 값에서 굳었다
    expect(shown).toEqual(actual);
  });
});

// ── 의심 1 ─────────────────────────────────────────────────────────────────

describe("의심 1 foresight × bottom_deal — 밑장 쯔모가 예언 창을 잘못 깎았다", () => {
  it("패산 앞을 소모하지 않는 쯔모는 peekLeft를 깎지 않는다", () => {
    const game = setup(base("123456789m234p5s"), [
      { def: foresight, holder: "p0" },
      { def: bottomDeal, holder: "p0" },
    ]);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    status = flow.submit("p0", opt(status, "p0", "foresight_reveal") as never);
    const seen = [...((game.engine.state.augmentData["view:p0:foresight_peek#round"] as string[]) ?? [])];
    expect(seen).toHaveLength(4);

    // 밑장빼기를 예약하고, 한 바퀴 돌아 내가 최후미를 뽑는다
    status = flow.submit("p0", opt(status, "p0", "bottom_deal") as never);
    status = flow.submit("p0", opt(status, "p0", "discard") as never);
    for (let i = 0; i < 12 && status.kind === "awaiting"; i++) {
      const s = game.engine.state;
      if (s.round.phase === "turn.act" && s.round.turnSeat === 0) break;
      const pr = status.kind === "awaiting" ? status.prompts[0] : undefined;
      if (pr === undefined) break;
      status = flow.submit(
        pr.player,
        (pr.options.find((x) => x.type === "discard") ??
          pr.options.find((x) => x.type === "pass") ??
          pr.options[0]) as never,
      );
    }
    const s = game.engine.state;
    const front = tilesOf(s, WALL)
      .slice(0, 4)
      .map((id) => kindKey(kindOf(s, id)));
    const shown = [...((s.augmentData["view:p0:foresight_peek#round"] as string[]) ?? [])];
    // 남 셋이 앞 3장을 가져갔고 나는 최후미를 뽑았다 → 예언 4장 중 한 장이 아직 앞에 있다
    expect(front[0]).toBe(seen[3]);
    // 예전에는 여기서 창이 통째로 닫혀 (빈 배열) 그 한 장이 화면에서 사라졌다
    expect(shown).toEqual([seen[3]]);
  });
});
