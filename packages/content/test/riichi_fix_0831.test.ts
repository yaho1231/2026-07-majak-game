/**
 * 리치 축 회귀 — 2026-08-31 QA synergy4 (docs/48 A-6·A-7·C-6).
 *
 * A-6 오픈 리치의 «리치를 3판으로 취급»(+2판)이 다른 리치 판수 증강과 겹치면 정확히
 *     0이 됐다. 공탁 1,000점을 내고 오름패를 전원에게 공개하고도 남는 것이 없어
 *     «A+B가 B 단독보다 나쁜» 조합이었다 → 고정 +2판으로 덧셈이 되게 고쳤다.
 * A-7 내가 함께 든 리치 봉인·이중 선언이 내 오픈 리치의 직격 역만 게이트를 스스로
 *     막아 48,000 → 18,000이었다 → 봉인의 **주체가 나**일 때는 게이트를 내리지 않는다.
 *     (남이 잠근 좌석에서는 종전대로 역만 대신 «3판 취급»만 남는다 — synergy3 확정 1.)
 * C-6 리치 선언 버튼을 내는 5종은 한 국에 하나만 쓸 수 있다(리치는 국당 한 번).
 *     conflicts로 잠그지 않고 **카드 글에 명시**한다(사용자 결정).
 */

import { describe, expect, it } from "vitest";
import {
  AUGMENT_SYNERGY,
  DEAD_WALL,
  FlowController,
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  installAugment,
  kindKey,
  standardAugments,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
  WinInfo,
} from "@majak/core";
import { contentAugments } from "../src/index.js";
import { craft, h } from "./helpers.js";

const DEFS = new Map([...contentAugments, ...standardAugments].map((d) => [d.id, d]));
const defOf = (id: string): AugmentDef => {
  const d = DEFS.get(id);
  if (d === undefined) throw new Error(`no augment def: ${id}`);
  return d;
};

/** 도라/뒷도라 표시패를 원하는 종류로 고정한다 (왕패 4·5번 자리) */
function setIndicators(state: GameState, doraSpec: string, uraSpec: string): GameState {
  const zones: Record<string, TileId[]> = {};
  for (const z of [DEAD_WALL, WALL, "hand:p2", "hand:p3"]) {
    if (state.zones[z] !== undefined) zones[z] = [...(state.zones[z]?.tileIds ?? [])];
  }
  const swapInto = (slot: number, spec: string): void => {
    const key = kindKey(h(spec)[0] as never);
    for (const [z, ids] of Object.entries(zones)) {
      for (let i = 0; i < ids.length; i++) {
        if (z === DEAD_WALL && (i === 4 || i === 5)) continue;
        if (kindKey(state.tiles[ids[i] as TileId]?.kind as never) !== key) continue;
        const dead = zones[DEAD_WALL] as TileId[];
        const tmp = dead[slot] as TileId;
        dead[slot] = ids[i] as TileId;
        ids[i] = tmp;
        return;
      }
    }
    throw new Error(`setIndicators: no free ${spec}`);
  };
  swapInto(4, doraSpec);
  swapInto(5, uraSpec);
  const out = { ...state.zones };
  for (const [z, ids] of Object.entries(zones)) {
    out[z] = { ...(state.zones[z] as object), tileIds: ids } as never;
  }
  return { ...state, zones: out };
}

/** 패산 맨 앞을 지정한 종류로 채운다 (다음 쯔모를 고정) */
function stackWall(state: GameState, specs: string[]): GameState {
  const zones: Record<string, TileId[]> = {};
  for (const z of [WALL, DEAD_WALL, "hand:p2", "hand:p3"]) {
    if (state.zones[z] !== undefined) zones[z] = [...(state.zones[z]?.tileIds ?? [])];
  }
  const wall = zones[WALL] as TileId[];
  specs.forEach((spec, slot) => {
    const key = kindKey(h(spec)[0] as never);
    if (kindKey(state.tiles[wall[slot] as TileId]?.kind as never) === key) return;
    for (const [z, ids] of Object.entries(zones)) {
      for (let i = 0; i < ids.length; i++) {
        if (z === WALL && i <= slot) continue;
        if (z === DEAD_WALL && (i === 4 || i === 5)) continue;
        if (kindKey(state.tiles[ids[i] as TileId]?.kind as never) !== key) continue;
        const tmp = wall[slot] as TileId;
        wall[slot] = ids[i] as TileId;
        ids[i] = tmp;
        return;
      }
    }
    throw new Error(`stackWall: no free ${spec}`);
  });
  const out = { ...state.zones };
  for (const [z, ids] of Object.entries(zones)) {
    out[z] = { ...(state.zones[z] as object), tileIds: ids } as never;
  }
  return { ...state, zones: out };
}

function mkGame(state: GameState): ReturnType<typeof createStandardGameFromState> {
  const game = createStandardGameFromState(state);
  for (const p of state.players) {
    for (const id of p.augments) {
      installAugment(game.engine, defOf(id), p.id, {
        yaku: game.yaku,
        catalog: game.augments,
      });
    }
  }
  return game;
}

const optionsFor = (status: unknown, player: PlayerId): ActionOption[] => {
  const s = status as {
    kind: string;
    prompts?: { player: PlayerId; options: ActionOption[] }[];
  };
  if (s.kind !== "awaiting") return [];
  return s.prompts?.find((p) => p.player === player)?.options ?? [];
};

const P0_HAND = "123m456m789m222p1s9s"; // 1s 단기 텐파이
const P1_HAND = "234m567m234p55z2s3s";

interface Row {
  han: number;
  points: number;
  yaku: string[];
  /** open_riichi_reveal이 남긴 정산 줄 (없으면 null) */
  openBonus: { points: number; han?: number } | null;
}

/**
 * p0가 리치 계열을 선언 → p1이 곧바로 1s를 버려 p0 론. 한 국의 결과를 잰다.
 * `p1riichi`면 p1이 이미 리치 중 = 직격 역만 경로가 아닌 «3판 취급» 경로다.
 */
function play(
  p0augs: string[],
  action: string,
  opts: { p1riichi?: boolean } = {},
): Row {
  let s = craft({
    hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "567z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "5z"); // 뒷도라 없음(저타점판)
  s = stackWall(s, ["1s"]);
  s = {
    ...s,
    players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: [...p0augs] } : p)),
  };
  if (opts.p1riichi === true) {
    const rs = s.round.byPlayer["p1"];
    if (rs === undefined) throw new Error("no round state p1");
    s = {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p1: { ...rs, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
        },
      },
    };
  }

  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  const kindOfOpt = (o: ActionOption): { suit?: string; rank?: number } | undefined => {
    const id = (o.payload as { tileId?: TileId }).tileId;
    return id === undefined ? undefined : game.engine.state.tiles[id]?.kind;
  };
  const declare = optionsFor(status, "p0").find((o) => {
    const k = kindOfOpt(o);
    return o.type === action && k?.suit === "sou" && k.rank === 9;
  });
  if (declare === undefined) throw new Error(`p0 cannot ${action}`);
  status = flow.submit("p0", declare);

  // 선언 뒤의 론/펑 프롬프트는 전부 패스
  for (let i = 0; i < 10; i++) {
    const st = status as {
      kind: string;
      prompts?: { player: PlayerId; options: ActionOption[] }[];
    };
    if (st.kind !== "awaiting") break;
    const pr = st.prompts?.find((x) => x.options.some((o) => o.type === "pass"));
    if (pr === undefined) break;
    status = flow.submit(pr.player, pr.options.find((o) => o.type === "pass") as ActionOption);
  }

  const d = optionsFor(status, "p1").find((o) => {
    const k = kindOfOpt(o);
    return o.type === "discard" && k?.suit === "sou" && k.rank === 1;
  });
  if (d === undefined) throw new Error("p1 cannot discard 1s");
  status = flow.submit("p1", d);

  // p0가 론한다
  for (let i = 0; i < 20; i++) {
    const st = status as {
      kind: string;
      prompts?: { player: PlayerId; options: ActionOption[] }[];
    };
    if (st.kind !== "awaiting") break;
    const win = optionsFor(status, "p0").find((o) => o.type === "win");
    if (win !== undefined) {
      status = flow.submit("p0", win);
      continue;
    }
    const pr = st.prompts?.[0];
    if (pr === undefined) break;
    const opt = pr.options.find((o) => o.type === "pass") ?? pr.options[0];
    if (opt === undefined) break;
    status = flow.submit(pr.player, opt);
  }

  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type !== ROUND_SETTLED) continue;
    const p = e.payload as RoundSettledPayload;
    const info = (p.winInfos ?? []).find((w) => w.winner === "p0") as WinInfo | undefined;
    if (info === undefined) throw new Error("p0 did not win");
    const note = (p.augPoints ?? []).find(
      (n) => n.player === "p0" && n.augId === "open_riichi_reveal",
    );
    return {
      han: info.han,
      points: info.points,
      yaku: (info.yaku ?? []).map((y) =>
        typeof y === "string" ? y : (y as { id: string }).id,
      ),
      openBonus: note === undefined ? null : { points: note.points, han: note.han },
    };
  }
  throw new Error("no settlement");
}

// ────────────────── A-6 ──────────────────

describe("A-6 오픈 리치의 «3판 취급»은 다른 리치 판수 증강 위에 더해진다", () => {
  it("단독일 때 +2판이 붙는다", () => {
    const r = play(["open_riichi_reveal"], "open_riichi", { p1riichi: true });
    expect(r.openBonus?.han).toBe(2);
    expect(r.openBonus?.points ?? 0).toBeGreaterThan(0);
  });

  for (const other of ["late_double", "riichi_upgrade"]) {
    it(`${other}와 겹쳐도 +2판이 그대로 남는다 (예전엔 정확히 0)`, () => {
      const solo = play([other], "riichi", { p1riichi: true });
      const both = play(["open_riichi_reveal", other], "open_riichi", { p1riichi: true });
      // 판수 카드가 실린 것은 그대로 (같은 밑값 위에서 잰다)
      expect(both.points).toBe(solo.points);
      // 오픈 리치의 몫이 살아 있다 — 공탁 1,000점과 오름패 공개의 대가가 헛되지 않는다
      expect(both.openBonus?.han, other).toBe(2);
      expect(both.openBonus?.points ?? 0, other).toBeGreaterThan(0);
    });
  }

  it("둘 다 겹쳐도(late_double + riichi_upgrade) 0이 되지 않는다", () => {
    const both = play(
      ["open_riichi_reveal", "late_double", "riichi_upgrade"],
      "open_riichi",
      { p1riichi: true },
    );
    expect(both.openBonus?.han).toBe(2);
    expect(both.openBonus?.points ?? 0).toBeGreaterThan(0);
  });
});

// ────────────────── A-7 ──────────────────

describe("A-7 내 봉인이 내 오픈 리치의 직격 역만을 지우지 않는다", () => {
  it("봉인 없이 비리치 상대에게서 론하면 역만이다", () => {
    const r = play(["open_riichi_reveal"], "open_riichi");
    expect(r.yaku).toContain("open_riichi_strike");
    expect(r.points).toBeGreaterThanOrEqual(48000);
  });

  for (const seal of ["riichi_seal", "riichi_upgrade"]) {
    it(`${seal}을 내가 함께 들어도 역만은 그대로다`, () => {
      const r = play(["open_riichi_reveal", seal], "open_riichi");
      expect(r.yaku, seal).toContain("open_riichi_strike");
      expect(r.points, seal).toBeGreaterThanOrEqual(48000);
    });
  }
});

// ────────────────── C-6 ──────────────────

describe("C-6 리치 선언 5종은 «국당 하나만»이라고 글에 적혀 있다", () => {
  const DECLARERS = Object.entries(AUGMENT_SYNERGY)
    .filter(([, v]) => (v.tags ?? []).includes("riichi_declare"))
    .map(([id]) => id);

  it("riichi_declare 축이 다섯 장이다", () => {
    expect(DECLARERS.length).toBe(5);
  });

  for (const id of DECLARERS) {
    it(`${id} — 설명 첫머리와 detail이 국당 1회 제한을 말한다`, () => {
      const def = defOf(id);
      expect(def.description, id).toContain("리치는 국당 한 번");
      expect(def.detail ?? "", id).toContain("리치는 국당 한 번이므로");
    });
  }
});
