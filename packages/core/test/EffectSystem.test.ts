import { describe, expect, it } from "vitest";
import { EffectRegistry } from "../src/engine/effects/EffectRegistry.js";
import { EventProcessor } from "../src/engine/effects/EventProcessor.js";
import type { Reducer } from "../src/engine/effects/EventProcessor.js";
import type { GameEvent } from "../src/engine/events/GameEvent.js";
import { RuleLayer, RuleRegistry } from "../src/engine/rules/RuleRegistry.js";

/** 장난감 상태: 이벤트 로그처럼 적용된 (type, value)를 쌓는다 */
interface ToyState {
  applied: { type: string; value: number }[];
}

const reducer: Reducer<ToyState> = (state, event) => ({
  applied: [...state.applied, { type: event.type, value: (event.payload as { value: number }).value }],
});

function setup(options?: ConstructorParameters<typeof EventProcessor>[2]) {
  const effects = new EffectRegistry<ToyState>();
  const processor = new EventProcessor<ToyState>(effects, reducer, options);
  const rules = new RuleRegistry();
  const state: ToyState = { applied: [] };
  return { effects, processor, rules, state };
}

const ev = (type: string, value: number) => ({ type, payload: { value } });

describe("EventProcessor 기본 동작", () => {
  it("훅이 없으면 루트 이벤트가 그대로 적용되고 lastSeq+1부터 seq를 받는다", () => {
    const { processor, rules, state } = setup();
    const result = processor.process(state, rules, ev("add", 5), 10);
    expect(result.state.applied).toEqual([{ type: "add", value: 5 }]);
    expect(result.events).toEqual([{ seq: 11, type: "add", payload: { value: 5 } }]);
    expect(result.canceled).toEqual([]);
  });

  it("원본 상태는 불변이다 (트랜잭션 의미론의 전제)", () => {
    const { processor, rules, state } = setup();
    processor.process(state, rules, ev("add", 5), 0);
    expect(state.applied).toEqual([]);
  });
});

describe("Interceptor", () => {
  it("payload를 수정할 수 있다", () => {
    const { effects, processor, rules, state } = setup();
    effects.register({
      source: "silver-aug",
      layer: RuleLayer.Silver,
      on: "add",
      intercept: (e) => ({ ...e, payload: { value: (e.payload as { value: number }).value * 2 } }),
    });
    const result = processor.process(state, rules, ev("add", 5), 0);
    expect(result.state.applied).toEqual([{ type: "add", value: 10 }]);
  });

  it("layer가 높을수록 나중에 실행되어 최종 발언권을 가진다", () => {
    const { effects, processor, rules, state } = setup();
    effects.register({
      source: "prism-aug",
      layer: RuleLayer.Prism,
      on: "add",
      intercept: (e) => ({ ...e, payload: { value: 99 } }),
    });
    effects.register({
      source: "silver-aug",
      layer: RuleLayer.Silver,
      on: "add",
      intercept: (e) => ({ ...e, payload: { value: (e.payload as { value: number }).value + 1 } }),
    });
    const result = processor.process(state, rules, ev("add", 5), 0);
    expect(result.state.applied).toEqual([{ type: "add", value: 99 }]);
  });

  it("null 반환 = 취소. 적용되지 않고 취소 기록이 남는다", () => {
    const { effects, processor, rules, state } = setup();
    effects.register({
      source: "shield-aug",
      layer: RuleLayer.Gold,
      on: "add",
      intercept: () => null,
    });
    const result = processor.process(state, rules, ev("add", 5), 0);
    expect(result.state.applied).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.canceled).toEqual([
      { event: ev("add", 5), by: "shield-aug", reason: "canceled" },
    ]);
  });

  it("type 변경 = 대체. 새 이벤트가 파이프라인에 재진입한다", () => {
    const { effects, processor, rules, state } = setup();
    effects.register({
      source: "seal-aug",
      layer: RuleLayer.Prism,
      on: "add",
      intercept: (e) => ({ type: "sealed", payload: e.payload }),
    });
    const result = processor.process(state, rules, ev("add", 5), 0);
    expect(result.state.applied).toEqual([{ type: "sealed", value: 5 }]);
    expect(result.canceled).toEqual([
      { event: ev("add", 5), by: "seal-aug", reason: "replaced" },
    ]);
  });

  it("Interceptor는 적용 전 상태를 본다", () => {
    const { effects, processor, rules, state } = setup();
    let seen = -1;
    effects.register({
      source: "observer",
      layer: RuleLayer.Silver,
      on: "add",
      intercept: (e, ctx) => {
        seen = ctx.state.applied.length;
        return e;
      },
    });
    processor.process(state, rules, ev("add", 5), 0);
    expect(seen).toBe(0);
  });
});

describe("Reaction", () => {
  it("emit으로 후속 이벤트를 방출하고, causedBy 체인이 기록된다", () => {
    const { effects, processor, rules, state } = setup();
    effects.register({
      source: "bonus-aug",
      layer: RuleLayer.Silver,
      on: "add",
      react: (_e, ctx) => ctx.emit(ev("bonus", 500)),
    });
    const result = processor.process(state, rules, ev("add", 5), 0);
    expect(result.state.applied).toEqual([
      { type: "add", value: 5 },
      { type: "bonus", value: 500 },
    ]);
    expect(result.events[1]?.causedBy).toBe(result.events[0]?.seq);
  });

  it("Reaction은 적용 후 상태를 본다", () => {
    const { effects, processor, rules, state } = setup();
    let seen = -1;
    effects.register({
      source: "observer",
      layer: RuleLayer.Silver,
      on: "add",
      react: (_e, ctx) => {
        seen = ctx.state.applied.length;
      },
    });
    processor.process(state, rules, ev("add", 5), 0);
    expect(seen).toBe(1);
  });

  it('"*" 와일드카드는 모든 이벤트에 반응한다', () => {
    const { effects, processor, rules, state } = setup();
    const types: string[] = [];
    effects.register({
      source: "logger",
      layer: RuleLayer.System,
      on: "*",
      react: (e) => {
        types.push(e.type);
      },
    });
    effects.register({
      source: "bonus-aug",
      layer: RuleLayer.Silver,
      on: "add",
      react: (_e, ctx) => ctx.emit(ev("bonus", 1)),
    });
    processor.process(state, rules, ev("add", 5), 0);
    expect(types).toEqual(["add", "bonus"]);
  });
});

describe("Issue 004 — 연쇄 폭주 방지", () => {
  it("세로 연쇄(A가 A를 다시 방출)는 maxChainDepth에서 예외", () => {
    const { effects, processor, rules, state } = setup({ maxChainDepth: 5 });
    effects.register({
      source: "loop-aug",
      layer: RuleLayer.Prism,
      on: "ping",
      react: (_e, ctx) => ctx.emit(ev("ping", 1)),
    });
    expect(() => processor.process(state, rules, ev("ping", 1), 0)).toThrow(
      "maxChainDepth",
    );
    expect(state.applied).toEqual([]); // 호출자가 원본을 유지하면 상태 오염 없음
  });

  it("가로 폭발(하나가 둘씩 방출)은 maxEventsPerRoot에서 예외", () => {
    const { effects, processor, rules, state } = setup({
      maxChainDepth: 1000,
      maxEventsPerRoot: 20,
    });
    effects.register({
      source: "fork-aug",
      layer: RuleLayer.Prism,
      on: "ping",
      react: (_e, ctx) => {
        ctx.emit(ev("ping", 1));
        ctx.emit(ev("ping", 2));
      },
    });
    expect(() => processor.process(state, rules, ev("ping", 0), 0)).toThrow(
      "maxEventsPerRoot",
    );
  });

  it("한도 내의 정당한 콤보(2중 연쇄)는 허용된다", () => {
    const { effects, processor, rules, state } = setup();
    effects.register({
      source: "combo-a",
      layer: RuleLayer.Silver,
      on: "add",
      react: (_e, ctx) => ctx.emit(ev("echo", 1)),
    });
    effects.register({
      source: "combo-b",
      layer: RuleLayer.Silver,
      on: "echo",
      react: (_e, ctx) => ctx.emit(ev("final", 2)),
    });
    const result = processor.process(state, rules, ev("add", 5), 0);
    expect(result.state.applied.map((a) => a.type)).toEqual(["add", "echo", "final"]);
  });
});

describe("EffectRegistry", () => {
  it("intercept도 react도 없는 등록은 실패한다", () => {
    const { effects } = setup();
    expect(() =>
      effects.register({ source: "empty", layer: RuleLayer.Silver, on: "add" }),
    ).toThrow("intercept or react");
  });

  it("removeBySource로 증강의 모든 훅이 사라진다", () => {
    const { effects, processor, rules, state } = setup();
    effects.register({
      source: "aug-1",
      layer: RuleLayer.Gold,
      on: "add",
      intercept: () => null,
    });
    effects.removeBySource("aug-1");
    const result = processor.process(state, rules, ev("add", 5), 0);
    expect(result.state.applied).toEqual([{ type: "add", value: 5 }]);
  });
});

describe("훅 격리 (docs/25 최우선#1)", () => {
  it("Interceptor가 던지면 그 source만 빠지고 나머지는 정상 적용된다", () => {
    const { effects, processor, rules, state } = setup();
    effects.register({
      source: "broken-aug",
      layer: RuleLayer.Silver,
      on: "add",
      intercept: () => {
        throw new Error("boom");
      },
    });
    effects.register({
      source: "healthy-aug",
      layer: RuleLayer.Gold,
      on: "add",
      intercept: (e) => ({ ...e, payload: { value: (e.payload as { value: number }).value * 2 } }),
    });

    const result = processor.process(state, rules, ev("add", 5), 0);

    // 던진 쪽은 "아무것도 안 한 것"으로 취급 → 5가 그대로 넘어가 healthy가 2배
    expect(result.state.applied).toEqual([{ type: "add", value: 10 }]);
    expect(result.failures).toEqual([
      { source: "broken-aug", phase: "intercept", eventType: "add", message: "boom" },
    ]);
  });

  it("Reaction이 던지면 그 Reaction이 이미 emit한 이벤트는 전부 폐기된다 (all-or-nothing)", () => {
    const { effects, processor, rules, state } = setup();
    effects.register({
      source: "broken-aug",
      layer: RuleLayer.Silver,
      on: "add",
      react: (_e, ctx) => {
        ctx.emit(ev("half-emitted", 1));
        throw new Error("boom");
      },
    });
    effects.register({
      source: "healthy-aug",
      layer: RuleLayer.Gold,
      on: "add",
      react: (_e, ctx) => {
        ctx.emit(ev("follow", 2));
      },
    });

    const result = processor.process(state, rules, ev("add", 5), 0);

    expect(result.state.applied).toEqual([
      { type: "add", value: 5 },
      { type: "follow", value: 2 },
    ]);
    expect(result.events.map((e) => e.type)).not.toContain("half-emitted");
    expect(result.failures).toEqual([
      { source: "broken-aug", phase: "react", eventType: "add", message: "boom" },
    ]);
  });

  it("onEffectError로 실패가 보고되고, 콜백이 던져도 게임은 계속된다", () => {
    const seen: string[] = [];
    const { effects, processor, rules, state } = setup({
      onEffectError: (f) => {
        seen.push(`${f.phase}:${f.source}`);
        throw new Error("logger exploded");
      },
    });
    effects.register({
      source: "broken-aug",
      layer: RuleLayer.Silver,
      on: "add",
      intercept: () => {
        throw new Error("boom");
      },
    });

    const result = processor.process(state, rules, ev("add", 5), 0);

    expect(seen).toEqual(["intercept:broken-aug"]);
    expect(result.state.applied).toEqual([{ type: "add", value: 5 }]);
  });

  it("한도 초과는 여전히 throw다 — 격리 대상이 아니다", () => {
    const { effects, processor, rules, state } = setup({ maxEventsPerRoot: 5 });
    effects.register({
      source: "runaway",
      layer: RuleLayer.Silver,
      on: "add",
      react: (_e, ctx) => {
        ctx.emit(ev("add", 1));
      },
    });
    expect(() => processor.process(state, rules, ev("add", 1), 0)).toThrow(/maxEventsPerRoot/);
  });

  it("실패가 없으면 failures는 빈 배열이다", () => {
    const { processor, rules, state } = setup();
    expect(processor.process(state, rules, ev("add", 5), 0).failures).toEqual([]);
  });
});
