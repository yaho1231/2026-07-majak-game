/**
 * 봇 행동 제약(증강 테스트) 단위 테스트 — 후로·리치·화료·증강 금지.
 *
 * 검증: 제약이 걸리면 그 선택지가 후보에서 빠진다 · 제약이 없으면 원본 그대로다 ·
 *       전부 걸러지면 원본으로 되돌아간다(봇이 답을 못 내면 판이 멈춘다).
 */

import { describe, expect, it } from "vitest";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import { restrictOptions } from "../src/BotAgent.js";

const opt = (type: string, payload: unknown = {}): ActionOption => ({ type, payload }) as ActionOption;

const types = (options: ActionOption[]): string[] => options.map((o) => o.type);

describe("봇 행동 제약 (restrictOptions)", () => {
  const turn = [opt("win"), opt("riichi"), opt("discard"), opt("ankan"), opt("recall")];

  it("제약이 없으면 원본 배열을 그대로 돌려준다 (실대국 봇 불변)", () => {
    expect(restrictOptions(turn, null)).toBe(turn);
    // 전부 꺼진 객체는 BotAgent가 null로 정규화하지만, 그대로 와도 하나도 빠지지 않는다
    expect(restrictOptions(turn, {})).toEqual(turn);
  });

  it("화료 금지 — win이 빠진다", () => {
    expect(types(restrictOptions(turn, { noWin: true }))).not.toContain("win");
  });

  it("리치 금지 — riichi만 빠지고 버림은 남는다", () => {
    const left = types(restrictOptions(turn, { noRiichi: true }));
    expect(left).not.toContain("riichi");
    expect(left).toContain("discard");
  });

  it("후로 금지 — 펑·치·대명깡이 빠지고 안깡은 남는다 (자기 손 안의 일)", () => {
    const call = [opt("pon"), opt("chi"), opt("minkan"), opt("ankan"), opt("pass")];
    const left = types(restrictOptions(call, { noCall: true }));
    expect(left).toEqual(["ankan", "pass"]);
  });

  it("증강 금지 — 표준 액션이 아닌 것(=액티브 증강)이 빠진다", () => {
    const left = types(restrictOptions(turn, { noAugment: true }));
    expect(left).not.toContain("recall");
    expect(left).toContain("discard");
  });

  it("론 프롬프트에서 화료를 금지해도 패스가 남는다", () => {
    expect(types(restrictOptions([opt("win"), opt("pass")], { noWin: true }))).toEqual(["pass"]);
  });

  it("전부 걸러지면 원본으로 되돌아간다 (고를 것이 없으면 판이 멈춘다)", () => {
    const only = [opt("win")];
    expect(restrictOptions(only, { noWin: true })).toBe(only);
  });
});
