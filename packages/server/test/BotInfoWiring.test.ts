/**
 * **봇이 «읽기만»에서 «판단이 바뀐다»로 간다** — 정보 배선 2차 (docs/51).
 *
 * 1차(PR #442)가 연 채널은 셋뿐이었다(열린 손패·천리안·지뢰 탐지). 재측정에서
 * 삼세 예지는 **3,788회 발동하고도 60/60판 결과가 정확히 동일**했고 선언 간파도
 * 0이었다 — 봇이 버튼은 누르는데 아무도 산출물을 안 읽었기 때문이다(docs/50 §3).
 *
 * 이 파일은 그 배선이 **되돌리면 실제로 깨지도록** 못 박는다. 각 카드마다
 *  ① 채널을 읽는가 ② 그 정보가 **판단(확률·값어치·위협)을 실제로 바꾸는가**
 *  ③ 채널이 없으면 종전과 한 글자도 다르지 않은가 를 함께 본다.
 *
 * **치트 경계**: 여기서 세우는 장면은 전부 «그 좌석의 PlayerView에 실려 올 수 있는
 * 것»뿐이다 — 내 전용 채널(`view:{나}:*`)·전원 공개 채널(`view:*:*`)·뷰에 공개된
 * 패(`view.tiles`)·Zone의 `hiddenCount`. 남의 뷰도 `GameState`도 이 파일에 없다.
 * 아래 «가려져 있으면 안 읽는다» 테스트들이 그 경계를 반대편에서 지킨다.
 */

import { describe, expect, it } from "vitest";
import { kindKey } from "@majak/core";
import type { PlayerView, TileKind } from "@majak/core";
import { readIntel } from "../src/bot/intel.js";
import { buildRead } from "../src/bot/read.js";
import { readThreats, safetyOf, tileTracker } from "../src/bot/danger.js";
import { bidKan } from "../src/bot/kan.js";
import { bidDiscard } from "../src/bot/discard.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import { botScene, h } from "./botTestView.js";
import type { BotViewOptions } from "./botTestView.js";

const key = (spec: string): string => kindKey(h(spec)[0] as TileKind);

/** 3면 대기가 아닌 단순한 텐파이 손 — 3소 대기(량면 2s/5s는 아니고 단기) */
const TENPAI = "123m456m789m11p22s";

/** 이 장면에서 «지금 손을 그대로 밀 때»의 화료 확률 */
function pushChance(opts: BotViewOptions): number {
  const read = buildRead(botScene(opts).view, "p0");
  return read.winChanceOf({
    shanten: read.shanten,
    waitTiles: read.waitTiles,
    ukeireTiles: read.waitTiles,
    known: read.knownDrawsFor(read.waits, read.waits),
  });
}

describe("삼세 예지·예지 — 확정된 내 다음 쯔모가 밀지 접을지를 바꾼다", () => {
  it("채널을 읽어 «내 다음 쯔모»로 옮긴다", () => {
    const scene = botScene({ hand: TENPAI, augmentView: { triple_peek: [key("2s"), key("9p")] } });
    const intel = readIntel(scene.view, "p0", {});
    expect(intel.myDraws.map(kindKey)).toEqual([key("2s"), key("9p")]);
    expect(intel.any).toBe(true);
  });

  it("오름패가 오는 것을 보면 화료 확률이 뛴다 (밀 근거)", () => {
    const base = pushChance({ hand: TENPAI, turnCount: 8 });
    const seen = pushChance({
      hand: TENPAI,
      turnCount: 8,
      augmentView: { triple_peek: [key("2s")] }, // 2s 단기의 오름패가 바로 다음 쯔모
    });
    expect(seen).toBeGreaterThan(base + 0.2);
  });

  it("헛쯔모만 보이면 오히려 확률이 내려간다 (접을 근거)", () => {
    const base = pushChance({ hand: TENPAI, turnCount: 8 });
    const miss = pushChance({
      hand: TENPAI,
      turnCount: 8,
      augmentView: { triple_peek: [key("1z"), key("2z"), key("3z")] },
    });
    expect(miss).toBeLessThan(base);
  });

  it("예지는 «패산 앞 4장»이라 내 자리 몫만 골라낸다", () => {
    // p0는 좌석 0, turn.act에서 index 0을 가져가는 자리는 «다음 자리»(좌석 1)다.
    // 따라서 나(좌석 0)의 몫은 index 3 하나뿐이다.
    const scene = botScene({
      hand: TENPAI,
      augmentView: { foresight_peek: [key("1m"), key("2m"), key("3m"), key("2s")] },
    });
    expect(readIntel(scene.view, "p0", {}).myDraws.map(kindKey)).toEqual([key("2s")]);
  });

  it("누군가 밑장빼기를 예약했으면 예지 배분을 통째로 포기한다 (틀린 정보를 우기지 않는다)", () => {
    const scene = botScene({
      hand: TENPAI,
      augmentView: {
        foresight_peek: [key("1m"), key("2m"), key("3m"), key("2s")],
        "bottom_deal:armed:p2": true,
      },
    });
    expect(readIntel(scene.view, "p0", {}).myDraws).toEqual([]);
  });
});

describe("후로 판단 — 예고된 쯔모가 오면 그 펑을 참는다", () => {
  it("패스 EV에는 확정 쯔모가 들어가고 콜 EV에는 안 들어간다 (울면 배분이 다시 돌아간다)", () => {
    // 「다음 쯔모가 내 오름패」인 것을 본 순간, 패스가 콜보다 좋아져야 한다.
    const passEV = (extra: Record<string, unknown> | undefined): number => {
      const scene = botScene({
        hand: TENPAI,
        turnCount: 8,
        lastDiscard: { player: "p3", spec: "2s" },
        ...(extra === undefined ? {} : { augmentView: extra }),
      });
      const read = buildRead(scene.view, "p0");
      const u = read.knownDrawsFor(read.waits, read.waits);
      return read.winChanceOf({
        shanten: read.shanten,
        waitTiles: read.waitTiles,
        ukeireTiles: read.waitTiles,
        known: u,
      });
    };
    expect(passEV({ triple_peek: [key("2s")] })).toBeGreaterThan(passEV(undefined));
  });
});

describe("선언 간파 — 리치 상대의 대기를 그대로 안다", () => {
  const scene = (extra?: Record<string, unknown>): PlayerView =>
    botScene({
      hand: TENPAI,
      riichi: ["p1"],
      turnCount: 9,
      ...(extra === undefined ? {} : { augmentView: extra }),
    }).view;

  it("간파한 대기만 위험하고 나머지는 안전하다", () => {
    const v = scene({ "waits:p1": [key("5s")] });
    const intel = readIntel(v, "p0", {});
    expect([...(intel.byPlayer.get("p1")?.exactWaits ?? [])]).toEqual([key("5s")]);
    const only = readThreats(v, "p0", [], undefined, intel).filter((t) => t.player === "p1");
    const remain = tileTracker(v);
    expect(safetyOf(h("5s")[0] as TileKind, only, remain)).toBe(0);
    expect(safetyOf(h("6s")[0] as TileKind, only, remain)).toBe(1);
  });

  it("간파 없이는 리치가 종전대로 «추정»으로 남는다", () => {
    const only = readThreats(scene(), "p0", [], undefined, readIntel(scene(), "p0", {}))
      .filter((t) => t.player === "p1");
    // 대기를 모르면 어떤 패도 «확실히 안전»이 아니다 (현물이 없는 장면이다)
    expect(safetyOf(h("6s")[0] as TileKind, only, tileTracker(scene()))).toBeLessThan(1);
  });

  it("내 좌석 앞으로 온 채널이 아니면 읽지 않는다 (모양이 다르면 무시)", () => {
    const v = scene({ "waits:p9": [key("5s")], "waits:p0": [key("5s")] });
    const intel = readIntel(v, "p0", {});
    expect(intel.byPlayer.get("p0")).toBeUndefined();
    expect(intel.byPlayer.get("p9" as never)).toBeUndefined();
  });
});

describe("이면투시 — 본 뒷도라를 리치 값어치에 넣는다", () => {
  it("내 손에 붙는 뒷도라를 세면 리치 쪽 점수가 오른다", () => {
    const opts: BotViewOptions = { hand: TENPAI, turnCount: 6 };
    const plain = buildRead(botScene(opts).view, "p0").valueOf({ plan: null });
    // 1m 표시패 → 뒷도라는 2m. 이 손에 2m이 한 장 있다.
    const seen = buildRead(
      botScene({ ...opts, augmentView: { ura: [key("1m")] } }).view,
      "p0",
    ).valueOf({ plan: null });
    expect(seen.riichiPoints).toBeGreaterThan(plain.riichiPoints);
    // 리치를 안 걸면 뒷도라는 없다 — 다마 값은 그대로여야 한다
    expect(seen.points).toBe(plain.points);
  });

  it("본 뒷도라가 내 손에 한 장도 없으면 기대값보다 **낮게** 센다", () => {
    const plain = buildRead(botScene({ hand: TENPAI }).view, "p0").valueOf({ plan: null });
    const seen = buildRead(
      botScene({ hand: TENPAI, augmentView: { ura: [key("7z")] } }).view,
      "p0",
    ).valueOf({ plan: null });
    expect(seen.riichiPoints).toBeLessThan(plain.riichiPoints);
  });
});

describe("왕패 열람 — 영상패와 다음 도라를 알고 깡을 친다", () => {
  /** 안깡 후보가 있는 손: 5삭 4장 + 텐파이 재료 */
  const KAN_HAND = "5555s123m456m78m";
  const kanOptions = (view: PlayerView): { type: string; payload: unknown }[] => {
    const ids = view.zones["hand:p0"]?.tileIds ?? [];
    const five = ids.filter((id) => {
      const k = view.tiles[id]?.kind;
      return k?.suit === "sou" && k.rank === 5;
    });
    return [{ type: "ankan", payload: { tileIds: five } }];
  };
  /** 왕패 14장 — 0번이 영상패, 뒤 10장이 표시패 블록 */
  const deadWallWith = (rinshan: string): string => `${rinshan}111z222z333z4z56789z`;

  it("영상패가 오름패면 깡의 값이 올라간다", () => {
    const base = botScene({ hand: KAN_HAND, turnCount: 5, doraIndicator: "1z" });
    const good = botScene({
      hand: KAN_HAND,
      turnCount: 5,
      doraIndicator: "1z",
      deadWall: deadWallWith("6m"), // 78m + 6m = 완성
    });
    const b = bidKan(buildRead(base.view, "p0"), kanOptions(base.view), NEUTRAL_PROFILE);
    const g = bidKan(buildRead(good.view, "p0"), kanOptions(good.view), NEUTRAL_PROFILE);
    expect(b).not.toBeNull();
    expect(g).not.toBeNull();
    expect((g as { value: number }).value).toBeGreaterThan((b as { value: number }).value);
  });

  it("왕패가 안 보이면 예전 어림값 그대로다", () => {
    const scene = botScene({ hand: KAN_HAND, turnCount: 5, doraIndicator: "1z" });
    const read = buildRead(scene.view, "p0");
    expect(read.intel.deadWall).toEqual({ rinshan: null, nextDora: null });
  });
});

describe("안개 계열 — 가린 쪽과 가려진 쪽 양방향", () => {
  it("내 바닥이 안개면 더 민다 (상대가 나를 못 읽는다)", () => {
    const base = pushChance({ hand: TENPAI, turnCount: 8 });
    const fogged = pushChance({
      hand: TENPAI,
      turnCount: 8,
      augmentView: { "hidden_river:p0": "안개" },
    });
    // 확률식 자체는 같다 — 달라지는 것은 «버림 EV»에 들어가는 몫이다
    expect(base).toBe(fogged);
    const ev = (extra: Partial<BotViewOptions>): number => {
      const scene = botScene({
        hand: TENPAI,
        turnCount: 8,
        riichi: ["p1"],
        discards: { p1: "1z" },
        ...extra,
      });
      const read = buildRead(scene.view, "p0");
      return bidDiscard(read, scene.discardOptions(), null, NEUTRAL_PROFILE)?.value ?? 0;
    };
    expect(ev({ augmentView: { "hidden_river:p0": "안개" } })).toBeGreaterThan(ev({}));
  });

  it("상대 바닥이 나에게 가려져 있으면 그 사람을 더 무서워한다", () => {
    const lvl = (extra: Partial<BotViewOptions>): number => {
      const v = botScene({
        hand: TENPAI,
        turnCount: 10,
        discards: { p1: "1z2z3z" },
        oppMelds: { p1: ["555z"] },
        ...extra,
      }).view;
      return (
        readThreats(v, "p0", [], undefined, readIntel(v, "p0", {})).find((t) => t.player === "p1")
          ?.level ?? 0
      );
    };
    expect(lvl({ hiddenDiscards: { p1: 4 } })).toBeGreaterThan(lvl({}));
  });
});

describe("가려진 도라 — 당하는 쪽도 판단이다", () => {
  it("표시패가 가려져 있으면 «모르지만 있다»로 세어 손을 헐값에 넘기지 않는다", () => {
    const open = buildRead(botScene({ hand: TENPAI, doraIndicator: "7z" }).view, "p0");
    // 표시패가 아예 안 실려 온다 + 그것을 가린 사람이 앉아 있다 = 가려진 도라에 걸렸다
    const hidden = buildRead(
      botScene({ hand: TENPAI, augments: { p1: ["dora_conceal"] } }).view,
      "p0",
    );
    expect(hidden.handDora).toBeGreaterThan(0);
    // 표시패가 보이는데 그 도라가 내 손에 없으면 0이다 (7z 표시 → 도라는 1z)
    expect(open.handDora).toBe(0);
  });
});

describe("정보가 없으면 종전과 한 글자도 다르지 않다", () => {
  it("채널도 공개도 없으면 새 필드가 전부 비어 있다", () => {
    const intel = readIntel(botScene({ hand: TENPAI }).view, "p0", {});
    expect(intel.any).toBe(false);
    expect(intel.myDraws).toEqual([]);
    expect(intel.uraDoraKinds).toEqual([]);
    expect(intel.myRiverHidden).toBe(false);
    expect(intel.deadWall).toEqual({ rinshan: null, nextDora: null });
  });

  it("표시패가 안 실려 왔어도 «가리는 사람»이 없으면 도라를 지어내지 않는다", () => {
    expect(buildRead(botScene({ hand: TENPAI }).view, "p0").handDora).toBe(0);
  });

  it("확정 쯔모가 없으면 `knownDrawsFor`가 undefined다 (확률식이 옛 경로로 간다)", () => {
    const read = buildRead(botScene({ hand: TENPAI }).view, "p0");
    expect(read.knownDrawsFor(read.waits, read.waits)).toBeUndefined();
  });
});
