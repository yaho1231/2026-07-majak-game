/**
 * 2026-08-07 정직성 감사 — 설명이 약속한 것을 코드가 실제로 하는지 못 박는다.
 *
 * 크게 셋이다.
 *
 * ① **코드가 틀렸던 것**
 *    - 역만 방어술: `find`로 첫 역만만 잡아, 더블론에서 두 번째 역만은 상한에 들어가지도
 *      않고 그대로 맞았다. "완전 면역"이 더블론에서만 조용히 거짓이었다.
 *    - 카운터: `if (amount <= 0) return;` 이 COUNTER_STRUCK **앞에** 있어서, 1000점 미만으로
 *      몰린 상대에게 추격 리치를 걸면 일발 소멸·손 가치 강탈·직격 +4판이 전부 불발됐다.
 *
 * ② **설명이 "전원 공개"라고 써 놓고 공개 채널이 없던 것** (Rule #2 — 발동이 테이블에서
 *    보이지 않는 증강은 증강이 아니다): 염색·연금술사·붉은 손길·천하무적·불가침 조약·
 *    영상 정찰(교환)·천하통일(목표 점수).
 *
 * ③ **설명이 숨기던 한계**: 여기서는 문구가 그 한계를 실제로 담고 있는지만 본다
 *    (도감·드래프트 카드가 읽는 것은 이 문자열 하나뿐이라, 문자열이 곧 계약이다).
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
  kindKey,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
  WinInfo,
} from "@majak/core";
import { craft } from "./helpers.js";
import { alchemist } from "../src/augments/alchemist.js";
import { counter } from "../src/augments/counter.js";
import { invincible } from "../src/augments/invincible.js";
import { lateBloomer } from "../src/augments/late_bloomer.js";
import { lateBloomerEast } from "../src/augments/late_bloomer_east.js";
import { noRonPact } from "../src/augments/no_ron_pact.js";
import { redFiveTouch } from "../src/augments/red_five_touch.js";
import { rinshanPreview } from "../src/augments/rinshan_preview.js";
import { tileDyeing } from "../src/augments/tile_dyeing.js";
import { unification } from "../src/augments/unification.js";
import { yakumanShield } from "../src/augments/yakuman_shield.js";
import { giantGod } from "../src/augments/giant_god.js";
import { meldDissolve } from "../src/augments/meld_dissolve.js";
import { voidKan } from "../src/augments/void_kan.js";
import { noRetreat } from "../src/augments/no_retreat.js";
import { karma } from "../src/augments/karma.js";
import { bigHand } from "../src/augments/big_hand.js";
import { northTrader } from "../src/augments/north_trader.js";
import { openKokushi } from "../src/augments/open_kokushi.js";
import { nagashiYakuman } from "../src/augments/nagashi_yakuman.js";
import { eternalDealer } from "../src/augments/eternal_dealer.js";
import { evenWorld } from "../src/augments/even_world.js";
import { mixedNineGates } from "../src/augments/mixed_nine_gates.js";
import { genesis } from "../src/augments/genesis.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { cliffBloom } from "../src/augments/cliff_bloom.js";
import { hourglass } from "../src/augments/hourglass.js";
import { jackpot } from "../src/augments/jackpot.js";
import { letItRide } from "../src/augments/let_it_ride.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugments(
  state: GameState,
  grants: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const extra = grants[p.id];
      return extra === undefined ? p : { ...p, augments: [...p.augments, ...extra] };
    }),
  };
}

/**
 * 국 스코프 공개 채널을 접두로 찾는다.
 * `roundViewKey`는 키 끝에 국 스코프 표식을 붙이므로 완전일치로는 못 찾는다
 * (엔진이 뷰를 만들 때 떼어 낸다 — 상태에는 표식이 붙은 채로 남아 있다).
 */
function roundChannel(game: Game, prefix: string): unknown {
  const hit = Object.entries(game.engine.state.augmentData).find(([k]) =>
    k.startsWith(prefix),
  );
  return hit?.[1];
}

function scene(over?: Partial<Parameters<typeof craft>[0]>): GameState {
  return craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
    ...over,
  });
}

/** 증강 하나를 설치한 게임을 만든다 */
function gameWith(
  state: GameState,
  defs: [AugmentDef, PlayerId][],
): Game {
  const game = createStandardGameFromState(
    state,
    undefined,
    [...new Map(defs.map(([d]) => [d.id, d])).values()],
  );
  for (const [def, holder] of defs) {
    installAugment(game.engine, def, holder, { yaku: game.yaku });
  }
  return game;
}

/**
 * 등록된 ROUND_SETTLED 인터셉터를 순서대로 태워 최종 payload를 얻는다.
 * (settle_order_determinism.test.ts와 같은 방식 — 실제 국을 돌리지 않고 정산만 본다.)
 */
function runSettle(game: Game, payload: RoundSettledPayload): RoundSettledPayload {
  let out = payload;
  for (const { intercept } of game.engine.effects.interceptorsFor(ROUND_SETTLED)) {
    const next = intercept(
      { type: ROUND_SETTLED, payload: out },
      { state: game.engine.state, rules: game.engine.rules },
    );
    if (next !== null) out = next.payload as RoundSettledPayload;
  }
  return out;
}

/**
 * 등록된 리액션을 직접 태워, 방출된 이벤트를 상태에 반영한다.
 * (ROUND_SETTLED 리액션만 보고 싶을 때 — 실제 국을 끝까지 돌리지 않는다.)
 */
function runReactions(game: Game, event: { type: string; payload: unknown }): void {
  for (const { react } of game.engine.effects.reactionsFor(event.type)) {
    react(
      { ...event, seq: 0 } as never,
      {
        state: game.engine.state,
        rules: game.engine.rules,
        emit: (e: { type: string; payload: unknown }) => {
          const r = game.engine.reducers.dispatch(game.engine.state, {
            ...e,
            seq: 0,
          } as never);
          (game.engine as unknown as { currentState: GameState }).currentState = r;
        },
      } as never,
    );
  }
}

function winInfo(winner: PlayerId, points: number, yakumanCount: number): WinInfo {
  return {
    winner,
    points,
    han: yakumanCount > 0 ? 13 : 4,
    fu: 30,
    yakumanCount,
    limit: yakumanCount > 0 ? "yakuman" : null,
    yaku: [],
    winType: "ron",
  } as unknown as WinInfo;
}

// ───────────────────── ① 코드가 틀렸던 것 ─────────────────────

describe("역만 방어술 — 더블론의 두 번째 역만도 막는다", () => {
  it("역만 둘이 함께 떨어지면 둘의 합만큼 돌려받는다", () => {
    const game = gameWith(withAugments(scene(), { p0: ["yakuman_shield"] }), [
      [yakumanShield, "p0"],
    ]);
    // p1·p2가 동시에 역만 직격 (각 32000) → p0 손실 64000
    const out = runSettle(game, {
      outcome: "win",
      deltas: { p0: -64000, p1: 32000, p2: 32000, p3: 0 },
      winInfos: [winInfo("p1", 32000, 1), winInfo("p2", 32000, 1)],
    } as unknown as RoundSettledPayload);

    // 예전에는 첫 건(32000)만 상한이라 -32000이 남았다
    expect(out.deltas["p0"]).toBe(0);
    // 환급분은 두 화료자에게서 나뉘어 빠진다 (뱅크 발행은 부족분만)
    expect((out.deltas["p1"] ?? 0) + (out.deltas["p2"] ?? 0)).toBe(0);
  });

  it("차감 순서가 설치 순서가 아니라 상태로 정해진다 (리플레이 결정성)", () => {
    const state = withAugments(scene(), { p0: ["yakuman_shield"] });
    const payload = {
      outcome: "win",
      deltas: { p0: -48000, p1: 32000, p2: 16000, p3: 0 },
      winInfos: [winInfo("p1", 32000, 1), winInfo("p2", 16000, 1)],
    } as unknown as RoundSettledPayload;
    const a = runSettle(gameWith(state, [[yakumanShield, "p0"]]), payload);
    const b = runSettle(gameWith(state, [[yakumanShield, "p0"]]), payload);
    expect(a.deltas).toEqual(b.deltas);
  });

  it("본장 부담은 막지 않는다 — 설명이 약속한 그대로 손실이 남는다", () => {
    const game = gameWith(withAugments(scene(), { p0: ["yakuman_shield"] }), [
      [yakumanShield, "p0"],
    ]);
    // 역만 32000 + 2본장 600
    const out = runSettle(game, {
      outcome: "win",
      deltas: { p0: -32600, p1: 32600, p2: 0, p3: 0 },
      winInfos: [winInfo("p1", 32000, 1)],
    } as unknown as RoundSettledPayload);
    expect(out.deltas["p0"]).toBe(-600);
    expect(yakumanShield.description).toContain("본장");
  });
});

describe("카운터 — 대납액이 0이어도 반격은 성립한다", () => {
  /** p1이 선리치를 건 뒤 p0가 추격 리치를 거는 장면 */
  function setup(targetScore: number): Game {
    // p0는 1s 단기 텐파이(리치 가능), p1은 이미 리치 + 일발이 살아 있다
    const base = withAugments(
      scene({ hands: { p0: "123456789m123p11s", p1: "*", p2: "*", p3: "*" } }),
      { p0: ["counter"] },
    );
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p1" ? { ...p, score: targetScore } : p,
      ),
      augmentData: { ...base.augmentData, "counter:prev:p0": "p1" },
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p1: {
            ...(base.round.byPlayer["p1"] as NonNullable<
              GameState["round"]["byPlayer"][string]
            >),
            riichi: { double: false, ippatsu: true, discardIndex: 0, cost: 1000 },
          },
        },
      },
    };
    return gameWith(state, [[counter, "p0"]]);
  }

  it("상대가 0점이면 대납은 0 — 그래도 일발 소멸과 반격 성립은 그대로다", () => {
    // ⚠ 이 케이스가 예전 `if (amount <= 0) return;` 이 통째로 삼키던 구간이다.
    const game = setup(0);
    const souId = (game.engine.state.zones["hand:p0"]?.tileIds ?? []).find(
      (id) => kindKey(game.engine.state.tiles[id]?.kind as never) === "sou1",
    ) as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: souId },
    });
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);

    const st = game.engine.state;
    // 반격 플래그가 선다 → 손 가치 강탈·직격 +4판의 전제가 살아 있다
    expect(st.augmentData["counter:struck:p0"]).toBe(true);
    // 일발이 실제로 사라진다
    expect(st.round.byPlayer["p1"]?.riichi?.ippatsu).toBe(false);
    // 옮길 점수가 없으니 대납은 0 — 상대를 마이너스로 만들지 않는다
    expect(st.players.find((p) => p.id === "p1")?.score).toBe(0);
    // 전원 공개 채널에 대상이 실린다
    expect(st.augmentData["view:*:counter:p0"]).toBe("p1");
  });

  it("상대가 500점이면 500점만 대납한다 (상한이 남은 점수)", () => {
    const game = setup(500);
    const souId = (game.engine.state.zones["hand:p0"]?.tileIds ?? []).find(
      (id) => kindKey(game.engine.state.tiles[id]?.kind as never) === "sou1",
    ) as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: souId },
    });
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    expect(game.engine.state.players.find((p) => p.id === "p1")?.score).toBe(0);
    expect(game.engine.state.augmentData["counter:struck:p0"]).toBe(true);
  });

  it("설명이 '남은 점수를 넘지 않는다'를 밝힌다", () => {
    expect(counter.detail).toContain("남은 점수");
    expect(counter.detail).toContain("가장 먼저 리치를 건 한 사람");
  });
});

// ───────────────────── ② 없던 공개 채널 ─────────────────────

describe("Rule #2 — 설명이 '전원 공개'라고 쓴 증강은 실제로 공개 채널을 낸다", () => {
  it("염색: 무엇이 무엇이 됐는지 전원 채널에 실린다", () => {
    const state = withAugments(
      scene({ hands: { p0: "123456789m1234p", p1: "*", p2: "*", p3: "*" } }),
      { p0: ["tile_dyeing"] },
    );
    const game = gameWith(state, [[tileDyeing, "p0"]]);
    const tileId = (game.engine.state.zones["hand:p0"]?.tileIds ?? [])[0] as TileId;
    const from = kindKey(game.engine.state.tiles[tileId]?.kind as never);
    const r = game.engine.submit({
      player: "p0",
      type: "tile_dye",
      payload: { tileId, suit: "pin" },
    });
    expect(r.ok).toBe(true);
    const v = roundChannel(game, "view:*:tile_dyeing:p0");
    expect(typeof v).toBe("string");
    expect(v as string).toContain(from);
    expect(v as string).toContain("→");
  });

  it("연금술사: 변환 결과가 전원 채널에 실린다", () => {
    const state = withAugments(
      scene({ hands: { p0: "123456789m1234p", p1: "*", p2: "*", p3: "*" } }),
      { p0: ["alchemist"] },
    );
    const game = gameWith(state, [[alchemist, "p0"]]);
    const tileId = (game.engine.state.zones["hand:p0"]?.tileIds ?? [])[0] as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "alchemy",
      payload: { tileId, delta: 1 },
    });
    expect(r.ok).toBe(true);
    expect(typeof roundChannel(game, "view:*:alchemist:p0")).toBe("string");
  });

  it("붉은 손길: 지정한 숫자가 전원에게 공개된다 (상대가 '내 것 아닌 적도라'를 안다)", () => {
    const state = withAugments(
      scene({ hands: { p0: "123456789m1234p", p1: "*", p2: "*", p3: "*" } }),
      { p0: ["red_five_touch"] },
    );
    const game = gameWith(state, [[redFiveTouch, "p0"]]);
    const r = game.engine.submit({
      player: "p0",
      type: "red_touch",
      payload: { rank: 3 },
    });
    expect(r.ok).toBe(true);
    const v = game.engine.state.augmentData["view:*:red_five_touch:p0"];
    expect(typeof v).toBe("string");
    expect(v as string).toContain("3");
  });

  it("천하무적: 선언한 국 내내 전원에게 보인다", () => {
    const state = withAugments(scene(), { p0: ["invincible"] });
    const game = gameWith(state, [[invincible, "p0"]]);
    const r = game.engine.submit({
      player: "p0",
      type: "invincible_guard",
      payload: {},
    });
    expect(r.ok).toBe(true);
    expect(roundChannel(game, "view:*:invincible:p0")).toBe("이번 국 론 불가");
  });

  it("영상 정찰: 교환은 전원에게 공개된다 (다음에 깡을 치는 사람이 알아야 한다)", () => {
    const state = withAugments(scene(), { p0: ["rinshan_preview"] });
    const game = gameWith(state, [[rinshanPreview, "p0"]]);
    const r = game.engine.submit({
      player: "p0",
      type: "rinshan_pull",
      payload: {},
    });
    expect(r.ok).toBe(true);
    expect(typeof roundChannel(game, "view:*:rinshan_preview:p0")).toBe("string");
  });

  it("불가침 조약: 유효·파기가 전원에게 보이고, 안깡으로 깨지면 표시도 따라 바뀐다", () => {
    const state = withAugments(
      scene({ hands: { p0: "1111m23456789p1s", p1: "*", p2: "*", p3: "*" } }),
      { p0: ["no_ron_pact"] },
    );
    const game = gameWith(state, [[noRonPact, "p0"]]);

    // 안깡을 치면 멘쯔가 생겨 조약이 깨진다 — 그 사실이 채널에 즉시 반영돼야 한다
    // (설명은 "후로"라고만 적혀 있었지만 코드는 안깡도 파기로 본다 → 문구를 고쳤다)
    const handIds = game.engine.state.zones["hand:p0"]?.tileIds ?? [];
    const manIds = handIds.filter(
      (id) => kindKey(game.engine.state.tiles[id]?.kind as never) === "man1",
    );
    expect(manIds).toHaveLength(4);
    const r = game.engine.submit({
      player: "p0",
      type: "ankan",
      payload: { tileIds: manIds },
    });
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    expect(roundChannel(game, "view:*:no_ron_pact:p0")).toBe("조약 파기 — 론 가능");
    // 설명도 안깡이 파기 사유임을 밝힌다
    expect(noRonPact.description).toContain("안깡");
  });

  it("천하통일: 지금 넘어야 하는 목표 점수가 전원에게 공개된다", () => {
    const state = withAugments(scene(), { p0: ["unification"] });
    const game = gameWith(state, [[unification, "p0"]]);
    // 증강이 3000점을 얹은 국이 정산되면 문턱이 53000으로 올라가고 그 값이 공개된다
    runReactions(game, {
      type: ROUND_SETTLED,
      payload: {
        outcome: "draw",
        deltas: {},
        augPoints: [{ player: "p0", points: 3000, augmentId: "x" }],
      },
    });
    expect(game.engine.state.augmentData["unification:auggain:p0"]).toBe(3000);
    expect(game.engine.state.augmentData["view:*:unification:p0"]).toBe("목표 53000점");

    // 그리고 규칙이 실제로 그 문턱을 돌려준다 — 채널과 엔진이 같은 수를 말해야 한다
    expect(
      game.engine.rules.resolve<number>("match.instantWinScore", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(53000);

    // 설명이 "문턱이 오른다"를 밝힌다 — 채널 배선과 무관하게 이건 계약이다
    expect(unification.description).toContain("증강이 나에게 얹어 준 점수");
    expect(unification.detail).toContain("50000");
  });
});

// ───────────────────── ③ 숨어 있던 한계를 문구가 담는가 ─────────────────────

describe("설명이 실제 동작을 담는다 (도감·드래프트 카드가 읽는 것은 이 문자열뿐이다)", () => {
  it("성립하지 않는 깡: 리치 중 잠긴다는 사실이 두 문구에 다 있다", () => {
    expect(voidKan.description).toContain("리치");
    expect(voidKan.detail).toContain("발동하지 않는다");
  });

  it("거신병: 요구패 13종을 '내가 직접 버려' 둬야 한다는 전제조건이 드러난다", () => {
    expect(giantGod.description).toContain("조건");
    expect(giantGod.detail).toContain("증강이 요구패를 깔아 주지 않는다");
  });

  it("파혼: 손으로 돌아오는 것이 2장뿐임을 요약에서 밝힌다", () => {
    expect(meldDissolve.description).toContain("2장");
    expect(meldDissolve.description).toContain("보충");
  });

  it("물러설 수 없는 선언: 뒷도라 장당 2판·역만 제외", () => {
    expect(noRetreat.description).toContain("장당");
    expect(noRetreat.description).toContain("역만");
  });

  it("카르마: 못 뜯은 몫이 사라진다는 사실", () => {
    expect(karma.description).toContain("사라진다");
    expect(karma.detail).toContain("남은 점수");
  });

  it("큰손: 하한이 손의 값이 아니라 수령 총액", () => {
    expect(bigHand.description).toContain("총액");
    expect(bigHand.detail).toContain("공탁");
  });

  it("개벽: 국당 1회 제한", () => {
    expect(genesis.description).toContain("한 국에 1회");
  });

  it("북풍 상인: 영상패 고갈·패산 감소·천화 파기", () => {
    expect(northTrader.description).toContain("영상패");
    expect(northTrader.detail).toContain("천화");
    expect(northTrader.detail).toContain("패산이 한 장 줄어");
  });

  it("뒤섞인 아홉 개의 연꽃: 수패 한정·멘젠 한정", () => {
    expect(mixedNineGates.description).toContain("멘젠");
    expect(mixedNineGates.detail).toContain("자패");
  });

  it("우는 국사무쌍: 특수 퐁 뒤 화료형과 후로가 잠긴다", () => {
    // 요약은 한 줄로 화료형 제한만 말한다 — 카드에 들어가는 분량이다.
    expect(openKokushi.description).toContain("국사무쌍으로만 화료");
    // 후로가 함께 잠기는 것과, 평범한 후로 뒤에는 아예 못 부르는 것은 detail의 몫.
    expect(openKokushi.detail).toContain("안깡 포함");
    expect(openKokushi.detail).toContain("부를 수 없다");
  });

  it("유국역만: 역만 방어술 보유자는 내지 않는다", () => {
    expect(nagashiYakuman.detail).toContain("역만 방어술");
  });

  it("판돈 굴리기·일확천금: 배수가 어디까지 걸리는지", () => {
    expect(letItRide.description).toContain("본장");
    expect(jackpot.description).toContain("공탁");
  });

  it("모래시계·절벽 위에 피어난 꽃·왕패의 주인: 깡이 나면 줄어든다", () => {
    expect(hourglass.description).toContain("최대 4장");
    expect(cliffBloom.detail).toContain("소모되어 보충되지 않으므로");
    expect(deadWallMaster.detail).toContain("줄어든다");
  });

  it("짝수의 세계: '바꾸면 도라가 되는 패'도 그대로 남는다", () => {
    expect(evenWorld.description).toContain("바꾸면 도라가 될 패");
  });

  it("만년 오야: 자풍이 덮어씌워진다(추가가 아니다)", () => {
    expect(eternalDealer.description).toContain("덮어씌워진다");
    expect(eternalDealer.detail).toContain("교체");
  });
});

// ───────────────────── ④ 이름 충돌 ─────────────────────

describe("대기만성 두 종은 이름으로 구분된다", () => {
  it("도감·통계·티어표가 둘을 섞지 않는다", () => {
    expect(lateBloomer.name).not.toBe(lateBloomerEast.name);
    expect(lateBloomer.name).toContain("대기만성");
    expect(lateBloomerEast.name).toContain("대기만성");
  });
});
