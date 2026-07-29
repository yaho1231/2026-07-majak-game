/**
 * 카운터 (counter, silver) — 48차 도파민 개편.
 *
 * 이전: "상대 리치 뒤 추격 리치를 걸면 +1판" (보이지 않는 판 보너스).
 * 지금: 추격 리치를 거는 순간 **반격이 터진다** —
 *       ① 내 공탁 1000점을 **먼저 리치한 그 상대가 대납**한다 (1000점이 눈앞에서 넘어온다).
 *       ② 그 상대의 **일발이 즉시 소멸**한다.
 *       ③ 그 국을 내가 **먼저 화료하면**, 그 상대의 손이 올랐을 때 받았을 점수를
 *          **뱅크에서 통째로 더 받는다** (선리치자의 손 가치를 내가 가져간다).
 *       ④ (52차) 그 상대에게서 **직격 론**으로 화료하면 **+4판**을 얻는다 — ③과 중복.
 *
 * 부수는 상식: "리치 공탁은 선언한 사람이 낸다" · "일발은 자기 다음 버림까지 살아있다" ·
 * "상대의 손 가치는 상대가 올라야 실현된다".
 * 대응: 카운터 보유자 앞에서 먼저 리치를 걸지 않으면 발동 자체가 없다(선리치 억제).
 *
 * 구현: 추격 리치(TILE_DISCARDED riichi:true)를 감지해 전용 이벤트 CounterStruck를
 * 방출한다. 리듀서 하나가 점수 이동과 일발 소멸을 함께 처리해 한 번에 확정된다
 * (여러 보유자가 있어도 이벤트·리듀서는 has() 가드로 한 번만 등록).
 * ③의 뱅크 지급은 ROUND_SETTLED 인터셉터 — 정산 '전' 상태에서 선리치자의 대기패마다
 * 가상 론을 평가해 최고 점수를 구한다(형식텐파이 판정 tenpaiNoYaku와 같은 기법).
 */

import {
  augmentDataSet,
  buildWinContext,
  calculateScore,
  defineAugment,
  evaluateWin,
  handIdsOf,
  handKindsOf,
  kindKey,
  meldCountOf,
  playerAtSeat,
  ROUND_SETTLED,
  ROUND_STARTED,
  scoringOptionsOf,
  SETTLE_STAGE,
  TILE_DISCARDED,
  winningKinds,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  RuleRegistry,
  TileDiscardedPayload,
  YakuRegistry,
} from "@majak/core";
import {
  flagOf,
  settleInterceptor,
  stringOf,
  viewKey,
  winPointsWithExtraHan,
} from "../util.js";

/**
 * 이 플레이어의 손이 지금 올랐다면 받았을 최고 점수.
 * 대기패마다 가상 론을 평가해 가장 비싼 값을 고른다 (역 없는 대기는 건너뛴다).
 */
function bestWinValue(
  state: GameState,
  player: PlayerId,
  rules: RuleRegistry,
  yaku: YakuRegistry,
): number {
  const opts = scoringOptionsOf(state, rules, player);
  const waits = winningKinds(
    handKindsOf(state, player),
    meldCountOf(state, player),
    undefined,
    opts,
  );
  if (waits.length === 0) return 0;
  const isDealer = playerAtSeat(state, state.round.dealerSeat).id === player;
  let best = 0;
  // 화료패는 반드시 '손패 밖'의 패여야 한다 — 손에 있는 같은 종류를 집으면
  // buildWinContext가 그 패를 손에서 빼고 다시 붙여 13장이 되어 분해가 실패한다.
  const inHand = new Set(handIdsOf(state, player));
  for (const waitKind of waits) {
    const key = kindKey(waitKind);
    // 같은 종류라면 **적도라가 아닌 대표 패**를 고른다. tileId 오름차순으로 첫 패를
    // 집으면 5는 항상 적5가 걸려 실제로 쏘지도 않은 +1판이 붙었고, 만관 경계에서
    // 8000 → 12000으로 튀었다(2026-07-29 감사).
    const candidates = Object.keys(state.tiles)
      .map(Number)
      .filter((t) => !inHand.has(t) && kindKey(state.tiles[t]!.kind) === key);
    const tileId =
      candidates.find((t) => state.tiles[t]?.attrs.red !== true) ?? candidates[0];
    if (tileId === undefined) continue;
    const ev = evaluateWin(
      buildWinContext(state, player, "ron", tileId, { includeUra: true, rules }),
      yaku,
    );
    if (ev === null || !ev.ok) continue;
    const total = calculateScore({
      han: ev.han,
      fu: ev.fu,
      yakumanCount: ev.yakumanCount,
      isDealer,
      winType: "ron",
    }).total;
    if (total > best) best = total;
  }
  return best;
}

/** 이번 국에 먼저 리치를 선언한 상대 (없으면 미기록) */
const prevKey = (h: PlayerId): string => `counter:prev:${h}`;
/** 이번 국에 이미 반격했는가 (국당 1회) */
const struckKey = (h: PlayerId): string => `counter:struck:${h}`;

const COUNTER_STRUCK = "CounterStruck";

/**
 * 반격한 국에 그 선리치자를 **직격 론**으로 잡았을 때의 확정 보너스
 * (52차 재조정, docs/16_AUGMENT_REDESIGN.md §1c).
 *
 * 기존 "손 가치 강탈"과 **중복 적용**된다 — 추격 리치를 걸고 그 상대를 직접 쏘는 것이
 * 이 증강의 최고 시나리오이므로 여기서 최대치가 나오는 게 맞다(문서 명시).
 * 발동 자체(공탁 대납·일발 소멸)는 이미 눈에 보이는 사건이고, 여기에 확정 점수로
 * 마감을 붙이는 **"보이는 발동 + 확정 보상"** 조합이라 §0 노잼 조항에 걸리지 않는다.
 */
const DIRECT_HIT_BONUS_HAN = 4; // 구 +6000점 (2026-07-26 판수 통일)

interface CounterStruckPayload {
  /** 반격한 카운터 보유자 */
  holder: PlayerId;
  /** 대납·일발 소멸을 당하는 선리치자 */
  target: PlayerId;
  /** 대납 금액 (= 보유자가 방금 낸 리치 공탁) */
  amount: number;
}

export const counter: AugmentDef = defineAugment({
  id: "counter",
  tier: "silver",
  category: "scoring",
  name: "카운터",
  description:
    "(매 국 1회) 상대의 리치 뒤에 추격 리치를 선언하면 반격이 터진다 — 내 공탁 1000점을 그 상대가 대납하고 그 상대의 일발이 즉시 사라진다. 그 국을 내가 먼저 화료하면 그 상대의 손이 올랐을 때 받았을 점수까지 뱅크에서 받고, 직격 론으로 잡았다면 +4판을 얻는다.",
  detail:
    "(매 국 1회) 상대가 먼저 리치를 건 국에서 추격 리치를 선언하는 순간 발동한다. 내 리치 공탁 1000점을 그 상대가 대신 내고, 그 상대의 일발이 즉시 소멸한다. 그 국을 내가 먼저 화료하면 그 상대의 손이 화료했을 때 받았을 점수를 뱅크에서 추가로 받고, 나아가 그 상대의 버림패를 직격 론으로 잡으면 +4판을 얻는다(점수 강탈과 중복). 상대가 먼저 리치를 걸지 않으면 발동 자체가 없다.",
  install(ctx) {
    const { holder, engine } = ctx;

    if (!engine.reducers.has(COUNTER_STRUCK)) {
      engine.reducers.register(COUNTER_STRUCK, (state, event) => {
        const p = event.payload as CounterStruckPayload;
        const next: GameState = {
          ...state,
          players: state.players.map((pl) => {
            if (pl.id === p.holder) return { ...pl, score: pl.score + p.amount };
            if (pl.id === p.target) return { ...pl, score: pl.score - p.amount };
            return pl;
          }),
          round: {
            ...state.round,
            byPlayer: Object.fromEntries(
              Object.entries(state.round.byPlayer).map(([id, rs]) =>
                id === p.target && rs.riichi !== null
                  ? [id, { ...rs, riichi: { ...rs.riichi, ippatsu: false } }]
                  : [id, rs],
              ),
            ),
          },
        };
        return next;
      });
    }

    // 매 국 초기화 — 선리치 기록과 반격 사용 플래그를 함께 지운다
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      if (stringOf(rc.state, prevKey(holder)) !== null) {
        rc.emit(augmentDataSet(prevKey(holder), ""));
      }
      if (flagOf(rc.state, struckKey(holder))) {
        rc.emit(augmentDataSet(struckKey(holder), false));
      }
      if (stringOf(rc.state, viewKey("*", `counter:${holder}`)) !== null) {
        rc.emit(augmentDataSet(viewKey("*", `counter:${holder}`), ""));
      }
    });

    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi) return;

      if (p.player !== holder) {
        // 상대의 선리치 — 첫 한 명만 기록한다 (반격 대상은 가장 먼저 건 사람)
        if (stringOf(rc.state, prevKey(holder)) === null) {
          rc.emit(augmentDataSet(prevKey(holder), p.player));
        }
        return;
      }

      // 내 추격 리치 — 선리치자가 있고 아직 반격하지 않았다면 발동
      const target = stringOf(rc.state, prevKey(holder));
      if (target === null || flagOf(rc.state, struckKey(holder))) return;
      const amount = p.riichiCost ?? 0;
      if (amount <= 0) return;
      rc.emit({
        type: COUNTER_STRUCK,
        payload: { holder, target, amount } satisfies CounterStruckPayload,
      });
      rc.emit(augmentDataSet(struckKey(holder), true));
      rc.emit(augmentDataSet(viewKey("*", `counter:${holder}`), target));
    });

    // 반격을 터뜨린 국을 내가 '먼저' 화료하면, 선리치자의 손이 올랐을 때 받았을
    // 점수를 뱅크에서 통째로 더 받는다. (ic.state는 정산 적용 전 상태 — 선리치자의
    // 손패가 아직 그대로라 대기·점수를 계산할 수 있다.)
    const yaku = ctx.yaku;
    // 정산 단계: BankTopUp — 뱅크가 발행하는 가산(선리치자 손 가치 + 직격 판수).
    settleInterceptor(ctx, SETTLE_STAGE.BankTopUp, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      const infos = p.winInfos ?? [];
      const mine = infos.find((w) => w.winner === holder);
      if (mine === undefined) return event;
      if (!flagOf(ic.state, struckKey(holder))) return event;
      const target = stringOf(ic.state, prevKey(holder));
      if (target === null) return event;
      // 상대도 같이 올랐다면 '먼저 화료'가 아니다 (더블론)
      if (infos.some((w) => w.winner === target)) return event;

      // ① 선리치자의 손 가치 강탈 (yaku가 없으면 가상 화료를 평가할 수 없다)
      let bonus =
        yaku === undefined ? 0 : bestWinValue(ic.state, target, ctx.engine.rules, yaku);
      // ② 그 선리치자에게서 직접 론으로 잡았다면 확정 +4판 (①과 중복)
      if (mine.winType === "ron" && mine.from === target) {
        bonus += winPointsWithExtraHan(ic.state, holder, mine, DIRECT_HIT_BONUS_HAN);
      }
      if (bonus <= 0) return event;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas: {
            ...p.deltas,
            [holder]: (p.deltas[holder] ?? 0) + bonus,
          },
        },
      };
    });
  },
});
