import { describe, expect, it } from "vitest";
import { RuleLayer, RuleRegistry } from "../src/engine/rules/RuleRegistry.js";

describe("RuleRegistry", () => {
  it("기본값을 그대로 돌려준다", () => {
    const rules = new RuleRegistry();
    rules.define("riichi.cost", 1000);
    expect(rules.resolve<number>("riichi.cost")).toBe(1000);
  });

  it("정의되지 않은 규칙 조회·수정은 즉시 실패한다", () => {
    const rules = new RuleRegistry();
    expect(() => rules.resolve("no.such.rule")).toThrow("Unknown rule");
    expect(() =>
      rules.addModifier("no.such.rule", {
        source: "x",
        layer: RuleLayer.Silver,
        apply: (v) => v,
      }),
    ).toThrow("unknown rule");
  });

  it("같은 규칙 재정의는 실패한다", () => {
    const rules = new RuleRegistry();
    rules.define("riichi.cost", 1000);
    expect(() => rules.define("riichi.cost", 500)).toThrow("already defined");
  });

  it("등급(Layer)이 높은 증강이 나중에 적용되어 최종 발언권을 가진다", () => {
    const rules = new RuleRegistry();
    rules.define("riichi.cost", 1000);
    // Prism을 먼저 등록해도 Silver보다 나중에 적용된다
    rules.addModifier<number>("riichi.cost", {
      source: "prism-aug",
      layer: RuleLayer.Prism,
      apply: () => 0,
    });
    rules.addModifier<number>("riichi.cost", {
      source: "silver-aug",
      layer: RuleLayer.Silver,
      apply: (v) => v - 500,
    });
    expect(rules.resolve<number>("riichi.cost")).toBe(0);
  });

  it("같은 등급끼리는 획득(등록) 순서대로 합성된다", () => {
    const rules = new RuleRegistry();
    rules.define("dora.count", 1);
    rules.addModifier<number>("dora.count", {
      source: "a",
      layer: RuleLayer.Silver,
      apply: (v) => v + 1, // 1 → 2
    });
    rules.addModifier<number>("dora.count", {
      source: "b",
      layer: RuleLayer.Silver,
      apply: (v) => v * 2, // 2 → 4
    });
    expect(rules.resolve<number>("dora.count")).toBe(4);
  });

  it("System 레이어는 어떤 증강보다도 나중에 적용된다 (엔진 안전장치)", () => {
    const rules = new RuleRegistry();
    rules.define("riichi.cost", 1000);
    rules.addModifier<number>("riichi.cost", {
      source: "engine-floor",
      layer: RuleLayer.System,
      apply: (v) => Math.max(v, 0),
    });
    rules.addModifier<number>("riichi.cost", {
      source: "prism-aug",
      layer: RuleLayer.Prism,
      apply: () => -5000,
    });
    expect(rules.resolve<number>("riichi.cost")).toBe(0);
  });

  it("증강 소멸 시 removeBySource로 해당 Modifier가 전부 사라진다", () => {
    const rules = new RuleRegistry();
    rules.define("riichi.cost", 1000);
    rules.define("hand.maxSize", 13);
    rules.addModifier<number>("riichi.cost", {
      source: "aug-1",
      layer: RuleLayer.Silver,
      apply: () => 500,
    });
    rules.addModifier<number>("hand.maxSize", {
      source: "aug-1",
      layer: RuleLayer.Prism,
      apply: (v) => v + 1,
    });
    rules.removeBySource("aug-1");
    expect(rules.resolve<number>("riichi.cost")).toBe(1000);
    expect(rules.resolve<number>("hand.maxSize")).toBe(13);
  });

  it("문맥(playerId)에 따라 다른 값을 만들 수 있다", () => {
    const rules = new RuleRegistry();
    rules.define("riichi.cost", 1000);
    rules.addModifier<number>("riichi.cost", {
      source: "aug-p1",
      layer: RuleLayer.Silver,
      apply: (v, ctx) => (ctx.playerId === "p1" ? 500 : v),
    });
    expect(rules.resolve<number>("riichi.cost", { playerId: "p1" })).toBe(500);
    expect(rules.resolve<number>("riichi.cost", { playerId: "p2" })).toBe(1000);
  });
});
