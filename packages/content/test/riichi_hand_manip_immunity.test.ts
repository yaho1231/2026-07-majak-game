/**
 * 리치를 선언한 상대는 **손패 조작 증강의 대상이 되지 않는다.**
 *
 * 리치는 "이 손으로 텐파이 고정"이라는 약속 위에 서 있다. 손패를 바꿀 수 없는 대신
 * 대기가 굳고, 그 굳은 대기로 값을 받는다. 남이 그 손패를 건드리면 리치 플레이어는
 * 아무 대응도 못 한 채(강제 쯔모기리) 손이 통째로 망가진다 — 그래서 리치 선언자는
 * 이 간섭에서 빠진다.
 *
 * 대상은 **손패를 바꾸는** 증강뿐이다.
 *  - 포함: 통째로 바꾸기(hand_swap) · 등가교환(swap3) · 자리 바꿈(seat_swap)
 *  - 제외: 간파·투시·천리안 등 **정보만 보는** 증강 (손패가 그대로 남는다)
 *  - 제외: 누명·날치기·무덤 도굴처럼 **버림패**를 건드리는 증강
 *  - 제외: 봉인술사(discard_lock) — 손패를 읽어 '버릴 수 없음'만 표시할 뿐 패를 옮기지
 *    않는다. 게다가 발동 창이 아무도 아직 버리지 않은 국 첫머리라 리치가 존재할 수 없다.
 *  - 제외: 등 떠밀기(push_riichi) — 손패를 읽어 리치 가능 여부만 본다(패를 옮기지 않음).
 *
 * ⚠ 숨은 리치(스텔스)는 여기서 막지 않는다 — 후보 목록에서 빠지는 것 자체가
 *   "저 사람 리치다"라는 누설이기 때문이다. 그 규칙은 stealth_swap_target.test.ts가 지킨다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { ActionOption, AugmentDef, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";
import { handSwap3 } from "../src/augments/hand_swap3.js";
import { seatSwap } from "../src/augments/seat_swap.js";

const AUG_DIR = fileURLToPath(new URL("../src/augments", import.meta.url));

/** 손패를 조작하는 증강 3종과 그 대상 지정 액션 */
const CASES: { name: string; def: AugmentDef; action: string; file: string }[] = [
  { name: "통째로 바꾸기", def: fullHandSwap, action: "hand_swap", file: "full_hand_swap.ts" },
  { name: "등가교환", def: handSwap3, action: "swap3", file: "hand_swap3.ts" },
  { name: "자리 바꿈", def: seatSwap, action: "seat_swap", file: "seat_swap.ts" },
];

// ───────────────────────── ① 카탈로그 전수 계약 ─────────────────────────

describe("남의 손패를 옮기는 증강은 빠짐없이 riichiBlocksSwap을 거친다", () => {
  /** 남(target·교환 상대)의 손패 zone을 건드리는가 */
  const OTHER_HAND = /(?:handZone|handIdsOf)\((?:state,\s*)?[^)]*\b(?:target|p\.a|p\.b)\b/;
  /** 패를 실제로 **옮기는가** — 읽기만 하는 증강(봉인술사·등 떠밀기)을 여기서 가른다 */
  const MOVES_TILES = /\b(?:moveTiles|tilesMoved)\(/;

  /**
   * 이 목록이 곧 "리치 면역이 걸려야 하는 증강"의 전부다. 새 증강이 남의 손패를
   * 옮기기 시작하면 여기서 터진다 — 그때 리치 가드를 달고 이 목록에 추가한다.
   */
  it("남의 손패를 옮기는 증강은 이 셋뿐이고, 셋 다 가드를 갖고 있다", () => {
    const found: string[] = [];
    for (const file of readdirSync(AUG_DIR).filter((f) => f.endsWith(".ts"))) {
      if (file === "stealthBreak.ts") continue; // 가드 자체를 정의하는 파일
      const src = readFileSync(`${AUG_DIR}/${file}`, "utf8");
      if (!OTHER_HAND.test(src) || !MOVES_TILES.test(src)) continue;
      found.push(file);
      expect(src, `${file}: 남의 손패를 옮기는데 리치 가드가 없다`).toContain(
        "riichiBlocksSwap",
      );
    }
    expect(found.sort()).toEqual(CASES.map((c) => c.file).sort());
  });
});

// ───────────────────────── ② 실제 국면에서의 차단 ─────────────────────────

type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/** p0가 `swapper`를 들고 자기 첫 순을 맞은 국면. p1은 riichi면 **보이는** 리치. */
function scene(swapper: AugmentDef, riichi: boolean): Game {
  const base = craft({
    hands: {
      p0: "123m456m789m11p23p",
      p1: "234m345p345s678s5s",
      p2: "*",
      p3: "*",
    },
    ...(riichi ? { discards: { p1: "5s" } } : {}),
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const p1Round = base.round.byPlayer["p1"];
  if (p1Round === undefined) throw new Error("no p1 round state");
  const state: GameState = {
    ...base,
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p1: riichi
          ? { ...p1Round, riichi: { double: false, ippatsu: false, discardIndex: 0 } }
          : p1Round,
      },
    },
  };
  const game = createStandardGameFromState(withAug(state, "p0", [swapper.id]));
  installAugment(game.engine, swapper, "p0", { yaku: game.yaku });
  return game;
}

function turnOptions(game: Game, player: PlayerId): ActionOption[] {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === player)?.options ?? [];
}

describe("리치를 선언한 상대는 손패 조작의 대상이 되지 않는다", () => {
  for (const c of CASES) {
    it(`${c.name} — 리치가 없으면 p1이 후보에 뜬다 (대조군)`, () => {
      const opts = turnOptions(scene(c.def, false), "p0");
      expect(
        opts.some(
          (o) =>
            o.type === c.action && (o.payload as { target?: string }).target === "p1",
        ),
      ).toBe(true);
    });

    it(`${c.name} — 리치 중인 p1은 후보 목록(사람·봇 공용)에서 빠진다`, () => {
      const opts = turnOptions(scene(c.def, true), "p0");
      // 봇도 사람도 이 목록에서만 고른다 — 여기 없으면 리치 상대에게 낭비할 길이 없다
      expect(
        opts.some(
          (o) =>
            o.type === c.action && (o.payload as { target?: string }).target === "p1",
        ),
      ).toBe(false);
      // 능력 자체가 사라지는 것은 아니다 — 리치가 아닌 상대는 그대로 고를 수 있다
      expect(opts.some((o) => o.type === c.action)).toBe(true);
    });

    it(`${c.name} — 목록을 우회해 요청해도 엔진이 거부한다`, () => {
      const game = scene(c.def, true);
      const r = game.engine.submit({
        player: "p0",
        type: c.action,
        payload: { target: "p1" },
      });
      expect(r.ok).toBe(false);
      // 손패도 그대로 남아야 한다 — 거부인데 부분 적용이면 더 나쁘다
      expect(game.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();
    });

    it(`${c.name} — 설명에 "리치한 상대에게는 쓸 수 없다"가 적혀 있다`, () => {
      const text = `${c.def.description} ${c.def.detail ?? ""}`;
      expect(text).toMatch(/리치[^.]*(?:쓸 수 없|사용할 수 없|지정할 수 없|대상 불가|고를 수 없)/);
    });
  }
});
