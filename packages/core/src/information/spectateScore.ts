/**
 * 관전(중계) 좌석값 — **판이 실제로 쓰는 채점기로** 잰 확정 타점.
 *
 * ## 왜 이 파일이 생겼나
 * 예전 중계 패널은 봇의 의사결정용 값어치 모형(`server/bot/value.ts`)을 그대로 화면에
 * 찍었다. 그 모형은 만관 경계에서 봇의 판단이 요동치지 않도록 **일부러** 판수를
 * 연속값으로 두고(리치 2.2판·부수 36부) 점수표 두 칸을 보간한다. 봇에게는 옳은 설계지만
 * 화면에는 「3.2판 4660점」처럼 **마작에 존재할 수 없는 숫자**가 나온다. 해설이 읽는
 * 숫자다.
 *
 * 저장소 안에 이미 정답이 있었다 — 실제 화료 정산이 쓰는 `buildWinContext` →
 * `evaluateWin` → `calculateScore` 경로다. 그 경로를 타면 쿠이사가리·역없음·
 * 「도라는 역이 있어야 센다」·좌석별 증강(`scoring.*`/`win.*`/분해 옵션)이 **전부
 * 자동으로** 맞는다. 별도 근사식을 화면용으로 하나 더 두면 그 순간부터 두 숫자가
 * 조용히 갈라지고, 어느 쪽이 거짓말인지 아무도 모른다.
 *
 * ## core에 두는 이유
 * `buildWinContext`·`evaluateWin`은 core의 것이고, core는 server를 import할 수 없다.
 * 그래서 **텐파이 확정값·샹텐·도라·배패 점수**까지가 여기 몫이고, 노텐 좌석의
 * «추정» 타점은 봇 모형을 쥐고 있는 서버(`server/src/spectateInsight.ts`)가 얹는다.
 *
 * ## 성능 (실측 2026-08-23, Apple Silicon / node 22 · 캐시 우회 20회 평균)
 * 4좌석 × 대기 최대 6종 × 2(론·쯔모) = 최대 48회 `evaluateWin`.
 *
 *   - 표준 손 4좌석 전원 텐파이 — **1.0~1.8ms**
 *   - 국사 13면 3.1 / `royal_kokushi` 3.7 / `open_kokushi` 4.1 / `async_chiitoi` 4.2
 *   - 만능패(`scoring.wildKinds`) 6.1 / 14장 다면장 6.4 / 부숴진 벽(`wrapRuns`) 7.9
 *   - 실전에서 볼 만한 최악(검수 독립 실측) — **13.2ms**
 *   - **합성 최악** = 4좌석 전부 14장 구련보등형 + 만능패 + 부숴진 벽 — **24~25ms**
 *
 * 즉 **「언제나 5ms 안」은 사실이 아니다.** 「이게 최악이다」를 두 번 틀린 뒤로는
 * 손을 골라 재지 않고 **상한을 추정해서 그 손을 짓는다**: 좌석 4 × 버림 후보(14장이면
 * 최대 13) × 대기 폭(표준 최대는 구련보등 9면, 분해를 넓히는 증강이 그 위에 더 얹는다).
 * 시간의 출처는 `evaluateWin` 20.7 / 대기 계산 6.3 / 샹텐 0.5ms — **비싼 것은 채점
 * 자체**다. 판을 죽일 수준은 아니라 그대로 둔다: 관전자가 없으면 아예 돌지 않고,
 * 있어도 브로드캐스트 한 번에 한 번이며, 네 좌석이 동시에 그 조건일 확률은 사실상 0이다.
 *
 * ⚠ 캐시는 상태 **와 규칙 세대**를 함께 본다. 「상태 객체가 곧 완벽한 캐시 키」
 * (`helpers.ts §7-5`)는 관전 채점에는 **틀리다** — `SEAT_SCORE_CACHE` 주석 참고.
 * 관전자가 하나도 없으면 호출부(`HanchanController.broadcastViews`)가 아예 부르지 않는다.
 */

import { discardsZone, handZone, meldsZone } from "../engine/zones/Zone.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import type { GameState } from "../engine/state/GameState.js";
import type { RuleRegistry } from "../engine/rules/RuleRegistry.js";
import { kindKey, standardKinds } from "../mahjong/tiles/Tile.js";
import type { TileId, TileKind } from "../mahjong/tiles/Tile.js";
import { doraKindFor } from "../mahjong/scoring/dora.js";
import { winningKinds } from "../mahjong/scoring/waits.js";
import { shantenOf } from "../mahjong/scoring/shanten.js";
import { evaluateWin } from "../mahjong/scoring/evaluate.js";
import { calculateScore } from "../mahjong/scoring/score.js";
import type { YakuRegistry } from "../mahjong/scoring/YakuRegistry.js";
import type { WinInfo } from "../mahjong/flow/flowEvents.js";
import type { DecomposeOptions } from "../mahjong/scoring/decompose.js";
import {
  handIdsOf,
  handKindsOf,
  meldCountOf,
  openMeldCountOf,
  isFuriten,
  outsideHandTileFinder,
  requiresYakuFor,
  scoringOptionsOf,
  winHandIdsOf,
  winHandKindsOf,
  buildWinContext,
} from "../mahjong/flow/helpers.js";
import type { SpectateWait, SpectateWinValue } from "../network/protocol.js";

/**
 * 한 좌석의 관전값. `SpectateInsightMessage["seats"]` 중 **코어가 확정으로 낼 수 있는**
 * 부분이다 — 노텐 추정(`estimate`)과 옛 화면 호환 필드는 서버가 얹는다.
 */
export interface SpectateSeatScore {
  id: PlayerId;
  shanten: number;
  meldCount: number;
  menzen: boolean;
  dora: number;
  best?: SpectateWinValue;
  waits?: SpectateWait[];
  yakuless?: boolean;
  belowMinHan?: boolean;
  furiten?: boolean;
  handGrade?: number;
  /** 손패가 통째로 바뀌어 배패 점수를 다시 쟀다 (교환 증강) */
  handGradeRegraded?: boolean;
}

/** 코어 `LimitName` → 프로토콜 `limit` (셈수 역만 이름만 짧게 간다) */
function limitName(limit: string | null): SpectateWinValue["limit"] {
  if (limit === null) return undefined;
  if (limit === "kazoe_yakuman") return "kazoe";
  return limit as SpectateWinValue["limit"];
}

/**
 * 보이는 모든 곳(**네 좌석 손패** + 전원 버림 + 전원 후로 + 도라 표시패)에서
 * 종류별로 몇 장이 보였는지 센다.
 *
 * 관전자는 네 사람의 손패를 전부 본다 — 그러니 남은 장수도 관전자가 아는 만큼
 * 정확해야 한다. 대국자 시점의 셈(`server/bot/danger.ts`)을 그대로 쓰면 남의 손에
 * 든 오름패를 «아직 산에 있다»고 세어 대기의 값을 과대평가한다.
 *
 * ⚠ 증강 생성패(`attrs.conjured`)는 세지 않는다 — 증강은 «없던 패를 준다»를 기존
 * 타일의 kind를 덮어쓰는 방식으로 구현하므로 같은 종류가 5장 넘게 존재할 수 있다
 * (`bot/danger.ts:126` 과 같은 규약).
 */
function seenCounts(state: GameState): Map<string, number> {
  const seen = new Map<string, number>();
  const bump = (id: TileId): void => {
    const tile = state.tiles[id];
    if (tile === undefined) return;
    if (tile.attrs.conjured === true) return;
    const key = kindKey(tile.kind);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  };
  const countZone = (zoneId: string): void => {
    for (const id of state.zones[zoneId]?.tileIds ?? []) bump(id);
  };
  for (const p of state.players) {
    countZone(handZone(p.id));
    countZone(discardsZone(p.id));
    countZone(meldsZone(p.id));
  }
  for (const id of state.round.doraIndicators) bump(id);
  return seen;
}

/** 이 국의 도라 종류 (표도라만 — 뒷도라는 화료 순간에야 열린다) */
function doraKindsOf(state: GameState): TileKind[] {
  const out: TileKind[] = [];
  for (const id of state.round.doraIndicators) {
    const tile = state.tiles[id];
    if (tile !== undefined) out.push(doraKindFor(tile.kind));
  }
  return out;
}

/** 증강이 이 좌석에만 얹는 개인 도라 종류 (`scoring.extraDoraKinds`) */
function extraDoraKindsOf(
  state: GameState,
  rules: RuleRegistry,
  id: PlayerId,
): TileKind[] {
  if (!rules.has("scoring.extraDoraKinds")) return [];
  const kinds = rules.resolve<readonly TileKind[]>("scoring.extraDoraKinds", {
    playerId: id,
    state,
  });
  return Array.isArray(kinds) ? [...kinds] : [];
}

/**
 * **한 장 버린 뒤의 최선 샹텐** — 14장(3n+2) 시점의 옳은 셈 (docs/36:101).
 *
 * 서버에 있던 `bestShanten`과 **같은 셈**이다(같은 종류는 한 번만 시도). 좌석 뱃지와
 * 패널이 다른 셈을 쓰면 같은 화면 안에서 두 숫자가 갈린다.
 *
 * @returns `[샹텐, 그 값을 내는 버림 후보 tileId 목록]` — 텐파이 대기를 낼 때
 *          «어느 장을 버린 뒤의 텐파이인가»가 필요해서 후보까지 함께 돌려준다.
 */
function bestShanten(
  state: GameState,
  ids: readonly TileId[],
  kinds: readonly TileKind[],
  meldCount: number,
  options: DecomposeOptions,
): { shanten: number; drops: TileId[] } {
  if (kinds.length % 3 !== 2) {
    return { shanten: shantenOf(kinds, meldCount, options), drops: [] };
  }
  let best = Number.POSITIVE_INFINITY;
  const byKey = new Map<string, number>();
  const drops: TileId[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const key = kindKey(kinds[i]!);
    let s = byKey.get(key);
    if (s === undefined) {
      s = shantenOf(
        kinds.filter((_, j) => j !== i),
        meldCount,
        options,
      );
      byKey.set(key, s);
    }
    if (s < best) {
      best = s;
      drops.length = 0;
    }
    if (s === best) {
      const id = ids[i];
      if (id !== undefined) drops.push(id);
    }
  }
  if (!Number.isFinite(best)) {
    return { shanten: shantenOf(kinds.slice(0, -1), meldCount, options), drops: [] };
  }
  return { shanten: best, drops };
}

/**
 * 14장 시점에 «그 한 장을 버린» 상태를 만든다.
 *
 * `buildWinContext`는 `winHandIdsOf`(실손패)를 읽으므로, 버릴 패가 손에 남아 있으면
 * 그 패까지 낀 15장을 채점하려 들어 분해가 통째로 실패한다. 손패 존만 갈아 끼운
 * **얕은 사본**을 넘긴다 — 원본 상태는 건드리지 않는다(엔진의 불변 규약).
 *
 * 자유 선언(`hand.winTileIds` 스냅샷)이 걸린 좌석은 애초에 채점 손패가 13장이라
 * 이 경로를 타지 않는다.
 */
function stateWithoutTile(state: GameState, id: PlayerId, drop: TileId): GameState {
  const zoneId = handZone(id);
  const zone = state.zones[zoneId];
  if (zone === undefined) return state;
  return {
    ...state,
    zones: {
      ...state.zones,
      [zoneId]: { ...zone, tileIds: zone.tileIds.filter((t) => t !== drop) },
    },
  };
}

/**
 * 대기 하나의 평가 결과.
 *
 * 「값이 없다」를 `null` 하나로 뭉개면 **왜 없는지**가 사라진다 — 역이 없어서인지
 * (`yaku`) 격에 못 미쳐서인지(`minHan`)는 화면에 다른 말로 적어야 하는 다른 사실이다
 * (전자는 손을 바꿔야 하고 후자는 손을 키우면 열린다).
 */
type WaitEval =
  | { value: SpectateWinValue }
  | { value: null; blocked: "yaku" | "minHan" };

/**
 * 대기 하나를 **실제 채점기로** 평가한다.
 *
 * ⚠ 여기 붙는 계산은 전부 정산기(`standardActions.ts`의 `sysSettleWin`·`belowMinHan`)와
 * **같은 규약이어야 한다.** `evaluateWin`은 판·부까지만 안다 — 증강이 얹는 추가 판
 * (`score.extraHan`), 오야 취급(`win.treatAsDealer`), 격 게이트(`win.minHan`)는 전부
 * 정산기 쪽에만 있다. 한 글자라도 갈리면 「화면 3판 5,800점 / 실제 6판」처럼 **화면과
 * 정산이 갈리는** 상태가 그대로 돌아온다 (2026-08-23 QA 실측).
 *
 * 아직 못 따라가는 것 하나: `ROUND_SETTLED` **인터셉터**로 점수를 얹는 증강
 * (`standardAugments.addWinHanBonus` · content의 `withAugPoint` 계열)은 채점이 끝난
 * 뒤의 `deltas`를 고치므로 여기서 재현할 수 없다 — 그 좌석의 실제 수령액은 여기 값보다
 * 높을 수 있다. 결과 화면도 같은 층위(`info.points` + "증강 +N판" 한 줄)로 보여 주므로
 * 「채점된 값」이라는 뜻은 어긋나지 않지만, 최종 수령액과는 다르다.
 */
function evalWait(
  state: GameState,
  rules: RuleRegistry,
  yaku: YakuRegistry,
  id: PlayerId,
  tileId: TileId,
  winType: "tsumo" | "ron",
  isDealer: boolean,
  needYaku: boolean,
  riichi: boolean,
  /** 이 좌석에 «관전 시점에 계산할 수 없는» 정산 보정이 남아 있는가 */
  augAdjusted: boolean,
): WaitEval | null {
  const ev = evaluateWin(buildWinContext(state, id, winType, tileId, { rules }), yaku);
  if (ev === null) return null; // 화료형이 아니다 — 「막혔다」가 아니라 애초에 대기가 아니다
  // 역이 필요 없는 좌석(무형화료 계열 증강)에는 «역없음»이라는 상태가 없다 —
  // 그 손은 그냥 화료한다. `ok:false`를 막으면 증강이 열어 준 길을 화면이 닫는다.
  if (!ev.ok && needYaku) return { value: null, blocked: "yaku" };

  /*
   * 증강이 더하는 추가 판 (`score.extraHan`) — **역만에는 붙지 않는다**.
   * `sysSettleWin`(standardActions.ts:928-943)의 규약을 그대로 옮긴 것이다:
   * 역만이면 0, 아니면 `Math.max(0, 합계)`. content의 5종(리치 강화·절벽의 꽃·
   * 배수의 진·안깡 도라·북 장사꾼)이 이 훅을 쓴다.
   */
  const extraHan =
    ev.yakumanCount > 0 || !rules.has("score.extraHan")
      ? 0
      : Math.max(0, rules.resolve<number>("score.extraHan", { playerId: id, state }));
  const totalHan = ev.han + extraHan;

  /*
   * 격(`win.minHan` — rank_gate)에 못 미치면 **론 자체가 거부된다**
   * (`WIN_BLOCKED_MIN_HAN`). `belowMinHan`(standardActions.ts:149-163)과 같은 규약:
   * 역만 면제 · 추가 판을 합산한 뒤 비교. 이걸 안 보면 화면은 「2판 2,900점」이라
   * 적는데 실제로는 그 대기로 화료할 수 없다.
   */
  if (ev.yakumanCount === 0 && rules.has("win.minHan")) {
    const min = rules.resolve<number>("win.minHan", { playerId: id, state });
    if (min > 0 && totalHan < min) return { value: null, blocked: "minHan" };
  }

  /*
   * 오야 취급 (`win.treatAsDealer`) — 점수 계산만 오야다(연장은 실제 오야만).
   * `sysSettleWin`(standardActions.ts:921-927)과 같다. 안 보면 자 좌석의 만관이
   * 화면 3,900 / 정산 5,800으로 갈린다.
   */
  const scoresAsDealer =
    isDealer ||
    (rules.has("win.treatAsDealer") &&
      rules.resolve<boolean>("win.treatAsDealer", { playerId: id, state }));

  /*
   * **정산 시점에 얹히는 보너스 판** (`score.settleHanBonus` — `addWinHanBonus` 계열).
   *
   * 이건 `calculateScore`에 안 들어가는 판이라 예전에는 관전값에서 통째로 빠졌다.
   * 무형화료 좌석의 형식텐파이가 화면 「0판 500점」, 실제 수령 2,000점 — **4배** 틀렸다
   * (2026-08-23 검수 실측). 표식(`noYaku`)이 뜻은 붙여 줬지만 숫자가 틀린 것은 그대로였고,
   * 하필 그 표식이 붙는 대표 사례가 정확히 이 증강이었다.
   *
   * 증강이 같은 함수를 규칙으로도 내놓게 해서(standardAugments.ts `addWinHanBonus`)
   * 여기서 **질의**한다 — 인터셉터를 부작용 없이 태울 방법은 없다. 규칙은 정산 시점의
   * 화료 한 건을 봐야 하므로 지금 재고 있는 가상 화료를 `winInfo`로 실어 보낸다.
   *
   * ⚠ 격(`win.minHan`) 판정에는 **넣지 않는다.** 정산기의 `belowMinHan`도 `score.extraHan`만
   * 세기 때문이다 — 여기만 더 세면 「화면은 되는데 실제로는 거부」가 반대 방향으로 생긴다.
   */
  let augHan = 0;
  if (rules.has("score.settleHanBonus")) {
    const info: WinInfo = {
      winner: id,
      // 누가 쐈는지는 «아직 안 일어난 화료»라 알 수 없다. 보너스 함수들은 이 값을
      // 보지 않는다(보면 그 증강은 이 창구로 질의할 수 없다는 뜻이다).
      from: null,
      winType,
      winningTileId: tileId,
      han: totalHan,
      fu: ev.fu,
      yakumanCount: ev.yakumanCount,
      extraHan,
      yaku: ev.yaku.map((y) => ({ id: y.id, name: y.name, han: y.han })),
      doraHan: ev.doraHan,
      uraHan: ev.uraHan,
      redHan: ev.redHan,
      yakuless: !ev.ok,
      points: 0, // 보너스 함수는 판수만 본다 — 점수 차액 계산은 인터셉터 쪽 몫이다
      limit: null,
    };
    augHan = Math.max(
      0,
      rules.resolve<number>("score.settleHanBonus", { playerId: id, state, winInfo: info }),
    );
  }
  const paidHan = totalHan + augHan;

  const uncapped =
    rules.has("score.uncapped") &&
    rules.resolve<boolean>("score.uncapped", { playerId: id, state });
  const score = calculateScore({
    han: paidHan,
    fu: ev.fu,
    yakumanCount: ev.yakumanCount,
    isDealer: scoresAsDealer,
    winType,
    ...(uncapped ? { uncapped: true } : {}),
  });
  /*
   * **상한 이름은 상한을 씌운 계산에서 가져온다** (`score.uncapped` 규약 불일치, 검수 N4).
   *
   * 뚫린 천장 좌석에서 `calculateScore({uncapped:true})`는 `limit`을 안 매긴다. 그런데
   * 정산기(`sysSettleWin`)는 **상한을 씌운 채** 채점하고 `aotenjou_ceiling`이 사후에
   * 차액을 얹으므로, 결과 화면의 이름은 「만관 + 증강」이다. 총액은 같은데 이름만 두
   * 층에서 갈리면 화면이 「하네만」이라 적고 결과 화면은 「만관」이라 적는다.
   * 총액은 뚫린 값, 이름은 정산기와 같은 값 — 두 층이 같은 말을 하게 맞춘다.
   */
  const named = uncapped
    ? calculateScore({
        han: paidHan,
        fu: ev.fu,
        yakumanCount: ev.yakumanCount,
        isDealer: scoresAsDealer,
        winType,
      })
    : score;
  const limit = limitName(named.limit);
  return {
    value: {
      han: paidHan,
      fu: ev.fu,
      points: score.total,
      yakumanCount: ev.yakumanCount,
      ...(limit !== undefined ? { limit } : {}),
      yaku: ev.yaku.map((y) => ({ name: y.name, han: y.han })),
      doraHan: ev.doraHan,
      redHan: ev.redHan,
      uraHan: ev.uraHan,
      ...(augHan > 0 ? { augHan } : {}),
      // 뒷도라는 화료 순간에야 열린다 — 관전 시점에 세면 스포일러다. 리치 좌석에는
      // 「이 값은 하한이다」를 표식으로 남긴다 (protocol.ts `uraUnknown` 주석).
      ...(riichi ? { uraUnknown: true as const } : {}),
      // 실역 0개로 성립한 화료. 정산기도 여기까지는 같은 값을 채점하고, 그 위에
      // 무형화료의 +2판이 `augHan`으로 얹혀 실제 수령액이 된다.
      ...(!ev.ok ? { noYaku: true as const } : {}),
      // 아직 못 따라가는 정산 보정이 남아 있다 — 화면은 이 숫자를 단정하면 안 된다.
      ...(augAdjusted ? { augAdjusted: true as const } : {}),
    },
  };
}

/** 「어느 대기가 제일 비싼가」 — 점수 우선, 같으면 판수 */
function richer(a: SpectateWinValue | null, b: SpectateWinValue | null): SpectateWinValue | null {
  if (a === null) return b;
  if (b === null) return a;
  if (a.points !== b.points) return a.points > b.points ? a : b;
  return a.han >= b.han ? a : b;
}

/**
 * 상태 단위 캐시.
 *
 * ⚠ **상태만으로는 부족하다** (2026-08-23 QA 실측). `helpers.ts §7-5`가 적은
 * 「상태 객체가 곧 완벽한 캐시 키」는 «상태가 바뀌면 값이 바뀐다»만 말하지
 * «값이 바뀌면 상태가 바뀐다»는 말하지 않는다. 국 사이 드래프트에서
 * `installAugment`는 **`GameState`를 갈지 않고 `RuleRegistry`만 바꾼다** —
 * 루프가 돌아와 같은 상태 객체로 `broadcastViews`를 부르면 **드래프트 이전 규칙으로
 * 계산된 패널**이 그대로 나갔다.
 *
 * 그래서 규칙 세대(`rules.version`)와 역 개수까지 키에 섞는다. 역 개수를 함께 보는
 * 이유는 증강이 커스텀 역을 등록할 수 있기 때문이다(레지스트리 객체는 그대로다).
 */
const SEAT_SCORE_CACHE = new WeakMap<
  GameState,
  { key: string; scores: SpectateSeatScore[] }
>();

/**
 * 관전 보조값의 **좌석 부분**을 만든다.
 *
 * @param handGrades 배패 점수 (국 시작 때 한 번 재서 국 내내 고정된 값)
 */
export function buildSpectateSeatScores(
  state: GameState,
  rules: RuleRegistry,
  yaku: YakuRegistry,
  handGrades: Readonly<Record<string, number>> = {},
  /**
   * 이 좌석에 **관전 시점에 계산할 수 없는 정산 보정**이 남아 있는가.
   * 호출부(`HanchanController`)가 엔진의 `ROUND_SETTLED` 인터셉터 목록과
   * `score.settleHanBonus` 질의 창구를 대조해 만든다 — 이 파일은 엔진을 모른다.
   */
  augAdjustedFor: (id: PlayerId) => boolean = () => false,
  /**
   * 이 좌석의 배패 점수가 **국 도중에 다시 매겨졌는가** (손패 교환 증강).
   * 숫자가 움직인 이유를 화면이 한 줄로 말할 수 있게 하려는 표식이다.
   */
  handGradeRegraded: Readonly<Record<string, boolean>> = {},
): SpectateSeatScore[] {
  const cacheKey = `${rules.version}|${yaku.all().length}`;
  const cached = SEAT_SCORE_CACHE.get(state);
  if (cached !== undefined && cached.key === cacheKey) {
    /*
     * 배패 점수는 캐시 **바깥**에서 매번 다시 얹는다 (검수 N3).
     *
     * 예전에는 「있으면 덮는다」였다 — 그러니 넘어온 값이 **비었을 때** 캐시에 남아 있던
     * 지난 값이 그대로 나갔다. 라이브에서는 국이 끝날 때 상태 객체가 갈려 안 터졌지만,
     * `rules.version`도 상태도 그대로인 경로가 생기면 지난 국의 배패 점수가 샌다.
     * 「지금 안 터진다」는 안전하다는 뜻이 아니다.
     */
    return cached.scores.map((s) => {
      const grade = handGrades[s.id];
      if (grade === undefined) {
        if (s.handGrade === undefined && s.handGradeRegraded === undefined) return s;
        const { handGrade: _drop, handGradeRegraded: _drop2, ...rest } = s;
        return rest;
      }
      const regraded = handGradeRegraded[s.id] === true;
      if (s.handGrade === grade && (s.handGradeRegraded === true) === regraded) return s;
      const { handGradeRegraded: _old, ...base } = s;
      return { ...base, handGrade: grade, ...(regraded ? { handGradeRegraded: true } : {}) };
    });
  }

  const seen = seenCounts(state);
  const doraKinds = doraKindsOf(state);
  const universe = standardKinds();
  const out: SpectateSeatScore[] = [];

  for (const p of state.players) {
    const handIds = handIdsOf(state, p.id);
    if (handIds.length === 0) continue; // 배패 전 — 잴 것이 없다
    const meldIds = (state.round.byPlayer[p.id]?.melds ?? []).flatMap((m) => m.tileIds);
    const opts = scoringOptionsOf(state, rules, p.id);
    const meldCount = meldCountOf(state, p.id);
    // 안깡·묵계(silent)는 손을 열지 않는다 (helpers.ts:757 규약) — 리치·멘젠쯔모·
    // 우라도라가 그대로 살아 있으므로 점수상 멘젠이다.
    const menzen = openMeldCountOf(state, p.id) === 0;
    const isDealer = p.seat === state.round.dealerSeat;

    // 도라 — 표도라 + 적도라 + 그 좌석만의 개인 도라
    const doraSet = new Map<string, number>();
    for (const k of [...doraKinds, ...extraDoraKindsOf(state, rules, p.id)]) {
      doraSet.set(kindKey(k), (doraSet.get(kindKey(k)) ?? 0) + 1);
    }
    let dora = 0;
    for (const tid of [...handIds, ...meldIds]) {
      const tile = state.tiles[tid];
      if (tile === undefined) continue;
      dora += doraSet.get(kindKey(tile.kind)) ?? 0;
      if (tile.attrs.red === true) dora++;
    }

    // 샹텐 — 14장이면 한 장 버린 뒤의 최선
    const handKinds = handKindsOf(state, p.id);
      const { shanten, drops } = bestShanten(state, handIds, handKinds, meldCount, opts);

    const seat: SpectateSeatScore = {
      id: p.id,
      shanten,
      meldCount,
      menzen,
      dora,
      ...(handGrades[p.id] !== undefined ? { handGrade: handGrades[p.id]! } : {}),
      ...(handGrades[p.id] !== undefined && handGradeRegraded[p.id] === true
        ? { handGradeRegraded: true as const }
        : {}),
    };

    if (shanten <= 0) {
      /*
       * 채점 손패가 14장(3n+2)이면 **어느 장을 버린 뒤의 텐파이인가**를 정해야 한다.
       * 텐파이를 만드는 버림이 여럿이면 오름패 총 장수가 가장 많은 쪽을 고른다 —
       * 화면에 한 줄만 적을 수 있으니, 사람이 실제로 고를 법한(=제일 넓은) 대기를
       * 대표로 보여 주는 것이 덜 놀랍다.
       */
      const winIds = winHandIdsOf(state, rules, p.id);
      let evalState = state;
      let waitKinds: TileKind[] = [];
      if (winIds.length % 3 === 2 && drops.length > 0) {
        let bestWidth = -1;
        for (const drop of drops) {
          const s = stateWithoutTile(state, p.id, drop);
          const w = winningKinds(
            winHandKindsOf(s, rules, p.id),
            meldCount,
            universe,
            opts,
          );
          if (w.length === 0) continue;
          let width = 0;
          for (const k of w) width += Math.max(0, 4 - (seen.get(kindKey(k)) ?? 0));
          if (width > bestWidth) {
            bestWidth = width;
            evalState = s;
            waitKinds = w;
          }
        }
      } else {
        waitKinds = winningKinds(
          winHandKindsOf(state, rules, p.id),
          meldCount,
          universe,
          opts,
        );
      }

      if (waitKinds.length > 0) {
        const needYaku = requiresYakuFor(evalState, p.id, rules);
        const riichi = state.round.byPlayer[p.id]?.riichi != null;
        /*
         * **후리텐이면 론이 막힌다** — 그 좌석의 카드에 론 값을 대표로 적으면 도달할
         * 수 없는 숫자를 「지금 화료하면 얼마」라고 적는 것이다. 14장 시점이면
         * `evalState`(한 장 버린 뒤)로 재야 그 버림 이후의 사실이 나온다.
         */
        const furiten = isFuriten(evalState, p.id, opts, rules);
        const adjusted = augAdjustedFor(p.id);
        const outside = outsideHandTileFinder(evalState, rules, p.id);
        const waits: SpectateWait[] = [];
        let bestRon: SpectateWinValue | null = null;
        let bestTsumo: SpectateWinValue | null = null;
        // 「막혔다」의 사유 — 전부 막혔을 때 화면에 무엇이라 적을지가 여기서 갈린다.
        let sawYakuBlock = false;
        let sawMinHanBlock = false;
        for (const kind of waitKinds) {
          const tileId = outside(kind);
          if (tileId === undefined) continue; // 그 종류 실물이 상태에 없다(방어적)
          const ron = evalWait(
            evalState, rules, yaku, p.id, tileId, "ron", isDealer, needYaku, riichi, adjusted,
          );
          const tsumo = evalWait(
            evalState, rules, yaku, p.id, tileId, "tsumo", isDealer, needYaku, riichi, adjusted,
          );
          for (const r of [ron, tsumo]) {
            if (r === null || r.value !== null) continue;
            if (r.blocked === "minHan") sawMinHanBlock = true;
            else sawYakuBlock = true;
          }
          waits.push({
            kind: kindKey(kind),
            remaining: Math.max(0, 4 - (seen.get(kindKey(kind)) ?? 0)),
            ron: ron?.value ?? null,
            tsumo: tsumo?.value ?? null,
          });
          bestRon = richer(bestRon, ron?.value ?? null);
          bestTsumo = richer(bestTsumo, tsumo?.value ?? null);
        }
        if (waits.length > 0) {
          seat.waits = waits;
          if (furiten) seat.furiten = true;
          // 후리텐이면 론은 못 한다 — 대표값은 쯔모 쪽이다.
          const best = furiten ? bestTsumo : (bestRon ?? bestTsumo);
          if (best !== null) seat.best = best;
          else if (sawMinHanBlock) {
            /*
             * 역은 있는데 격(`win.minHan`)에 못 미쳐 막혔다 — 「역없음」과 다른 사실이다.
             *
             * ⚠ 예전에는 `sawMinHanBlock && !sawYakuBlock`을 요구했다. 그래서 **론에는
             * 역이 없고 쯔모에만 있는 손**(멘젠쯔모만 서는 손)이 두 사유를 동시에 내면
             * 「역없음」으로 떨어졌다 — 형식텐파이가 아닌데 그렇게 적혔다(검수 N2 실측:
             * `234m345p678p234s55z` + `minHan=5`). 격에 한 번이라도 걸렸다면 그 손에는
             * 역이 있다는 뜻이므로, 「역없음」이 아니라 「격 미달」이 맞다.
             */
            seat.belowMinHan = true;
          } else if (needYaku && sawYakuBlock) {
            // 텐파이인데 어떤 오름패로도 역이 없다 = 형식텐파이. 역이 필요 없는
            // 좌석에는 이 상태 자체가 없다(위 `needYaku`와 같은 이유).
            seat.yakuless = true;
          }
        }
      }
    }

    out.push(seat);
  }

  SEAT_SCORE_CACHE.set(state, { key: cacheKey, scores: out });
  return out;
}

// ─────────────────────────── 배패 점수 ───────────────────────────

/**
 * **배패 점수 0~100** — 이 국에 받은 첫 13장이 얼마나 좋은 패였나.
 *
 * 「타점이 높을수록, 빠를수록 높다」 하나를 세 축으로 나눠 잰다. 절대값보다 **순서**가
 * 맞는 것이 중요하다 — 해설이 「이 배패가 저 배패보다 낫다」를 읽는 값이지 「71점짜리
 * 배패」를 읽는 값이 아니다.
 *
 *   - **속도(0.5)** — 샹텐. 배패 샹텐은 대개 3~6이고 1~2면 아주 빠른 손이다.
 *   - **타점(0.3)** — 도라 + 적도라 장수. 3장부터는 더 세도 손이 그만큼 세지지 않아
 *     3에서 끊는다(그 위는 어차피 만관 위 구간이라 순서가 이미 갈렸다).
 *   - **방향(0.2)** — 역이 될 씨앗이 손에 있는가: 역패 대자(2장 이상) · 탕야오
 *     (요구패 3장 이하) · 색 치우침(한 색 7장 이상) · 치또이 방향(대자 4쌍 이상).
 *
 * 예시(실측값 — `test/SpectateScore.test.ts`가 이 순서를 고정한다):
 *   - `123456789m 55s 77z` 도라 2 — 이미 텐파이·청일색 방향·역패 대자 → **90**
 *   - `1358m 2479p 1469s 3z` 도라 1 — 4샹텐, 방향은 탕야오뿐 → **33**
 *   - `159m 1479p 258s 134z` 도라 0 — 6샹텐, 연결도 도라도 없다 → **5**
 *
 * 값은 국 시작 때 한 번 재고 그 국 내내 고정한다 — 중간에 움직이면 그건 배패 점수가
 * 아니라 그냥 현재 손 점수다.
 */
export function gradeStartingHand(
  kinds: readonly TileKind[],
  options?: DecomposeOptions,
  doraCount = 0,
): number {
  if (kinds.length === 0) return 0;
  const shanten = shantenOf(kinds, 0, options);

  // 속도 — 6.5샹텐(사실상 최악)에서 1샹텐(사실상 최선)까지를 0~1로 편다.
  const speed = clamp01((6.5 - shanten) / 5.5);

  // 타점 — 도라 3장에서 만점
  const value = clamp01(Math.min(doraCount, 3) / 3);

  // 방향 — 역의 씨앗. 하나만 있어도 절반, 둘 이상이면 만점에 가깝다.
  const counts = new Map<string, number>();
  const bySuit = new Map<string, number>();
  let terminals = 0;
  for (const k of kinds) {
    const key = kindKey(k);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    bySuit.set(k.suit, (bySuit.get(k.suit) ?? 0) + 1);
    if (isHonorOrTerminal(k)) terminals++;
  }
  let pairs = 0;
  let yakuhaiPair = false;
  for (const [key, n] of counts) {
    if (n >= 2) {
      pairs++;
      if (key.startsWith("dragon") || key.startsWith("wind")) yakuhaiPair = true;
    }
  }
  const flush = Math.max(0, ...[...bySuit.entries()]
    .filter(([s]) => s !== "wind" && s !== "dragon")
    .map(([, n]) => n));
  let seeds = 0;
  if (yakuhaiPair) seeds++;
  if (terminals <= 3) seeds++; // 탕야오 방향
  if (flush >= 7) seeds++;
  if (pairs >= 4) seeds++; // 치또이 방향
  const direction = clamp01(seeds / 2);

  return Math.round(100 * (0.5 * speed + 0.3 * value + 0.2 * direction));
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function isHonorOrTerminal(k: TileKind): boolean {
  if (k.suit === "wind" || k.suit === "dragon") return true;
  return k.rank === 1 || k.rank === 9;
}

/**
 * 배패 직후 네 좌석의 배패 점수를 한 번에 잰다 (`HanchanController`가 국 시작 때 부른다).
 *
 * 도라 표시패는 배패 시점에 이미 한 장 열려 있으므로 그 도라까지 센다. 왕패(`DEAD_WALL`)
 * 안쪽은 아직 아무도 모르는 정보라 보지 않는다.
 *
 * ⚠ **오야는 이 시점에 이미 14장이다.** `FlowController.begin()`은 `runAuto()`라
 * 배패에서 멈추지 않고 **오야의 첫 쯔모까지** 진행한다 — 그래서 「배패 직후」로 보이는
 * 첫 프레임의 오야 손패는 14장이다. 그걸 그대로 재면 오야만 매 국 체계적으로 높게
 * 나오고(같은 손 13장 33점 → 14장 42점), 이 값의 **유일한 용도인 좌석 간 순서 비교**가
 * 통째로 깨진다. 그래서 3n+2면 첫 쯔모패를 도로 뺀다.
 */
export function gradeStartingHands(
  state: GameState,
  rules: RuleRegistry,
): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  for (const p of state.players) {
    const graded = gradeSeatHand(state, rules, p.id);
    if (graded !== null) out[p.id] = graded.grade;
  }
  return out;
}

/** 한 좌석의 배패 점수와 **그 점수를 잰 패 id 집합** */
export interface SeatHandGrade {
  grade: number;
  /** 이 점수를 만든 손패 id들 — 손이 통째로 바뀌었는지 판정하는 데 쓴다 */
  ids: readonly TileId[];
}

/**
 * **한 좌석**의 배패 점수를 잰다 (`gradeStartingHands`의 좌석 단위 버전).
 *
 * 왜 좌석 단위가 따로 필요한가: 배패 점수는 국 시작 때 한 번 재고 고정인데,
 * **손패 교환 증강**(등가교환·손패 교환·자리 바꾸기)이 손을 통째로 갈아 끼우면
 * 중계 패널이 «없어진 손»의 점수를 국 내내 붙들고 있었다(2026-09-03 사용자 보고).
 * 바뀐 좌석만 다시 재려면 좌석 하나를 잴 수 있어야 한다.
 *
 * 잰 패 id를 함께 돌려주는 것은 «바뀌었나»의 판정 근거다 — 쯔모·버림은 한 번에
 * 한 장만 움직이므로 «절반 미만만 겹친다»에 절대 걸리지 않고, 그래서 이 값은
 * 예전처럼 국 내내 가만히 서 있는다.
 */
export function gradeSeatHand(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): SeatHandGrade | null {
  const doraSet = new Set(doraKindsOf(state).map(kindKey));
  let ids = [...handIdsOf(state, player)];
  if (ids.length === 0) return null;
  if (ids.length % 3 === 2) {
    // 첫 쯔모패를 뺀다 — 어느 패인지는 상태가 알고 있다(`lastDrawnTile`). 그 값이
    // 손에 없는 이상한 경우에만 마지막 자리로 떨어진다(배패 순서상 그 자리가 쯔모패다).
    const drawn = state.round.lastDrawnTile;
    const at = drawn === null ? -1 : ids.indexOf(drawn);
    ids = at >= 0 ? ids.filter((_, i) => i !== at) : ids.slice(0, -1);
  }
  let dora = 0;
  const kinds: TileKind[] = [];
  for (const id of ids) {
    const tile = state.tiles[id];
    if (tile === undefined) continue;
    kinds.push(tile.kind);
    if (doraSet.has(kindKey(tile.kind))) dora++;
    if (tile.attrs.red === true) dora++;
  }
  return {
    grade: gradeStartingHand(kinds, scoringOptionsOf(state, rules, player), dora),
    ids,
  };
}

/**
 * 국 하나 동안의 배패 점수 상태 — 점수 + 그 점수를 잰 패 id + 다시 잰 표식.
 *
 * `HanchanController`가 국 시작 때 만들고(`initialHandGrades`), 관전 방송마다
 * `refreshHandGrades`로 «손이 통째로 바뀐 좌석»만 다시 잰다.
 */
export interface HandGradeState {
  grades: Record<PlayerId, number>;
  /** 좌석별로 «이 점수를 잰 패 id 집합» */
  gradedIds: Record<PlayerId, ReadonlySet<TileId>>;
  /** 국 도중에 다시 잰 좌석 */
  regraded: Record<PlayerId, boolean>;
}

export function emptyHandGrades(): HandGradeState {
  return { grades: {}, gradedIds: {}, regraded: {} };
}

/** 배패 직후 — 네 좌석을 한 번에 재서 시작 상태를 만든다 */
export function initialHandGrades(state: GameState, rules: RuleRegistry): HandGradeState {
  const out = emptyHandGrades();
  for (const p of state.players) {
    const graded = gradeSeatHand(state, rules, p.id);
    if (graded === null) continue;
    out.grades[p.id] = graded.grade;
    out.gradedIds[p.id] = new Set(graded.ids);
  }
  return out;
}

/**
 * 손패가 **교체된** 좌석의 배패 점수를 다시 잰다 (2026-09-03 사용자 보고).
 *
 * 배패 점수는 국 내내 고정이라고 문서화돼 있고 그게 옳다 — 「지금 손 점수」가 아니라
 * 「어떤 배패를 받았나」의 값이기 때문이다. 그런데 등가교환·손패 교환·자리 바꾸기처럼
 * 손을 **통째로 갈아 끼우는** 증강이 지나가면 그 전제가 깨진다: 화면에는 이제 존재하지
 * 않는 손의 점수가 국이 끝날 때까지 서 있었다.
 *
 * 판정 기준은 «잰 패 집합과 지금 손이 **절반도 안 겹친다**». 쯔모·버림·후로는 한 번에
 * 한두 장만 움직이므로 절대 걸리지 않는다 — 즉 평소에는 예전과 완전히 같은 동작이고,
 * 손이 통째로 바뀐 그 순간에만 값이 움직인다. 장수(13장)를 세지 않고 비율로 보는 것은
 * 후로·깡으로 손패 장수 자체가 줄어들기 때문이다.
 */
export function refreshHandGrades(
  state: GameState,
  rules: RuleRegistry,
  hg: HandGradeState,
): void {
  for (const p of state.players) {
    const before = hg.gradedIds[p.id];
    if (before === undefined || before.size === 0) continue;
    const now = handIdsOf(state, p.id);
    if (now.length === 0) continue;
    let shared = 0;
    for (const id of now) if (before.has(id)) shared++;
    if (shared * 2 >= before.size) continue; // 절반 이상 그대로 — 평범한 쯔모·버림
    const graded = gradeSeatHand(state, rules, p.id);
    if (graded === null) continue;
    hg.grades[p.id] = graded.grade;
    hg.gradedIds[p.id] = new Set(graded.ids);
    hg.regraded[p.id] = true;
  }
}
