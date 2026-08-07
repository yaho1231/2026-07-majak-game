/**
 * 증강이 **화료 규칙 자체를 지웠을 때** 봇이 그것을 아는가.
 *
 * `view.scoringOptions`에는 화료**형**의 확장만 실린다. "역이 필요한가"·"리치에 멘젠이
 * 필요한가"·"후로가 손으로 돌아왔는가"는 뷰에 실리지 않아, 봇의 값어치·게이트가
 * 전부 **평범한 마작 규칙을 전제로** 서 있었다. 그래서 그 규칙을 지우려고 만든 증강이
 * 봇에게는 없는 것과 같았다 — 뽑아 놓고 그 증강이 열어 주는 수를 스스로 거절했다.
 */

import { describe, expect, it } from "vitest";
import { buildRead } from "../src/bot/read.js";
import { bidCall } from "../src/bot/call.js";
import { profileOf } from "../src/bot/profile.js";
import { botScene } from "./botTestView.js";
import type { BotScene } from "./botTestView.js";

const profile = profileOf("balanced");

describe("무형화료 — 역이 필요 없는 봇", () => {
  /** 역이 하나도 안 붙는 열린 손: 치를 부르면 탕야오도 역패도 없다 */
  const scene = (augments: string[]): BotScene =>
    botScene({
      hand: "19m1234p1s1234z9s",
      melds: ["999s"],
      lastDiscard: { player: "p3", spec: "5p" },
      augments: { p0: augments },
    });

  it("역이 없는 열린 손의 값이 15%로 깎이지 않는다", () => {
    const plain = buildRead(scene([]).view, "p0");
    const holder = buildRead(scene(["yakuless_win"]).view, "p0");
    const q = { plan: null, meldCount: 2 } as const;
    expect(holder.valueOf(q).points).toBeGreaterThan(plain.valueOf(q).points * 3);
  });

  it("후로 게이트의 '역 없음' 거절이 열린다", () => {
    const holder = scene(["yakuless_win"]);
    const read = buildRead(holder.view, "p0");
    expect(read.noYakuRequired).toBe(true);
    const chi = {
      type: "chi",
      payload: { tileIds: [holder.idOf("3p"), holder.idOf("4p")] },
    };
    // 게이트가 살아 있으면 여기서 null이 나온다 (audit "no_yaku")
    expect(bidCall(read, [chi] as never, null, profile)).not.toBeNull();
  });

  it("들지 않은 봇은 종전 그대로 거절한다", () => {
    const plain = scene([]);
    const read = buildRead(plain.view, "p0");
    expect(read.noYakuRequired).toBe(false);
    const chi = {
      type: "chi",
      payload: { tileIds: [plain.idOf("3p"), plain.idOf("4p")] },
    };
    expect(bidCall(read, [chi] as never, null, profile)).toBeNull();
  });
});

describe("개문선언 — 열린 손으로도 리치를 건다", () => {
  const scene = (augments: string[]): BotScene =>
    botScene({ hand: "234m567p11s234s", melds: ["555z"], augments: { p0: augments } });

  it("열린 손의 리치 점수가 0판이 아니게 된다", () => {
    const plain = buildRead(scene([]).view, "p0").valueOf({ plan: null });
    const holder = buildRead(scene(["open_riichi"]).view, "p0").valueOf({ plan: null });
    // 종전에는 열린 손의 리치 판수가 통째로 0이라 리치 입찰이 절대 이길 수 없었다
    expect(plain.riichiPoints).toBe(plain.points);
    expect(holder.riichiPoints).toBeGreaterThan(holder.points);
  });
});

describe("파혼 — 후로가 손으로 돌아오면 멘젠이 되살아난다", () => {
  it("후로 수를 낮춰 값매기면 멘젠 손으로 센다", () => {
    const scene = botScene({ hand: "234m567p11s234s", melds: ["555z"] });
    const read = buildRead(scene.view, "p0");
    expect(read.menzen).toBe(false);
    const open = read.valueOf({ plan: null });
    const restored = read.valueOf({ plan: null, meldCount: 0 });
    // 멘젠이면 리치 판수(2.2)가 살아난다 — 그 차이가 곧 이 증강의 값어치다
    expect(open.riichiPoints).toBe(open.points);
    expect(restored.riichiPoints).toBeGreaterThan(restored.points);
  });

  it("안깡이 아닌 후로가 남으면 되살아나지 않는다", () => {
    const scene = botScene({ hand: "234m567p11s234s", melds: ["555z", "666z"] });
    const read = buildRead(scene.view, "p0");
    // 둘 중 하나만 돌아오면 여전히 열린 손이다
    const one = read.valueOf({ plan: null, meldCount: 1 });
    expect(one.riichiPoints).toBe(one.points);
  });

  it("남는 것이 안깡뿐이면 되살아난다", () => {
    const scene = botScene({ hand: "234m567p11s234s", melds: ["kan_closed:5555z", "666z"] });
    const read = buildRead(scene.view, "p0");
    const one = read.valueOf({ plan: null, meldCount: 1 });
    expect(one.riichiPoints).toBeGreaterThan(one.points);
  });
});
