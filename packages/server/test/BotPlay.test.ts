/**
 * 봇의 '평소 플레이'가 사람처럼 보이는지 — 타패·수비·리치·후로를 장면별로 검증한다.
 *
 * 배경(2026-07-29): 예전 봇은 이웃 유무만 보는 한 줄짜리 휴리스틱으로 버렸고 수비
 * 개념이 아예 없었다. 남이 리치를 걸어도 자기 효율만 보고 위험패를 던졌고, 손이 한
 * 발짝도 나아가지 않는 치를 불렀으며, 멘젠 텐파이를 스스로 열어 리치를 날렸다.
 * 여기서 잡는 것은 그 네 가지 결정의 **경계**다.
 */

import { describe, expect, it } from "vitest";
import type { TileId } from "@majak/core";
import { chooseCall } from "../src/bot/call.js";
import { chooseDiscard, chooseRiichi } from "../src/bot/discard.js";
import { buildRead, readPlan } from "../src/bot/read.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import type { BotProfile } from "../src/bot/profile.js";
import { botScene, h } from "./botTestView.js";
import type { BotScene } from "./botTestView.js";

const profile = (over: Partial<BotProfile> = {}): BotProfile => ({
  ...NEUTRAL_PROFILE,
  ...over,
});

/** 고른 옵션의 패를 "5p" 같은 표기로 되돌린다 */
function pickedKind(scene: BotScene, option: { payload: unknown } | null): string {
  const tileId = (option?.payload as { tileId?: TileId } | undefined)?.tileId;
  const kind = tileId !== undefined ? scene.view.tiles[tileId]?.kind : undefined;
  if (kind === undefined) return "none";
  const suit = kind.suit === "man" ? "m" : kind.suit === "pin" ? "p" : kind.suit === "sou" ? "s" : "z";
  const rank = kind.suit === "dragon" ? kind.rank + 4 : kind.rank;
  return `${rank}${suit}`;
}

describe("타패 — 손이 나아가는 쪽으로 버린다", () => {
  it("완성된 손을 두고 외톨이 자패를 버린다", () => {
    const scene = botScene({ hand: "123m456m789m11p5s7z" });
    const read = buildRead(scene.view, "p0");
    const picked = chooseDiscard(read, scene.discardOptions(), null, profile());
    expect(pickedKind(scene, picked)).toBe("7z");
  });

  it("블록이 남으면 칸짱을 헐고 량면을 지킨다", () => {
    // 123m·456m 두 멘쯔 + 11p 머리 + 78s(량면) + 24p·46s(칸짱 둘) — 블록이 하나 남는다
    const scene = botScene({ hand: "123m456m11p78s24p46s" });
    const read = buildRead(scene.view, "p0");
    const picked = chooseDiscard(read, scene.discardOptions(), null, profile());
    expect(["2p", "4p", "4s", "6s"]).toContain(pickedKind(scene, picked));
  });

  it("혼일색으로 가는 손에서는 딴 색을 먼저 흘린다", () => {
    const scene = botScene({ hand: "1122334455p11z9m" });
    const read = buildRead(scene.view, "p0");
    const plan = readPlan(read);
    expect(plan).toEqual({ yaku: "honitsu", suit: "pin" });
    const picked = chooseDiscard(read, scene.discardOptions(), plan, profile());
    expect(pickedKind(scene, picked)).toBe("9m");
  });

  it("같은 값이면 도라를 남긴다", () => {
    // 5p가 도라(표시패 4p). 5p와 5s 둘 다 외톨이면 도라가 아닌 쪽을 버린다
    const scene = botScene({ hand: "123m456m789m11z5p5s", doraIndicator: "4p" });
    const read = buildRead(scene.view, "p0");
    const picked = chooseDiscard(read, scene.discardOptions(), null, profile());
    expect(pickedKind(scene, picked)).toBe("5s");
  });
});

describe("수비 — 남이 리치를 걸면 접는다", () => {
  // 3샹텐 손: 234m·678p 두 멘쯔 + 99m 작두 + 홀로 남은 자패 여섯 장.
  // 9m은 p1이 이미 버려 현물(100% 안전)이고, 자패는 아직 한 장도 안 나왔다.
  const FAR_HAND = "99m234m678p1z2z3z4z5z6z";

  it("3샹텐짜리 손이면 작두를 헐어서라도 현물을 버린다", () => {
    const scene = botScene({
      hand: FAR_HAND,
      riichi: ["p1"],
      discards: { p1: "9m" },
      turnCount: 10,
    });
    const read = buildRead(scene.view, "p0");
    expect(read.threat).toBe(1);
    const picked = chooseDiscard(read, scene.discardOptions(), null, profile());
    expect(pickedKind(scene, picked)).toBe("9m");
  });

  it("위협이 없으면 같은 손에서 효율대로 버린다 (접는 게 아니라 미는 게 기본)", () => {
    // 1순 — 다마텐 경사(2순부터 자란다)조차 아직 0인 유일한 구간이다
    const scene = botScene({ hand: FAR_HAND, discards: { p1: "9m" }, turnCount: 1 });
    const read = buildRead(scene.view, "p0");
    expect(read.threat).toBe(0);
    const picked = chooseDiscard(read, scene.discardOptions(), null, profile());
    // 현물이라는 이유만으로 작두를 헐지는 않는다 — 안전은 위협이 있을 때만 값이 있다
    expect(pickedKind(scene, picked)).not.toBe("9m");
  });

  it("좋은 텐파이는 리치에도 민다", () => {
    // 4s·7s 량면 텐파이 + 도라 2장(11p) — 사람도 여기서는 대기를 깨고 도망치지 않는다
    const scene = botScene({
      hand: "123m456m789m11p56s7z",
      riichi: ["p1"],
      discards: { p1: "1z2z3z" },
      doraIndicator: "9p",
      turnCount: 8,
    });
    const read = buildRead(scene.view, "p0");
    expect(read.tenpai).toBe(true);
    const picked = chooseDiscard(read, scene.discardOptions(), null, profile());
    expect(pickedKind(scene, picked)).toBe("7z");
  });
});

describe("리치 — 걸 만할 때만 건다", () => {
  it("가장 넓은 대기를 남기는 패로 선언한다", () => {
    // 123m456m789m 11p 56s + 1z : 1z를 버리면 4s/7s 량면, 6s를 버리면 1z 단기
    const scene = botScene({ hand: "123m456m789m11p56s1z" });
    const read = buildRead(scene.view, "p0");
    const picked = chooseRiichi(read, scene.riichiOptions(), profile());
    expect(pickedKind(scene, picked)).toBe("1z");
  });

  it("오름패가 한 장도 안 남은 대기로는 걸지 않는다", () => {
    // 1z 단기인데 1z가 이미 4장 다 보인다 (상대 버림패 3장 + 내 손 1장)
    const scene = botScene({
      hand: "123m456m789m123p1z",
      discards: { p1: "1z", p2: "1z", p3: "1z" },
    });
    const read = buildRead(scene.view, "p0");
    const only = scene
      .riichiOptions()
      .filter((o) => (o.payload as { tileId: TileId }).tileId === scene.idOf("1z"));
    // 1z를 손에 남기는(= 다른 패를 버리는) 선언만 죽은 대기가 된다
    const deadOnly = scene.riichiOptions().filter((o) => !only.includes(o));
    expect(chooseRiichi(read, deadOnly, profile())).toBeNull();
  });

  it("패산이 거의 없으면 공탁만 버리는 리치를 하지 않는다", () => {
    const scene = botScene({ hand: "123m456m789m11p56s1z", wallLeft: 3 });
    const read = buildRead(scene.view, "p0");
    expect(chooseRiichi(read, scene.riichiOptions(), profile())).toBeNull();
  });

  it("후리텐 대기로는 걸지 않는다 (론이 안 된다)", () => {
    // 4s·7s 대기인데 7s를 이미 버렸다
    const scene = botScene({
      hand: "123m456m789m11p56s1z",
      discards: { p0: "7s" },
    });
    const read = buildRead(scene.view, "p0");
    expect(chooseRiichi(read, scene.riichiOptions(), profile())).toBeNull();
  });

  /**
   * 2026-08-08: 순위 압박이 **사다리 전체**를 보게 되면서(`bot/match.ts`) 이 두 장면의
   * 자리가 서로 바뀌었다. 예전 식은 바로 아래 한 칸과의 차이를 9000점에서 포화시켜서
   * **차가 클수록 더 지키라**고 답했다 — 4000점 선두(정말 위태롭다)보다 12000점 선두를
   * 더 무서워한 것이다. 지금은 "저 사람이 나를 넘을 수 있는가"로 재므로 순서가 뒤집힌다.
   *
   *   - +4000 올라스 선두 → 압박 최대(−1.0). 한 국에 뒤집히는 거리라 성격도 못 뒤집는다.
   *   - +12000 올라스 선두 → 압박 −0.775. 편안하지만 안심할 정도는 아닌 어중간한 자리라,
   *     여기서 성격이 갈린다(리치 5426 대 다마 5393 — 0.6% 차이의 저울질이다).
   */
  it("아슬아슬한 올라스 선두는 고타점이라도 다마텐으로 조용히 끝낸다", () => {
    // 남4국(올라스), 4000점 선두 — 싸구려 하나에도 뒤집힌다. 이기고 있는 사람이 원하는 건
    // **국이 조용히 끝나는 것**이다. 리치는 1000점을 내고 손을 고정시켜 남은 순의 위험패를
    // 전부 통과시키는 거래인데, 살 이유가 없다.
    const allLastLead = {
      hand: "333m456m789m11p56s1z",
      doraIndicator: "2m",
      turnCount: 5,
      prevalentWind: 2,
      roundNumber: 4,
      scores: { p0: 29000, p1: 25000, p2: 24000, p3: 22000 },
    } as const;
    const scene = botScene(allLastLead);
    const read = buildRead(scene.view, "p0");
    expect(read.match.allLast).toBe(true);
    expect(read.match.rank).toBe(1);
    expect(read.handDora).toBeGreaterThanOrEqual(3);
    // 압박이 최대인 자리에서는 성격도 이를 뒤집지 못한다 — 저돌적인 사람도 여기선 참는다
    expect(chooseRiichi(read, scene.riichiOptions(), profile({ riichiLoose: 0.4 }))).toBeNull();
    expect(chooseRiichi(read, scene.riichiOptions(), profile({ riichiLoose: 0.9 }))).toBeNull();
  });

  it("압박이 어중간하면 성격이 리치를 가른다 (성격은 규칙이 아니라 저울)", () => {
    // 같은 올라스지만 선두 차가 12000점 — 넉넉하되 만관 직격 한 방 거리다.
    // 지켜야 할 것도 있고 벌어야 할 것도 있는 이 자리에서 무조건 리치파와 다마텐파가 갈린다.
    const scene = botScene({
      hand: "333m456m789m11p56s1z",
      doraIndicator: "2m",
      turnCount: 5,
      prevalentWind: 2,
      roundNumber: 4,
      scores: { p0: 37000, p1: 25000, p2: 20000, p3: 18000 },
    });
    const read = buildRead(scene.view, "p0");
    expect(chooseRiichi(read, scene.riichiOptions(), profile({ riichiLoose: 0.4 }))).toBeNull();
    expect(chooseRiichi(read, scene.riichiOptions(), profile({ riichiLoose: 0.9 }))).not.toBeNull();
  });

  it("같은 손이라도 동1국이면 건다 — 순위를 지킬 게 아직 없다", () => {
    // 위와 완전히 같은 손·같은 순목. 다른 것은 '이 국이 게임의 어디인가'뿐이다.
    //
    // 2026-08-05: 예전 기준은 `도라 3장 이상 + 이른 순목 → 다마텐`이라는 도라 개수
    // 규칙이었다. 그건 초보용 속설이다 — 5순째 오야 만관(12000)이 리치로 하네만
    // (18000)이 되는 자리는 리치가 명백히 이득이다. 다마텐이 진짜로 이득인 자리는
    // **점수를 더 벌 이유가 없을 때**이고, 그건 순위판을 봐야만 알 수 있다.
    const scene = botScene({
      hand: "333m456m789m11p56s1z",
      doraIndicator: "2m",
      turnCount: 5,
    });
    const read = buildRead(scene.view, "p0");
    expect(chooseRiichi(read, scene.riichiOptions(), profile({ riichiLoose: 0.4 }))).not.toBeNull();
  });
});

describe("후로 — 손이 나아가고 역이 있을 때만 운다", () => {
  const ponOf = (scene: BotScene, spec: string, other: string) => ({
    type: "pon",
    payload: { tileIds: [scene.idOf(spec), scene.idOf(other)] },
  });

  it("역패 또이쯔는 펑한다", () => {
    const scene = botScene({
      hand: "1479m2589p369s55z",
      lastDiscard: { player: "p1", spec: "5z" },
    });
    const read = buildRead(scene.view, "p0");
    const opts = [ponOf(scene, "5z", "5z"), { type: "pass", payload: {} }];
    const call = chooseCall(read, opts, null, profile());
    expect(call?.option.type).toBe("pon");
    expect(call?.plan).toEqual({ yaku: "yakuhai" });
  });

  it("역이 없는 손은 울지 않는다 (울면 화료할 수 없다)", () => {
    // 자풍도 장풍도 아닌 북(4z) — 펑해도 역이 없고 손도 요구패투성이다
    const scene = botScene({
      hand: "19m19p19s1244z44z",
      lastDiscard: { player: "p1", spec: "4z" },
    });
    const read = buildRead(scene.view, "p0");
    const opts = [ponOf(scene, "4z", "4z"), { type: "pass", payload: {} }];
    expect(chooseCall(read, opts, null, profile())).toBeNull();
  });

  it("멘젠 텐파이는 스스로 열지 않는다 (리치가 날아간다)", () => {
    const scene = botScene({
      hand: "123m456m789m11p56s",
      lastDiscard: { player: "p1", spec: "1p" },
    });
    const read = buildRead(scene.view, "p0");
    expect(read.tenpai).toBe(true);
    const opts = [ponOf(scene, "1p", "1p"), { type: "pass", payload: {} }];
    expect(chooseCall(read, opts, null, profile())).toBeNull();
  });

  it("손이 전진하지 않는 치는 부르지 않는다", () => {
    // 이미 완성된 456p에서 4p5p를 빼 3p를 쳐 봐야 6p만 뜬다 — 손은 그대로다.
    //
    // 예전 장면(`123m789m456p11s45p`)은 **멘젠 텐파이**라, 이 테스트는 이름과 달리
    // 바로 위 관문에서 걸려 통과하고 있었다(콜 기회 집계를 붙이면서 드러났다).
    // 텐파이가 아닌 손으로 바꿔 실제로 '전진 없음'을 짚는다.
    const scene = botScene({
      hand: "123m789m456p22s5s9s",
      lastDiscard: { player: "p3", spec: "3p" },
    });
    const read = buildRead(scene.view, "p0");
    const opts = [
      { type: "chi", payload: { tileIds: [scene.idOf("4p"), scene.idOf("5p")] } },
      { type: "pass", payload: {} },
    ];
    expect(chooseCall(read, opts, null, profile())).toBeNull();
  });

  it("종반에 울어서 텐파이가 되면 형식텐파이로 부른다", () => {
    // 역은 없지만 패산이 얼마 안 남았다 — 노텐벌부를 피하는 것이 이득이다
    const scene = botScene({
      hand: "123m789m12p99s45p3z",
      lastDiscard: { player: "p3", spec: "3p" },
      wallLeft: 6,
      turnCount: 15,
    });
    const read = buildRead(scene.view, "p0");
    const opts = [
      { type: "chi", payload: { tileIds: [scene.idOf("4p"), scene.idOf("5p")] } },
      { type: "pass", payload: {} },
    ];
    expect(chooseCall(read, opts, null, profile())?.option.type).toBe("chi");
  });
});

describe("판 읽기", () => {
  it("보이는 패를 세어 남은 장수를 안다", () => {
    const scene = botScene({
      hand: "123m456m789m11p56s",
      discards: { p1: "4s4s", p2: "4s" },
    });
    const read = buildRead(scene.view, "p0");
    expect(read.remainingOf(h("4s")[0]!)).toBe(1);
    expect(read.remainingOf(h("7s")[0]!)).toBe(4);
  });

  /**
   * 이 테스트는 이름과 달리 **조용한 판의 위협이 0인지**만 봤다(후로 쪽을 아예 안 세웠다).
   * 2026-08-08에 다마텐 경사를 채택하면서 그 0이 깨졌는데, 그 김에 이름이 말하는 것을
   * 실제로 재게 고친다 — 후로가 늘면 위협이 오르는가.
   */
  it("후로가 늘어난 상대는 리치가 없어도 경계한다", () => {
    const hand = "123m456m789m11p56s";
    const quiet = buildRead(botScene({ hand }).view, "p0");
    const one = buildRead(botScene({ hand, oppMelds: { p1: ["555s"] } }).view, "p0");
    const two = buildRead(botScene({ hand, oppMelds: { p1: ["555s", "222p"] } }).view, "p0");
    // 조용한 멘젠 상대에게도 다마텐 몫이 붙지만, 후로 손보다는 언제나 낮다
    expect(quiet.threat).toBeGreaterThan(0);
    expect(one.threat).toBeGreaterThan(quiet.threat);
    expect(two.threat).toBeGreaterThan(one.threat);
  });
});
