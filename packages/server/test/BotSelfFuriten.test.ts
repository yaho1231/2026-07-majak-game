/**
 * 봇이 **자기가 만드는 후리텐**을 본다 (QA 2차 bot 확정 1·2, 2026-08-22).
 *
 * 두 자리가 같은 눈을 갖고 있지 않았다.
 *
 * ① `bidRiichi`의 후리텐 검사는 **선언패가 바닥에 놓이기 전**의 내 버림 목록만
 *    봤다. 그래서 「커쯔에서 한 장 떼어 량면을 세우는」 흔한 선언 — 즉 **선언패
 *    자신이 자기 대기인** 경우를 구조적으로 못 봤다. 그 리치는 거는 순간 후리텐이라
 *    국이 끝날 때까지 론이 없다. 실측으로 리치 선언의 5.0%가 이 경우였고 여섯 원형이
 *    전부 똑같이 걸었다. 화면에는 똑같이 「리치!」가 뜨므로 사람은 그걸 정상으로 읽고
 *    접는다 — 봇이 손해를 보면서 사람의 국까지 망친다.
 *
 * ② 평시 버림(`bidDiscard`)에는 그 검사가 **아예 없었다.** 론이 원천 봉쇄된 텐파이에도
 *    론 배수(2.2)가 그대로 붙어 화료 기대값을 30~40% 부풀려 셌고, 그 EV는 버림·리치·
 *    후로·깡·증강 판단이 전부 공유하는 축이다.
 *
 * 기존 `BotPlay.test.ts`의 「후리텐 대기로는 걸지 않는다」는 **이미 바닥에 있던 패**로만
 * 검사해서 두 자리를 다 지나갔다. 여기서 그 사각지대에 못을 박는다.
 */

import { describe, expect, it } from "vitest";
import type { TileId } from "@majak/core";
import { kindKey, winningKinds } from "@majak/core";
import { bidDiscard, chooseDiscard, chooseRiichi } from "../src/bot/discard.js";
import { buildRead } from "../src/bot/read.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import type { BotProfile } from "../src/bot/profile.js";
import { botScene } from "./botTestView.js";
import type { BotScene } from "./botTestView.js";

const profile = (over: Partial<BotProfile> = {}): BotProfile => ({
  ...NEUTRAL_PROFILE,
  ...over,
});

/** 고른 옵션의 패 종류 키 (없으면 null). */
function pickedKey(scene: BotScene, option: { payload: unknown } | null): string | null {
  const tileId = (option?.payload as { tileId?: TileId } | undefined)?.tileId;
  const kind = tileId !== undefined ? scene.view.tiles[tileId]?.kind : undefined;
  return kind === undefined ? null : kindKey(kind);
}

/**
 * 「이 한 장을 버리면 그 텐파이의 대기에 그 패 자신이 들어가는가」 —
 * 검사 대상과 **독립적으로** 다시 센다(같은 함수를 불러 자기 자신을 확인하지 않게).
 */
function declaresIntoOwnWait(scene: BotScene, key: string): boolean {
  const read = buildRead(scene.view, "p0");
  const target = read.hand.find((k) => kindKey(k) === key);
  if (target === undefined) return false;
  const rest: typeof read.hand = [];
  let dropped = false;
  for (const k of read.hand) {
    if (!dropped && kindKey(k) === key) {
      dropped = true;
      continue;
    }
    rest.push(k);
  }
  return winningKinds(rest, read.meldCount, undefined, read.opts).some(
    (w) => kindKey(w) === key,
  );
}

/**
 * 커쯔에서 한 장 떼어 량면을 세우는 손 — 그 한 장이 곧 자기 대기다.
 * 111m 999m 111p 555s 67s 에서 7s를 버리면 대기가 4s·6s·**7s**가 된다.
 */
const SELF_FURITEN_HAND = "111m999m111p555s67s";

describe("자기가 만드는 후리텐 — 리치", () => {
  it("장면 전제 확인 — 7s 선언은 7s 자신이 대기에 든다", () => {
    const scene = botScene({ hand: SELF_FURITEN_HAND });
    expect(declaresIntoOwnWait(scene, "sou7")).toBe(true);
  });

  it("선언패 자신이 자기 대기인 리치는 걸지 않는다", () => {
    const scene = botScene({ hand: SELF_FURITEN_HAND });
    const read = buildRead(scene.view, "p0");
    const picked = chooseRiichi(read, scene.riichiOptions(), profile());
    // 걸더라도 **그 한 장으로는** 걸지 않는다. 다른 선언패로 걸리면 그건 다른 손이다.
    expect(pickedKey(scene, picked)).not.toBe("sou7");
  });

  it("보통 성격이면 어느 값에서도 그 한 장으로 걸지 않는다", () => {
    for (const aggression of [0, 0.2, 0.4, 0.6]) {
      const scene = botScene({ hand: SELF_FURITEN_HAND });
      const read = buildRead(scene.view, "p0");
      const picked = chooseRiichi(read, scene.riichiOptions(), profile({ aggression }));
      expect(pickedKey(scene, picked), `aggression=${aggression}`).not.toBe("sou7");
    }
  });

  /**
   * 저돌적인 성격에는 「대기가 아주 넓으면(8장 이상) **알고** 거는 후리텐 리치」라는
   * 예외가 원래 있다(`bidRiichi`). 이 손의 대기는 4s·6s·7s로 10장이라 그 문턱을 넘는다
   * — 즉 여기서 거는 것은 성립하는 수다. 이 수정이 없앤 것은 **모르고 거는 것**이지
   * 그 예외가 아니다. 예외까지 함께 닫히면 성격 차이가 또 하나 사라지므로 못을 박아 둔다.
   */
  it("아주 저돌적인 성격의 «알고 거는» 넓은 후리텐 리치는 그대로 남는다", () => {
    const scene = botScene({ hand: SELF_FURITEN_HAND });
    const read = buildRead(scene.view, "p0");
    const picked = chooseRiichi(read, scene.riichiOptions(), profile({ aggression: 1 }));
    expect(pickedKey(scene, picked)).toBe("sou7");
  });

  it("이미 바닥에 있던 패로 인한 후리텐도 그대로 막는다 (기존 그물이 살아 있다)", () => {
    const scene = botScene({ hand: "123m456m789m11p56s1z", discards: { p0: "7s" } });
    const read = buildRead(scene.view, "p0");
    expect(chooseRiichi(read, scene.riichiOptions(), profile())).toBeNull();
  });
});

describe("자기가 만드는 후리텐 — 평시 버림", () => {
  /**
   * 이 손은 **어느 갈래로 텐파이를 잡아도 스스로 후리텐**이 된다. 그래서 "더 나은
   * 패를 고르는가"로는 확인할 수 없고, **매겨진 값**이 론 배수를 뺀 값인지로 본다.
   * `chooseDiscard`가 돌려주는 옵션의 값(`value`)이 그 축이다.
   */
  it("론이 불가능한 텐파이에 론 배수를 붙이지 않는다", () => {
    const scene = botScene({ hand: SELF_FURITEN_HAND });
    const read = buildRead(scene.view, "p0");
    const bid = bidDiscard(read, scene.discardOptions(), null, profile());
    expect(bid).not.toBeNull();

    // 대조군: 봇이 **이미** 후리텐인 줄 아는 같은 손. 두 값이 같아야 한다 —
    // 「내가 만드는 후리텐」과 「이미 후리텐」은 론이 없다는 점에서 똑같기 때문이다.
    const known = botScene({ hand: SELF_FURITEN_HAND, furiten: true });
    const knownRead = buildRead(known.view, "p0");
    const knownBid = bidDiscard(knownRead, known.discardOptions(), null, profile());
    expect(knownBid).not.toBeNull();

    // 부풀림이 남아 있으면 30~40% 크다 (실측 1,042~1,261점 차이).
    expect(Math.abs(bid!.value - knownBid!.value)).toBeLessThan(
      Math.max(1, Math.abs(knownBid!.value) * 0.05),
    );
  });

  it("후리텐이 아닌 평범한 손은 그대로 둔다 (과잉 억제가 아니다)", () => {
    const scene = botScene({ hand: "123m456m789m11p5s7z" });
    const read = buildRead(scene.view, "p0");
    const picked = chooseDiscard(read, scene.discardOptions(), null, profile());
    expect(pickedKey(scene, picked)).toBe("dragon3"); // 7z = 中
  });
});
