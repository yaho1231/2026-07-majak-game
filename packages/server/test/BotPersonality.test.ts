/**
 * 성격 — **같은 판을 다르게 치는 네 사람**이 탁에 앉는가.
 *
 * 예전에는 성격값 넷을 각각 따로 뽑았다. 그러면 앞뒤가 안 맞는 사람이 나오고
 * (저돌적인데 아무것도 안 울고 다마텐만 고르는 봇), 독립 난수 넷을 평균 근처로
 * 뽑으니 결국 **넷 다 비슷해졌다** — 미묘하게 다른 같은 사람 넷.
 *
 * 게다가 후로 판단을 EV로 옮기면서 `callLoose`가 **어디에서도 읽히지 않게 됐다.**
 * 성격 넷 중 하나가 조용히 죽어 있었다.
 *
 * 여기서 잡는 것:
 *   1. 원형이 서로 뚜렷이 다르고, 값들이 한 사람으로서 얽혀 있는가
 *   2. 그 차이가 실제 결정(후로·타점·리치)을 가르는가
 *   3. 사람다운 흔들림·허세가 **실력을 깎지 않고** 붙는가
 */

import { describe, expect, it } from "vitest";
import { Prng } from "@majak/core";
import type { TileId } from "@majak/core";
import {
  ARCHETYPE_NAMES,
  profileOf,
  rollProfile,
  rollTableProfiles,
  withDifficulty,
} from "../src/bot/profile.js";
import type { ArchetypeName } from "../src/bot/profile.js";
import { bidDiscard } from "../src/bot/discard.js";
import { bidCall, bidPass } from "../src/bot/call.js";
import { buildRead } from "../src/bot/read.js";
import { botScene } from "./botTestView.js";
import type { BotScene } from "./botTestView.js";

function pickedKind(scene: BotScene, option: { payload: unknown } | null | undefined): string {
  const tileId = (option?.payload as { tileId?: TileId } | undefined)?.tileId;
  const kind = tileId !== undefined ? scene.view.tiles[tileId]?.kind : undefined;
  if (kind === undefined) return "none";
  const suit =
    kind.suit === "man" ? "m" : kind.suit === "pin" ? "p" : kind.suit === "sou" ? "s" : "z";
  return `${kind.suit === "dragon" ? kind.rank + 4 : kind.rank}${suit}`;
}

/** 흔들림용 난수 — 항상 i번째를 고른다(결정론 테스트) */
const pickNth = (i: number) => ({ int: (n: number) => Math.min(i, n - 1) });

describe("원형 — 값들이 한 사람으로서 얽혀 있다", () => {
  it("공격형과 수비형은 미는 정도가 뚜렷이 갈린다", () => {
    expect(profileOf("attacker").aggression).toBeGreaterThan(
      profileOf("defender").aggression + 0.4,
    );
  });

  it("타점형은 손을 안 열고, 속공형은 뭐든 운다 — 같은 사람의 다른 축이 아니다", () => {
    expect(profileOf("valueHunter").callLoose).toBeLessThan(profileOf("speedster").callLoose);
    expect(profileOf("valueHunter").valueBias).toBeGreaterThan(
      profileOf("speedster").valueBias,
    );
    // 타점형은 기다리는 사람이다 — 참을성도 함께 높다(따로 뽑은 값이 아니다)
    expect(profileOf("valueHunter").patience).toBeGreaterThan(
      profileOf("speedster").patience,
    );
  });

  it("변덕형만 흔들림이 크다", () => {
    for (const name of ARCHETYPE_NAMES) {
      if (name === "wildcard") continue;
      expect(profileOf(name).noise).toBeLessThan(profileOf("wildcard").noise);
    }
  });

  it("시드가 같으면 같은 사람이 나온다 (리플레이가 깨지지 않는다)", () => {
    expect(rollProfile(new Prng(7))).toEqual(rollProfile(new Prng(7)));
  });

  it("시드를 바꾸면 여러 원형이 골고루 나온다 (탁이 한 사람으로 채워지지 않는다)", () => {
    const seen = new Set<ArchetypeName>();
    for (let s = 0; s < 60; s++) seen.add(rollProfile(new Prng(s)).archetype);
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("같은 원형의 두 봇이 완전히 같지는 않다", () => {
    const many = Array.from({ length: 60 }, (_, s) => rollProfile(new Prng(s)));
    const attackers = many.filter((p) => p.archetype === "attacker");
    if (attackers.length >= 2) {
      expect(new Set(attackers.map((p) => p.aggression)).size).toBeGreaterThan(1);
    }
  });
});

describe("타점이냐 속도냐 — 같은 손의 값을 다르게 느낀다", () => {
  /**
   * 같은 형태의 손을 도라가 있을 때와 없을 때로 나눠 놓고, 그 **값 차이를 얼마나
   * 크게 느끼는가**를 본다. 타점형에게 도라 두 장은 판을 바꾸는 사건이고, 속공형에게는
   * 있으면 좋은 것이다 — 어느 쪽도 틀리지 않아서 EV를 뒤엎지 않고 기울이기만 한다.
   */
  const ratio = (name: ArchetypeName): number => {
    const mk = (dora?: string) =>
      botScene({
        hand: "123m456m789m11p56s1z",
        turnCount: 5,
        ...(dora !== undefined ? { doraIndicator: dora } : {}),
      });
    const rich = mk("9p"); // 1p가 도라 → 손에 2장
    const poor = mk();
    const at = (s: BotScene): number =>
      bidDiscard(buildRead(s.view, "p0"), s.discardOptions(), null, profileOf(name))?.value ??
      0;
    return at(rich) / at(poor);
  };

  it("타점형은 도라가 붙었을 때의 차이를 속공형보다 크게 느낀다", () => {
    expect(ratio("valueHunter")).toBeGreaterThan(ratio("speedster") * 1.5);
  });
});

describe("후로 취향 — 죽어 있던 성격값을 되살린다", () => {
  /** 5s 펑으로 탕야오 방향이 서는 손 */
  const scene = () =>
    botScene({
      hand: "234m567m345p55s7s",
      lastDiscard: { player: "p3", spec: "5s" },
      turnCount: 6,
    });

  const callBid = (name: ArchetypeName): number => {
    const s = scene();
    const read = buildRead(s.view, "p0");
    const options = [
      { type: "pon", payload: { tileIds: [s.idOf("5s"), s.idOf("5s")] } },
      { type: "pass", payload: {} },
    ];
    const call = bidCall(read, options, null, profileOf(name));
    const pass = bidPass(read, options, null, profileOf(name));
    // 콜이 패스를 얼마나 앞서는가 — 성격이 이 차이를 가른다
    return (call?.value ?? -Infinity) - (pass?.value ?? 0);
  };

  it("속공형은 같은 콜을 타점형보다 훨씬 반긴다", () => {
    expect(callBid("speedster")).toBeGreaterThan(callBid("valueHunter"));
  });
});

describe("흔들림 — 사람답되 실력을 깎지 않는다", () => {
  const scene = () => botScene({ hand: "123m456m789m11p56s1z", turnCount: 5 });

  it("난수를 안 주면 항상 같은 한 장을 고른다 (평가자는 결정론적이다)", () => {
    const s = scene();
    const read = buildRead(s.view, "p0");
    const a = bidDiscard(read, s.discardOptions(), null, profileOf("wildcard"));
    const b = bidDiscard(read, s.discardOptions(), null, profileOf("wildcard"));
    expect(pickedKind(s, a?.option)).toBe(pickedKind(s, b?.option));
  });

  it("손해가 뚜렷한 패는 아무리 변덕스러워도 고르지 않는다", () => {
    // 이 손에서 1z 말고 다른 패를 버리면 텐파이가 깨진다 — 흔들림의 폭 밖이다
    const s = scene();
    const read = buildRead(s.view, "p0");
    for (let i = 0; i < 14; i++) {
      const bid = bidDiscard(read, s.discardOptions(), null, profileOf("wildcard"), pickNth(i));
      expect(pickedKind(s, bid?.option)).toBe("1z");
    }
  });

  it("값이 엇비슷한 후보가 여럿이면 변덕형은 갈리고 수비형은 덜 갈린다", () => {
    // 배패 직후의 잡손 — 어느 패를 흘려도 값이 고만고만하다
    const s = botScene({ hand: "147m258p369s1234z", turnCount: 1 });
    const read = buildRead(s.view, "p0");
    const spread = (name: ArchetypeName): number => {
      const seen = new Set<string>();
      for (let i = 0; i < 14; i++) {
        seen.add(
          pickedKind(s, bidDiscard(read, s.discardOptions(), null, profileOf(name), pickNth(i))?.option),
        );
      }
      return seen.size;
    };
    expect(spread("wildcard")).toBeGreaterThan(spread("defender"));
  });
});

describe("허세 — 값을 치르지 않는 거짓말", () => {
  /**
   * 종반, p1 리치, 내 손은 가망이 없다. 4m과 5z가 둘 다 p1의 현물이라 **안전도가
   * 똑같고**, 형태로 보면 이어질 여지가 있는 4m을 남기고 5z를 흘리는 쪽이 아주 조금
   * 낫다. 허세가 센 봇은 그 아주 조금을 포기하고 4m을 흘려 **아직 미는 것처럼**
   * 보이게 한다 — 이 봇의 상대 읽기가 "종반 중장패"를 텐파이 신호로 잡으므로
   * 같은 탁의 봇들에게 실제로 통하는 거짓말이다.
   */
  const scene = () =>
    botScene({
      hand: "147m258p13699s5z7z",
      riichi: ["p1"],
      /**
       * 두 후보(4만·5백)가 **셋 모두에게** 현물이어야 한다. 2026-08-08에 다마텐 경사를
       * 채택한 뒤로는 조용한 멘젠 상대에게도 위협이 붙어, 리치자에게만 현물인 4만이
       * 자패 5백보다 위험해진다 — 그러면 "같은 안전패 중 고른다"는 전제가 깨져 허세가
       * 아니라 안전이 답을 정해 버린다.
       */
      discards: { p1: "4m5z", p2: "4m5z", p3: "4m5z" },
      turnCount: 16,
      wallLeft: 8,
    });

  it("허세가 없으면 형태대로 자패를 흘린다", () => {
    const s = scene();
    const read = buildRead(s.view, "p0");
    const honest = { ...profileOf("balanced"), bluff: 0 };
    expect(pickedKind(s, bidDiscard(read, s.discardOptions(), null, honest)?.option)).toBe("5z");
  });

  it("허세가 세면 같은 안전패 중 세 보이는 쪽을 고른다", () => {
    const s = scene();
    const read = buildRead(s.view, "p0");
    const bluffer = { ...profileOf("balanced"), bluff: 1 };
    expect(pickedKind(s, bidDiscard(read, s.discardOptions(), null, bluffer)?.option)).toBe("4m");
  });

  it("허세는 안전을 이기지 못한다 — 위험패를 허세로 내지는 않는다", () => {
    // 5p는 아무도 안 버린 무스지 중장패다. 허세 가산점보다 기대 실점이 훨씬 크다.
    const s = botScene({
      hand: "19m19s5p1234567z",
      riichi: ["p1"],
      discards: { p1: "1z9m" },
      turnCount: 13,
    });
    const read = buildRead(s.view, "p0");
    const bid = bidDiscard(read, s.discardOptions(), null, profileOf("wildcard"));
    expect(pickedKind(s, bid?.option)).not.toBe("5p");
  });
});

/**
 * **난이도** — 이 저장소에는 개념 자체가 없었다(`difficulty`로 검색해도 게임과
 * 관련된 것이 하나도 없다). 사람이 붙는 자리인데 세 봇이 언제나 같은 실력이면
 * 처음 앉은 사람은 이길 수 없고 익숙해진 사람은 이길 이유가 없다.
 *
 * 분기를 만들지 않는 것이 규율이다 — `skill`은 `discard.wobble`이 "엇비슷하다"고
 * 보는 폭 하나만 넓힌다. 봇은 규칙을 몰라서가 아니라 고르기를 흔들려서 진다.
 */
describe("난이도", () => {
  it("기본은 숙련(= 지금까지의 봇)이라 종전 동작과 같다", () => {
    expect(profileOf("balanced").skill).toBe(1);
    expect(rollProfile(new Prng(7)).skill).toBe(1);
  });

  it("난이도를 낮추면 실력만 내려가고 성격은 그대로다", () => {
    const base = profileOf("attacker");
    const easy = withDifficulty(base, "easy");
    expect(easy.skill).toBeLessThan(base.skill);
    expect(easy.archetype).toBe(base.archetype);
    expect(easy.aggression).toBe(base.aggression);
  });

  it("초보 봇은 값이 더 벌어진 후보까지 흔들린다 (실수한다)", () => {
    const scene = botScene({ hand: "123m456p78s1122z9s", turnCount: 8 });
    const read = buildRead(scene.view, "p0");
    const options = scene.discardOptions();
    /** 난수를 바꿔 가며 실제로 몇 종류의 패가 나오는지 센다 */
    const spread = (skill: number): number => {
      const out = new Set<TileId | undefined>();
      const profile = { ...profileOf("balanced"), skill };
      for (let seed = 0; seed < 30; seed++) {
        const rng = new Prng(seed);
        const bid = bidDiscard(read, options, null, profile, { int: (n) => rng.int(n) });
        out.add((bid?.option.payload as { tileId?: TileId }).tileId);
      }
      return out.size;
    };
    expect(spread(0.35)).toBeGreaterThan(spread(1));
  });
});

describe("탁 전체의 성격을 함께 뽑는다", () => {
  /**
   * 예전에는 봇마다 따로 원형을 균등 추첨했다. 셋이 겹칠 확률이 **44%** —
   * 두 판에 한 번은 같은 성향이 둘 앉고, 같은 원형의 두 봇은 흔들림이 ±0.08뿐이라
   * 거의 구별되지 않는다. "탁에 여러 성향이 섞이는 것이 목적"이라던 주석과 어긋났다.
   */
  it("세 자리가 항상 서로 다른 원형이 된다", () => {
    for (let seed = 0; seed < 50; seed++) {
      const table = rollTableProfiles(new Prng(seed), 3);
      expect(new Set(table.map((p) => p.archetype)).size).toBe(3);
    }
  });

  it("자리가 원형보다 많으면 다 쓴 뒤 다시 채운다", () => {
    const table = rollTableProfiles(new Prng(3), 8);
    expect(table).toHaveLength(8);
    // 앞 여섯은 여섯 원형이 한 번씩
    expect(new Set(table.slice(0, 6).map((p) => p.archetype)).size).toBe(6);
  });

  it("지정한 자리는 그대로 두고, 나머지가 그것과 겹치지 않는다", () => {
    for (let seed = 0; seed < 30; seed++) {
      const table = rollTableProfiles(new Prng(seed), 3, ["defender", undefined, undefined]);
      expect(table[0]?.archetype).toBe("defender");
      expect(new Set(table.map((p) => p.archetype)).size).toBe(3);
    }
  });

  it("같은 시드면 같은 탁이 나온다 (재현성)", () => {
    const a = rollTableProfiles(new Prng(11), 3).map((p) => p.archetype);
    const b = rollTableProfiles(new Prng(11), 3).map((p) => p.archetype);
    expect(a).toEqual(b);
  });
});
