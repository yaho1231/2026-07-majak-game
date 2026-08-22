/**
 * 증강 발동 계측기 — packages/ 를 건드리지 않고 AugmentDef.install 의 ctx 를 감싸
 * "이 증강이 실제로 무슨 일을 했는가"를 센다.
 *
 * 세는 것 (증강 id × 좌석):
 *  - ruleSet      : setHolderRule 호출 (설치 시점 세팅)
 *  - reactCall    : reaction 콜백이 불린 횟수
 *  - reactEmit    : 그 콜백이 실제로 이벤트를 emit 한 횟수  ← "일을 했다"의 주 신호
 *  - interCall    : interceptor 콜백이 불린 횟수
 *  - interChange  : interceptor 가 이벤트를 바꾸거나 취소한 횟수 ← 주 신호
 *  - optionOffer  : holderTurnOptions/holderReactionOptions 가 후보를 실제로 낸 횟수
 *  - actions      : 이 증강이 등록한 액션 타입들 (실제 발동은 actionFired 로 센다)
 */
import type { AugmentDef } from "@majak/core";

export interface AugCount {
  ruleSet: number;
  reactCall: number;
  reactEmit: number;
  interCall: number;
  interChange: number;
  optionOffer: number;
  actionFired: number;
  emittedTypes: Map<string, number>;
}

export interface Metrics {
  /** `${augId}` -> counts (좌석 구분 없이 합산; 좌석별은 bySeat) */
  aug: Map<string, AugCount>;
  bySeat: Map<string, AugCount>; // key `${seat}|${augId}`
  actionToAug: Map<string, string>;
  augActions: Map<string, Set<string>>;
}

export function newMetrics(): Metrics {
  return { aug: new Map(), bySeat: new Map(), actionToAug: new Map(), augActions: new Map() };
}

function zero(): AugCount {
  return {
    ruleSet: 0, reactCall: 0, reactEmit: 0, interCall: 0, interChange: 0,
    optionOffer: 0, actionFired: 0, emittedTypes: new Map(),
  };
}

export function counts(m: Metrics, aug: string, seat?: string): AugCount[] {
  let a = m.aug.get(aug);
  if (a === undefined) { a = zero(); m.aug.set(aug, a); }
  if (seat === undefined) return [a];
  const k = `${seat}|${aug}`;
  let b = m.bySeat.get(k);
  if (b === undefined) { b = zero(); m.bySeat.set(k, b); }
  return [a, b];
}

function bump(cs: AugCount[], f: (c: AugCount) => void): void {
  for (const c of cs) f(c);
}

/** 카탈로그를 감싼다 — install ctx 를 프록시해 훅 호출을 센다 */
export function wrapCatalog(m: Metrics, defs: readonly AugmentDef[]): AugmentDef[] {
  return defs.map((def): AugmentDef => ({
    ...def,
    install: (ctx: any): void => {
      const seat = String(ctx.holder);
      const cs = (): AugCount[] => counts(m, def.id, seat);
      let before: Set<string> | null = null;
      try { before = new Set(ctx.engine.actions.types() as string[]); } catch { before = null; }

      const proxy: any = Object.create(ctx);
      // 값 속성은 프로토타입 체인으로 흘러가고, 함수만 여기서 덮는다.
      proxy.setHolderRule = (rule: string, value: unknown): void => {
        bump(cs(), (c) => { c.ruleSet++; });
        ctx.setHolderRule(rule, value);
      };
      proxy.reaction = (on: string, react: any, opts?: unknown): void => {
        ctx.reaction(on, (ev: any, rctx: any) => {
          const c = cs();
          bump(c, (x) => { x.reactCall++; });
          let emitted = 0;
          const wrapped = {
            ...rctx,
            get state() { return rctx.state; },
            get rules() { return rctx.rules; },
            emit: (e: any) => {
              emitted++;
              const t = String(e?.type ?? "?");
              bump(c, (x) => { x.emittedTypes.set(t, (x.emittedTypes.get(t) ?? 0) + 1); });
              rctx.emit(e);
            },
          };
          const out = react(ev, wrapped);
          if (emitted > 0) bump(c, (x) => { x.reactEmit++; });
          return out;
        }, opts);
      };
      proxy.interceptor = (on: string, intercept: any, opts?: unknown): void => {
        ctx.interceptor(on, (ev: any, ictx: any) => {
          const c = cs();
          bump(c, (x) => { x.interCall++; });
          const out = intercept(ev, ictx);
          if (out === null || out !== ev) bump(c, (x) => { x.interChange++; });
          return out;
        }, opts);
      };
      proxy.holderTurnOptions = (build: any): void => {
        ctx.holderTurnOptions((st: any) => {
          const out = build(st);
          if (Array.isArray(out) && out.length > 0) bump(cs(), (x) => { x.optionOffer++; });
          return out;
        });
      };
      proxy.holderReactionOptions = (build: any): void => {
        ctx.holderReactionOptions((st: any, d: any) => {
          const out = build(st, d);
          if (Array.isArray(out) && out.length > 0) bump(cs(), (x) => { x.optionOffer++; });
          return out;
        });
      };

      def.install(proxy);

      if (before !== null) {
        try {
          for (const t of ctx.engine.actions.types() as string[]) {
            if (!before.has(t)) {
              m.actionToAug.set(t, def.id);
              let s = m.augActions.get(def.id);
              if (s === undefined) { s = new Set(); m.augActions.set(def.id, s); }
              s.add(t);
            }
          }
        } catch { /* ignore */ }
      }
    },
  }));
}
