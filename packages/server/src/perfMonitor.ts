/**
 * perfMonitor — 서버가 **얼마나 바쁜가**를 숫자로 내는 자리.
 *
 * 2026-09-11 성능 작업 전까지는 부하를 볼 곳이 없었다. "봇을 많이 넣으면 무겁다"가
 * 체감으로만 있었고, 어느 테이블 수에서 응답이 늘어지는지 재는 계기판이 없었다.
 * 여기서 세 가지를 잰다 — 전부 `/healthz`에 실린다.
 *
 * 1. **이벤트 루프 지연** (`perf_hooks.monitorEventLoopDelay`) — 단일 스레드가 막힌
 *    시간. 이 값이 곧 사람이 느끼는 «서버가 늦다»다. 마지막 조회 이후의 창을 낸다
 *    (감시자가 1분마다 부르므로 «지난 1분의 p50·p99·max»가 된다).
 * 2. **봇 판단 시간** — 한 결정에 든 순수 CPU(ms). 엔진이 느려지면 여기가 먼저 오른다.
 * 3. **힙** — 메모리 누수 감시.
 *
 * 부하를 늘리지 않는다: 히스토그램 갱신은 산술 몇 번이다.
 */

import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import type { IntervalHistogram } from "node:perf_hooks";

/**
 * 타이머 해상도(ms). 히스토그램 값에는 이 간격 자체가 들어 있다 — 한가한 루프도
 * «해상도만큼» 지연으로 찍히므로 내보낼 때 뺀다 (그래서 0 근처가 «한가함»이다).
 */
const LOOP_RESOLUTION_MS = 10;
const loopDelay: IntervalHistogram = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
loopDelay.enable();

/** 고정 경계 히스토그램 (ms). 마지막 칸은 «그 이상». */
const DECISION_BOUNDS = [1, 2, 5, 10, 20, 50, 100, 250, 500];
const decisionBuckets = new Array<number>(DECISION_BOUNDS.length + 1).fill(0);
let decisionCount = 0;
let decisionTotalMs = 0;
let decisionMaxMs = 0;

/** 봇 한 결정의 소요 시간을 기록한다 (`BotAgent.decide`). */
export function recordBotDecision(ms: number): void {
  decisionCount++;
  decisionTotalMs += ms;
  if (ms > decisionMaxMs) decisionMaxMs = ms;
  let i = 0;
  while (i < DECISION_BOUNDS.length && ms > (DECISION_BOUNDS[i] as number)) i++;
  decisionBuckets[i] = (decisionBuckets[i] as number) + 1;
}

/** 히스토그램에서 분위수 — 그 칸의 상한(ms)을 돌려준다 (마지막 칸은 «500+») */
function decisionPercentile(q: number): number | string {
  if (decisionCount === 0) return 0;
  const target = Math.ceil(decisionCount * q);
  let acc = 0;
  for (let i = 0; i < decisionBuckets.length; i++) {
    acc += decisionBuckets[i] as number;
    if (acc >= target) {
      return i < DECISION_BOUNDS.length ? (DECISION_BOUNDS[i] as number) : `${DECISION_BOUNDS[DECISION_BOUNDS.length - 1]}+`;
    }
  }
  return `${DECISION_BOUNDS[DECISION_BOUNDS.length - 1]}+`;
}

export interface PerfSnapshot {
  /** 마지막 조회 이후 이벤트 루프 지연 (ms). 0 근처 = 한가함. 타이머 간격은 뺀 값이다 */
  loopDelayMs: { p50: number; p99: number; max: number };
  /** 마지막 조회 이후 봇 판단 */
  botDecision: { count: number; meanMs: number; p50Ms: number | string; p99Ms: number | string; maxMs: number };
  heapMb: { used: number; total: number; rss: number };
}

/** 스냅샷을 내고 창을 비운다 — 다음 조회는 «그 뒤로»를 본다. */
export function perfSnapshot(): PerfSnapshot {
  // ns → ms, 소수 둘째. 타이머 간격을 뺀다(위 LOOP_RESOLUTION_MS 주석). 표본이 없으면 NaN → 0.
  const ns = (v: number): number =>
    Number.isFinite(v) ? Math.max(0, Math.round(v / 1e4) / 100 - LOOP_RESOLUTION_MS) : 0;
  const snap: PerfSnapshot = {
    loopDelayMs: {
      p50: ns(loopDelay.percentile(50)),
      p99: ns(loopDelay.percentile(99)),
      max: ns(loopDelay.max),
    },
    botDecision: {
      count: decisionCount,
      meanMs: decisionCount === 0 ? 0 : Math.round((decisionTotalMs / decisionCount) * 100) / 100,
      p50Ms: decisionPercentile(0.5),
      p99Ms: decisionPercentile(0.99),
      maxMs: Math.round(decisionMaxMs * 100) / 100,
    },
    heapMb: {
      used: Math.round(process.memoryUsage().heapUsed / 1048576),
      total: Math.round(process.memoryUsage().heapTotal / 1048576),
      rss: Math.round(process.memoryUsage().rss / 1048576),
    },
  };
  loopDelay.reset();
  decisionBuckets.fill(0);
  decisionCount = 0;
  decisionTotalMs = 0;
  decisionMaxMs = 0;
  return snap;
}

/** 고해상도 시계 — 측정 지점이 같은 시계를 쓰게 한다 */
export const nowMs = (): number => performance.now();
