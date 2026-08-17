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
import { winShapeOf } from "./winShape.js";
import type { WinShape } from "./winShape.js";
import type { YakuDef, YakuRegistry } from "./YakuRegistry.js";

export interface YakuResult {
  id: string;
  name: string;
  han: number;
}

export interface WinEvaluation {
  /** 역이 1개 이상인가 (false = 형태는 화료지만 역 없음 → 화료 불가) */
  ok: boolean;
  /** 역만 배수의 합 (복합 합산 + 더블 역만의 배수). 0 = 역만 아님 */
  yakumanCount: number;
  yaku: YakuResult[];
  /** 역만이면 0 (역만은 판을 세지 않는다) */
  yakuHan: number;
  doraHan: number;
  uraHan: number;
  redHan: number;
  /**
   * 표·뒷도라 판수 중 **증강이 얹은 개인 도라에서 온 몫** (표시 전용, doraHan/uraHan에 포함).
   * 화면에 뜬 표시패로 설명되지 않는 판수의 출처가 여기다.
   */
  augDoraHan: number;
  /** yakuHan + 도라 계 */
  han: number;
  fu: number;
  waitType: WaitType;
  /**
   * 채택된 변형의 **몸통 구성** (표시 전용). 결과 화면이 화료한 손을 몸통 단위로
   * 끊어 보여 주는 근거 — 증강으로 모양 규칙이 바뀐 손은 정렬만 해서는 왜 화료인지
   * 읽을 수 없다. 손패로 복원이 안 되면 없다.
   */
  shape?: WinShape;
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
  // 무장해제된 증강이 등록한 커스텀 역은 성립하지 않는다 (표준 역은 source가 없어 무관)
  const disarmed =
    ctx.disarmedSources !== undefined && ctx.disarmedSources.length > 0
      ? new Set(ctx.disarmedSources)
      : null;

  for (const variant of variants) {
    const matched: YakuResult[] = [];
    let yakumanCount = 0;

    for (const def of registry.all()) {
      if (blocked !== null && blocked.has(def.id)) continue;
      if (disarmed !== null && def.source !== undefined && isYakuDisarmed(def, ctx, disarmed)) {
        continue;
      }
      const han = variant.isClosed ? def.closedHan : def.openHan;
      if (han === null) continue;
      if (!def.check(variant, ctx)) continue;
      if (def.isYakuman === true) {
        // 더블 역만(대사희·국사 13면)은 한 역이 2를 더한다 — 복합 합산과 같은 축이다
        yakumanCount += Math.max(1, def.yakumanMultiplier ?? 1);
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
        augDoraHan: 0,
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
      /*
       * 판만 더하는 것들(도라·적도라·뒷도라·보조역)이 붙는가.
       *
       * 표준 룰에서 이것들이 실역 없이는 안 붙는 이유는 "역이 없으면 그 손은 애초에
       * 화료가 아니다"이지, 도라가 특별히 까다로워서가 아니다. 무형화료 계열이
       * `win.requiresYaku`를 끄면 그 전제가 사라진다 — 화료는 성립하는데 도라만
       * 통째로 증발해, 붉은손길로 물들인 적도라를 쥐고도 0판 30부로 정산됐다
       * (2026-08-17 사용자 보고). 화료가 성립하는 자리에서는 다 센다.
       */
      const countsExtras = hasRealYaku || ctx.requiresYaku === false;
      const applied = countsExtras
        ? matched
        : matched.filter((y) => registry.get(y.id)?.auxiliary !== true);
      const yakuHan = applied.reduce((sum, y) => sum + y.han, 0);
      const hasPinfu = applied.some((y) => y.id === "pinfu");
      const fu = calculateFu(variant, ctx, hasPinfu);
      let doraHan = 0;
      let uraHan = 0;
      let redHan = 0;
      let augDoraHan = 0;
      if (countsExtras) {
        const kinds = fullKinds(ctx);
        const dora = ctx.doraKinds ?? [];
        const ura = ctx.uraDoraKinds ?? [];
        doraHan = countDora(kinds, dora);
        // 뒷도라는 원래 리치한 손만의 보상이다 — uraAlways(숨은 칼날)가 그 문을 연다
        const countsUra = ctx.riichi !== null || ctx.uraAlways === true;
        uraHan = countsUra ? countDora(kinds, ura) : 0;
        redHan = ctx.redCount ?? 0;
        // 표준분만 따로 한 번 더 세어 차이를 증강 몫으로 돌린다 (경계를 모르면 0).
        const stdDora = ctx.standardDoraCount ?? dora.length;
        const stdUra = ctx.standardUraCount ?? ura.length;
        augDoraHan =
          doraHan -
          countDora(kinds, dora.slice(0, stdDora)) +
          (countsUra ? uraHan - countDora(kinds, ura.slice(0, stdUra)) : 0);
      }
      candidate = {
        ok: hasRealYaku,
        yakumanCount: 0,
        yaku: applied,
        yakuHan,
        doraHan,
        uraHan,
        augDoraHan,
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
  const { variant, ...evaluation } = best;
  // 채택된 변형의 몸통 구성 — 결과 화면이 "어떻게 화료가 됐는지"를 그리는 근거다.
  // 채점에는 쓰지 않는다(표시 전용).
  const shape = winShapeOf(variant, ctx);
  return shape === null ? evaluation : { ...evaluation, shape };
}

/**
 * 이 화료자에게 이 커스텀 역이 잠겨 있는가.
 *
 * 커스텀 역은 게임당 한 번만 등록되므로 `def.source`는 **먼저 설치된 보유자**의
 * 인스턴스 id(`aug:{설치자}:{증강id}`)로 고정된다. 그런데 같은 증강을 두 명이
 * 가질 수 있어서, 그대로 대조하면 무장해제가 엉뚱하게 걸렸다 — 설치자를 잠그면
 * **다른 보유자의 역까지** 사라지고, 다른 보유자를 잠그면 **아무 일도 안 났다**
 * (docs/25 최우선#3, 감사 4개 팀이 독립 확인).
 *
 * 봐야 하는 것은 "이 화료자의 그 증강이 잠겼는가"다. 그래서 source에서 증강 id만
 * 떼어 내 화료자의 인스턴스 id로 다시 만들어 대조한다. 보유자가 한 명뿐인
 * 일반적인 경우에는 둘이 같은 값이라 동작이 달라지지 않는다.
 */
function isYakuDisarmed(
  def: YakuDef,
  ctx: WinContext,
  disarmed: ReadonlySet<string>,
): boolean {
  const source = def.source as string;
  if (ctx.winnerId === undefined) return disarmed.has(source);
  // `aug:{holder}:{augmentId}` — 증강 id에 콜론이 있을 수 있어 앞 두 조각만 떼어 낸다
  const parts = source.split(":");
  if (parts.length < 3 || parts[0] !== "aug") return disarmed.has(source);
  const augmentId = parts.slice(2).join(":");
  return disarmed.has(`aug:${ctx.winnerId}:${augmentId}`);
}
