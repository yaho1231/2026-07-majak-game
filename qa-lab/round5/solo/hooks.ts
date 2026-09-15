/**
 * 훅 호출 계수기 — «이 증강이 실제로 무슨 일을 했는가»를 augmentData·이벤트만으로는 못 본다.
 * 순수 인터셉터(철벽)·규칙만 바꾸는 카드(무역 …)는 키도 이벤트도 액션도 안 남기므로 touched=0
 * 으로 잘못 «발동 불가»가 된다. synergy3/build/instrument.ts 의 방식(install ctx 프록시)을
 * 그대로 쓰되, harness 가 `extraAugments: contentAugments` 를 고정으로 넘기고 standard 4종은
 * 엔진이 직접 등록하므로 **카탈로그 사본을 못 넘긴다** — 대신 이 프로세스 안에서 def.install 을
 * 제자리에서 감싼다(packages/ 소스는 그대로, 메모리상 객체만). SOLO_NO_INSTRUMENT=1 이면 끈다.
 *
 * 세는 것 (좌석 p0 의 증강 id 하나):
 *   ruleSet · reactCall · reactEmit · interCall · interChange · optionOffer
 * touched 판정엔 reactEmit · interChange · optionOffer 를 더하고, «ruleSet 만 있음»은 passive 로 표시한다.
 */
import type { AugmentDef } from "@majak/core";
import { allAugments } from "../../harness.js";

export interface HookCount {
  ruleSet: number;
  reactCall: number;
  reactEmit: number;
  interCall: number;
  interChange: number;
  optionOffer: number;
  /** 설치가 실제로 일어났는가 (preset 이 먹었는가) */
  installed: number;
}
export const zeroHooks = (): HookCount => ({ ruleSet: 0, reactCall: 0, reactEmit: 0, interCall: 0, interChange: 0, optionOffer: 0, installed: 0 });

/** 현재 판의 계수 — key `${seat}|${augId}` */
let current = new Map<string, HookCount>();
let patched = false;
export const instrumentationEnabled = (): boolean => process.env["SOLO_NO_INSTRUMENT"] !== "1";

function bucket(seat: string, aug: string): HookCount {
  const k = `${seat}|${aug}`;
  let c = current.get(k);
  if (c === undefined) { c = zeroHooks(); current.set(k, c); }
  return c;
}

/** 한 판 시작 전에 부른다 */
export function resetHooks(): void { current = new Map(); }
/** 한 판 끝난 뒤 — 그 좌석·증강의 계수 (없으면 0) */
export function hooksOf(seat: string, aug: string): HookCount { return current.get(`${seat}|${aug}`) ?? zeroHooks(); }

/** 카탈로그 117종의 install 을 제자리에서 감싼다 (한 번만, 멱등) */
export function installHookCounters(): void {
  if (patched || !instrumentationEnabled()) return;
  patched = true;
  for (const def of allAugments as AugmentDef[]) {
    const orig = def.install;
    def.install = (ctx: any): void => {
      const seat = String(ctx.holder);
      const c = bucket(seat, def.id);
      c.installed++;
      const proxy: any = Object.create(ctx);
      proxy.setHolderRule = (rule: string, value: unknown): void => { c.ruleSet++; ctx.setHolderRule(rule, value); };
      proxy.reaction = (on: string, react: any, opts?: unknown): void => {
        ctx.reaction(on, (ev: any, rctx: any) => {
          c.reactCall++;
          let emitted = 0;
          // 프로토타입 체인으로 감싼다 — 스프레드는 getter 값을 그 순간 스냅샷해 버린다
          const wrapped: any = Object.create(rctx);
          wrapped.emit = (e: any) => { emitted++; rctx.emit(e); };
          const out = react(ev, wrapped);
          if (emitted > 0) c.reactEmit++;
          return out;
        }, opts);
      };
      proxy.interceptor = (on: string, intercept: any, opts?: unknown): void => {
        ctx.interceptor(on, (ev: any, ictx: any) => {
          c.interCall++;
          const out = intercept(ev, ictx);
          if (out === null || out !== ev) c.interChange++;
          return out;
        }, opts);
      };
      proxy.holderTurnOptions = (build: any): void => {
        ctx.holderTurnOptions((st: any) => {
          const out = build(st);
          if (Array.isArray(out) && out.length > 0) c.optionOffer++;
          return out;
        });
      };
      proxy.holderReactionOptions = (build: any): void => {
        ctx.holderReactionOptions((st: any, d: any) => {
          const out = build(st, d);
          if (Array.isArray(out) && out.length > 0) c.optionOffer++;
          return out;
        });
      };
      orig.call(def, proxy);
    };
  }
}
