/**
 * evaluate — 화료 채점의 조립.
 * 변형(분해 × 화료패 위치) 전부를 채점하고 최고를 채택한다.
 * 비교 순서: 역만 수 > 판(도라 포함) > 부.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md
 */

import type { TileKind } from "../tiles/Tile.js";
import { buildVariants } from "./WinContext.js";
import type { ScoringVariant, WaitType, WinContext } from "./WinContext.js";
import { countDora } from "./dora.js";
import { calculateFu } from "./fu.js";
import type { YakuRegistry } from "./YakuRegistry.js";

export interface YakuResult {
  id: string;
  name: string;
  han: number;
}

export interface WinEvaluation {
  /** 역이 1개 이상인가 (false = 형태는 화료지만 역 없음 → 화료 불가) */
  ok: boolean;
  yakumanCount: number;
  yaku: YakuResult[];
  /** 역만이면 0 (역만은 판을 세지 않는다) */
  yakuHan: number;
  doraHan: number;
  uraHan: number;
  redHan: number;
  /** yakuHan + 도라 계 */
  han: number;
  fu: number;
  waitType: WaitType;
}

interface Candidate extends WinEvaluation {
  variant: ScoringVariant;
}

/** 도라 계산용 전체 패 (깡의 4장째 포함) */
function fullKinds(ctx: WinContext): TileKind[] {
  return [...ctx.hand, ...ctx.melds.flatMap((m) => m.tiles)];
}

function better(a: Candidate | null, b: Candidate): Candidate {
  if (a === null) return b;
  if (a.yakumanCount !== b.yakumanCount) {
    return a.yakumanCount > b.yakumanCount ? a : b;
  }
  if (a.han !== b.han) return a.han > b.han ? a : b;
  return a.fu >= b.fu ? a : b;
}

/**
 * @returns null = 화료 형태가 아님 / ok:false = 형태는 맞지만 역 없음
 */
export function evaluateWin(
  ctx: WinContext,
  registry: YakuRegistry,
): WinEvaluation | null {
  const variants = buildVariants(ctx);
  if (variants.length === 0) return null;

  let best: Candidate | null = null;

  const blocked =
    ctx.blockedYaku !== undefined && ctx.blockedYaku.length > 0
      ? new Set(ctx.blockedYaku)
      : null;

  for (const variant of variants) {
    const matched: YakuResult[] = [];
    let yakumanCount = 0;

    for (const def of registry.all()) {
      if (blocked !== null && blocked.has(def.id)) continue;
      const han = variant.isClosed ? def.closedHan : def.openHan;
      if (han === null) continue;
      if (!def.check(variant, ctx)) continue;
      if (def.isYakuman === true) {
        yakumanCount += 1;
        matched.push({ id: def.id, name: def.name, han });
      } else {
        matched.push({ id: def.id, name: def.name, han });
      }
    }

    let candidate: Candidate;
    if (yakumanCount > 0) {
      // 역만 성립 시 일반 역·도라는 세지 않는다
      const yakumanOnly = matched.filter(
        (y) => registry.get(y.id)?.isYakuman === true,
      );
      candidate = {
        ok: true,
        yakumanCount,
        yaku: yakumanOnly,
        yakuHan: 0,
        doraHan: 0,
        uraHan: 0,
        redHan: 0,
        han: 0,
        fu: 0,
        waitType: variant.waitType,
        variant,
      };
    } else {
      // 보조 역(auxiliary)은 실제 역이 1개 이상 있을 때만 적용된다 —
      // 도라처럼 판만 더하고, "역 있음" 판정(ok)에는 세지 않는다.
      const hasRealYaku = matched.some(
        (y) => registry.get(y.id)?.auxiliary !== true,
      );
      const applied = hasRealYaku
        ? matched
        : matched.filter((y) => registry.get(y.id)?.auxiliary !== true);
      const yakuHan = applied.reduce((sum, y) => sum + y.han, 0);
      const hasPinfu = applied.some((y) => y.id === "pinfu");
      const fu = calculateFu(variant, ctx, hasPinfu);
      let doraHan = 0;
      let uraHan = 0;
      let redHan = 0;
      if (hasRealYaku) {
        const kinds = fullKinds(ctx);
        doraHan = countDora(kinds, ctx.doraKinds ?? []);
        // 뒷도라는 원래 리치한 손만의 보상이다 — uraAlways(숨은 칼날)가 그 문을 연다
        uraHan =
          ctx.riichi !== null || ctx.uraAlways === true
            ? countDora(kinds, ctx.uraDoraKinds ?? [])
            : 0;
        redHan = ctx.redCount ?? 0;
      }
      candidate = {
        ok: hasRealYaku,
        yakumanCount: 0,
        yaku: applied,
        yakuHan,
        doraHan,
        uraHan,
        redHan,
        han: yakuHan + doraHan + uraHan + redHan,
        fu,
        waitType: variant.waitType,
        variant,
      };
    }

    best = better(best, candidate);
  }

  if (best === null) return null;
  const { variant: _variant, ...evaluation } = best;
  return evaluation;
}
