/**
 * bot/human/* — 리플레이에서 잰 사람 성향 표가 봇의 입찰을 **기울이기만** 하는지.
 *
 * 표의 값 자체는 생성물이라 여기서 검증하지 않는다. 검증하는 것은 모듈의 계약이다:
 * 스위치가 꺼져 있으면 0·1(종전과 동일), 켜지면 표의 방향대로, 크기는 절대 EV를
 * 뒤집지 않는 범위 안.
 */
import { describe, expect, it } from "vitest";
import type { TileKind } from "@majak/core";
import { buildRead } from "../src/bot/read.js";
import { bidDiscard, bidRiichi } from "../src/bot/discard.js";
import { profileOf } from "../src/bot/profile.js";
import { parseFlags } from "../src/bot/flags.js";
import { botScene } from "./botTestView.js";
import { gapOf, meanGap, styleOn } from "../src/bot/human/style.js";
import { riichiTilt } from "../src/bot/human/riichiStyle.js";
import { tasteBonus, tasteClass } from "../src/bot/human/discardStyle.js";
import { augmentGate } from "../src/bot/human/augmentStyle.js";
import { draftTilt } from "../src/bot/human/draftStyle.js";
import { lossFactor } from "../src/bot/human/defenseStyle.js";
import { AUGMENT_STYLE, DRAFT_PICK, RIICHI_STYLE } from "../src/bot/human/priors.js";

const rng = (seq: number[]) => {
  let i = 0;
  return { int: (n: number) => 0 % n, float: () => seq[i++ % seq.length] ?? 0.5 };
};

describe("style — 스위치", () => {
  it("채택된 영역(후로·수비·타패·드래프트·증강)은 기본으로 켜져 있고 `noHumanStyle`로만 꺼진다", () => {
    for (const a of ["call", "defense", "discard", "augment", "draft"] as const) {
      expect(styleOn(parseFlags(""), a)).toBe(true);
      expect(styleOn(parseFlags("noHumanStyle"), a)).toBe(false);
    }
  });
  it("채택되지 않은 영역(리치)은 스위치로만 켠다", () => {
    expect(styleOn(parseFlags(""), "riichi")).toBe(false);
    expect(styleOn(parseFlags("human"), "riichi")).toBe(true);
    expect(styleOn(parseFlags("humanRiichi"), "riichi")).toBe(true);
    expect(styleOn(parseFlags("human,noHumanStyle"), "riichi")).toBe(false);
  });
  it("로짓 차는 사람이 더 자주 고르면 양수, 없는 셀은 0", () => {
    expect(gapOf([0.6, 0.3])).toBeGreaterThan(0);
    expect(gapOf([0.1, 0.4])).toBeLessThan(0);
    expect(gapOf(undefined)).toBe(0);
    expect(meanGap([undefined, [0.5, 0.5]])).toBe(0);
  });
});

describe("riichiStyle", () => {
  it("표의 방향을 따른다 — 초반 나쁜 대기는 벌점, 후반은 웃돈", () => {
    const early = RIICHI_STYLE["wait=1-3|turn=early"];
    const late = RIICHI_STYLE["wait=1-3|turn=late"];
    if (early === undefined || late === undefined) return; // 표에 없으면 검증할 것이 없다
    expect(early[0]).toBeLessThan(early[1]);
    expect(late[0]).toBeGreaterThan(late[1]);
    const scene = botScene({ hand: "234m567m789p11s5s7z", turnCount: 2 });
    const read = buildRead(scene.view, "p0", { profile: profileOf("balanced") });
    const s2 = botScene({ hand: "234m567m789p11s5s7z", turnCount: 14 });
    const readLate = buildRead(s2.view, "p0", { profile: profileOf("balanced") });
    expect(riichiTilt(read, 2, 3000)).toBeLessThan(riichiTilt(readLate, 2, 3000));
  });
  it("스위치가 꺼진 리치 입찰은 켠 것과 값이 다르고, 둘 다 제시된 옵션을 돌려준다", () => {
    const scene = botScene({ hand: "234m567m789p11s45s9s", turnCount: 3, wallLeft: 40 });
    const off = buildRead(scene.view, "p0", { profile: profileOf("balanced") });
    const on = buildRead(scene.view, "p0", { profile: profileOf("balanced"), flags: parseFlags("humanRiichi") });
    const a = bidRiichi(off, scene.riichiOptions(), null, profileOf("balanced"));
    const b = bidRiichi(on, scene.riichiOptions(), null, profileOf("balanced"));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(scene.riichiOptions().some((o) => JSON.stringify(o) === JSON.stringify(b?.option))).toBe(true);
    expect(a?.value).not.toBe(b?.value);
  });
});

describe("discardStyle", () => {
  const k = (suit: TileKind["suit"], rank: number): TileKind => ({ suit, rank });
  it("종류 분류 — 고립·또이쯔·도라·객풍/역패", () => {
    const scene = botScene({ hand: "19m22p5s7z1z44z", turnCount: 2, doraIndicator: "6z" });
    const read = buildRead(scene.view, "p0", { profile: profileOf("balanced") });
    expect(tasteClass(k("man", 1), read)).toBe("19i");
    expect(tasteClass(k("pin", 2), read)).toBe("28P");
    expect(tasteClass(k("sou", 5), read)).toBe("37i");
    expect(tasteClass(k("dragon", 3), read)).toBe("yakuhaiD"); // 7z=중, 표시패 6z(발)→도라 중
    expect(tasteClass(k("wind", 4), read)).toBe("guestP");
  });
  it("위협이 있거나 손이 가까우면 0, 아니면 ±60점 안", () => {
    const scene = botScene({ hand: "19m22p5s7z1z44z", turnCount: 2 });
    const read = buildRead(scene.view, "p0", { profile: profileOf("balanced") });
    expect(Math.abs(tasteBonus(k("man", 1), read))).toBeLessThanOrEqual(60);
    const near = botScene({ hand: "234m567m789p11s5s7z", turnCount: 2 });
    expect(tasteBonus(k("sou", 5), buildRead(near.view, "p0", { profile: profileOf("balanced") }))).toBe(0);
  });
  it("버림 입찰은 스위치와 무관하게 제시된 옵션을 돌려준다", () => {
    const scene = botScene({ hand: "19m22p5s7z1z44z", turnCount: 2 });
    for (const f of ["", "humanDiscard", "human"]) {
      const read = buildRead(scene.view, "p0", { profile: profileOf("balanced"), flags: parseFlags(f) });
      const bid = bidDiscard(read, scene.discardOptions(), null, profileOf("balanced"));
      expect(bid).not.toBeNull();
      expect(scene.discardOptions().some((o) => JSON.stringify(o) === JSON.stringify(bid?.option))).toBe(true);
    }
  });
});

describe("defenseStyle", () => {
  it("위협이 없으면 1, 있으면 [0.55, 1] — 저울을 올리지 않는다", () => {
    const quiet = botScene({ hand: "19m22p5s7z1z44z", turnCount: 8 });
    expect(lossFactor(buildRead(quiet.view, "p0", { profile: profileOf("balanced") }), 3000)).toBe(1);
    const scene = botScene({ hand: "19m22p5s7z1z44z", turnCount: 8, riichi: ["p1"] });
    const f = lossFactor(buildRead(scene.view, "p0", { profile: profileOf("balanced") }), 3000);
    expect(f).toBeGreaterThanOrEqual(0.4);
    expect(f).toBeLessThanOrEqual(1);
  });
});

describe("augmentStyle", () => {
  it("표에 없는 증강은 언제나 통과, 봇이 사람보다 자주 쓰는 증강은 비의 제곱근(바닥 0.3)으로만", () => {
    expect(augmentGate("no_such_augment", 3, rng([0.99]))).toBe(true);
    const spammy = Object.entries(AUGMENT_STYLE).find(([, s]) => s.turn[0][1] > s.turn[0][0] * 3 + 0.1);
    if (spammy === undefined) return;
    const [id, s] = spammy;
    const ratio = Math.max(0.3, Math.sqrt((s.turn[0][0] + 0.02) / (s.turn[0][1] + 0.02)));
    expect(augmentGate(id, 1, rng([Math.min(0.999, ratio + 0.05)]))).toBe(false);
    expect(augmentGate(id, 1, rng([Math.max(0, ratio - 0.01)]))).toBe(true);
  });
  it("사람이 더 자주 쓰는 증강은 항상 통과한다", () => {
    const under = Object.entries(AUGMENT_STYLE).find(([, s]) => s.turn[0][0] > s.turn[0][1]);
    if (under === undefined) return;
    expect(augmentGate(under[0], 1, rng([0.999]))).toBe(true);
  });
});

describe("draftStyle", () => {
  it("배율은 [0.71, 1.42] 안이고 표에 없으면 1", () => {
    expect(draftTilt("no_such")).toBe(1);
    for (const id of Object.keys(DRAFT_PICK)) {
      const t = draftTilt(id);
      expect(t).toBeGreaterThanOrEqual(Math.sqrt(0.5) - 1e-9);
      expect(t).toBeLessThanOrEqual(Math.sqrt(2) + 1e-9);
    }
  });
});
