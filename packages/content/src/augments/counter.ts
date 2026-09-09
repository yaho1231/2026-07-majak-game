/**
 * 카운터 (counter, silver) — 48차 도파민 개편.
 *
 * 이전: "상대 리치 뒤 추격 리치를 걸면 +1판" (보이지 않는 판 보너스).
 * 지금: 추격 리치를 거는 순간 **반격이 터진다** —
 *       ① 내 공탁 1000점을 **먼저 리치한 그 상대가 대납**한다 (1000점이 눈앞에서 넘어온다).
 *       ② 그 상대의 **일발이 즉시 소멸**한다.
 *       ③ 그 국을 내가 **먼저 화료하면**, 그 상대의 손이 올랐을 때 받았을 점수를
 *          **뱅크에서 통째로 더 받는다** (선리치자의 손 가치를 내가 가져간다).
 *       ④ (52차) 그 상대에게서 **직격 론**으로 화료하면 **+3판**을 얻는다 — ③과 중복.
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
  belowMinHan,
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
  addWinHanBonus,
  counterOf,
  flagOf,
  riichiHidden,
  settleInterceptor,
  stringOf,
  viewKey,
  winPointsWithExtraHan,
  withAugPoint,
} from "../util.js";

/**
 * 이 플레이어의 손이 지금 올랐다면 받았을 최고 점수.
 * 대기패마다 가상 론을 평가해 가장 비싼 값을 고른다 (역 없는 대기는 건너뛴다).
 *
 * ⚠ **격(`win.minHan` — rank_gate)에 걸리는 대기는 0으로 센다** (2026-08-31 QA synergy4 후속).
 * 이 카드가 강탈하는 것은 "그 상대가 올랐다면 받았을 점수"인데, 격에 걸린 손은 코어의
 * 표준 론 검증(`belowMinHan` → WIN_BLOCKED_MIN_HAN)이 막아 **실제로는 화료가 안 된다**.
 * 게이트 없이 세면 오르지도 못할 손이 밑값이 되어 강탈액이 통째로 부푼다
 * (실측: 격에 걸린 오야 탕야오 텐파이에서 뱅크 발행 11,600 → 0).
 * 판정은 사본을 만들지 않고 코어의 `belowMinHan`을 그대로 쓴다 — 무덤 도굴(B-9)과 같은 규약.
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
    if (belowMinHan(ev, state, rules, player)) continue;
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
/**
 * 반격이 **지금 유효한가** — 손 가치 강탈·직격 +3판의 전제.
 * 추격 리치를 무르면(승부수) 이 플래그가 내려간다.
 */
const struckKey = (h: PlayerId): string => `counter:struck:${h}`;
/**
 * 이번 국에 반격을 이미 **썼는가** (국당 1회의 실제 계수).
 *
 * `struckKey`와 나눠 둔 이유: 리치 취소로 반격이 무효가 되어도 "이번 국 1회"는 그대로
 * 소진돼야 한다. 하나로 합치면 취소할 때마다 반격을 다시 쓸 수 있다.
 */
const spentKey = (h: PlayerId): string => `counter:spent:${h}`;
/** 이번 국에 그 상대가 실제로 대납한 금액 (취소 시 되돌릴 원금) */
const paidKey = (h: PlayerId): string => `counter:paid:${h}`;

const COUNTER_STRUCK = "CounterStruck";
const COUNTER_REVERTED = "CounterReverted";
/** 승부수(last_stand)의 리치 취소 이벤트 — 문자열로 구독한다(riichi_upgrade와 같은 꼴) */
const RIICHI_CANCELED = "RiichiCanceled";

/**
 * 반격한 국에 그 선리치자를 **직격 론**으로 잡았을 때의 확정 보너스
 * (52차 재조정, docs/16_AUGMENT_REDESIGN.md §1c).
 *
 * 기존 "손 가치 강탈"과 **중복 적용**된다 — 추격 리치를 걸고 그 상대를 직접 쏘는 것이
 * 이 증강의 최고 시나리오이므로 여기서 최대치가 나오는 게 맞다(문서 명시).
 * 발동 자체(공탁 대납·일발 소멸)는 이미 눈에 보이는 사건이고, 여기에 확정 점수로
 * 마감을 붙이는 **"보이는 발동 + 확정 보상"** 조합이라 §0 노잼 조항에 걸리지 않는다.
 */
const DIRECT_HIT_BONUS_HAN = 3; // 구 +6000점 → +4판 (2026-07-26) → +3판 (2026-08-25 사용자 지시)

interface CounterStruckPayload {
  /** 반격한 카운터 보유자 */
  holder: PlayerId;
  /** 대납·일발 소멸을 당하는 선리치자 */
  target: PlayerId;
  /** 대납 금액 (= 표준 리치 공탁, 상대의 잔여 점수가 상한) */
  amount: number;
}

/** 추격 리치를 무를 때 대납금을 원위치로 되돌린다 */
interface CounterRevertedPayload {
  holder: PlayerId;
  target: PlayerId;
  amount: number;
}

export const counter: AugmentDef = defineAugment({
  id: "counter",
  tier: "silver",
  category: "scoring",
  complexity: 3,
  name: "카운터",
  description:
    "먼저 리치한 상대에게 추격 리치를 걸고 내가 먼저 화료하면, 그 상대가 받았을 점수를 뱅크에서 추가로 받는다.",
  detail:
    "그 국에서 스스로 가장 먼저 리치를 건 상대에게 추격 리치를 걸면, 내 공탁 1,000점을 그 상대가 대신 내고 그 상대의 일발은 사라진다. 대신 내는 점수는 그 상대의 남은 점수까지다.\n\n내가 먼저 화료하면 그 상대가 화료했을 때 받았을 최고 점수를 뱅크에서 추가로 받고, 그 상대를 직격 론하면 +3판이 추가된다.",
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
      if (flagOf(rc.state, spentKey(holder))) {
        rc.emit(augmentDataSet(spentKey(holder), false));
      }
      if (counterOf(rc.state, paidKey(holder)) !== 0) {
        rc.emit(augmentDataSet(paidKey(holder), 0));
      }
      for (const channel of ["*", holder]) {
        if (stringOf(rc.state, viewKey(channel, `counter:${holder}`)) !== null) {
          rc.emit(augmentDataSet(viewKey(channel, `counter:${holder}`), ""));
        }
      }
    });

    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi) return;

      if (p.player !== holder) {
        /*
         * **남이 등 떠밀어 걸린 리치는 사냥감이 아니다** (2026-08-23 QA synergy3 riichi 확정 2).
         *
         * 이 카드의 전제("나보다 먼저 리치를 건 상대")는 원래 **상대가 선택해야** 성립한다 —
         * 다마텐으로 숨는 것이 카운터의 정면 대응이다. 그런데 낙인(push_riichi)이 그 선택을
         * 지우고 강제 리치를 세우면, 카운터의 전제가 **확정 생성**돼 피해자가 리치봉 1,000 +
         * 대납 1,000 + 직격 +3판을 자기 의사 없이 한 번에 맞았다(실측 한 국 +22,000).
         * 두 카드는 시너지 표에서 축을 둘 공유해 함께 뜬다.
         */
        if (p.riichiForced !== undefined) return;
        // 상대의 선리치 — 첫 한 명만 기록한다 (반격 대상은 **가장 먼저 건 사람** 하나뿐이다.
        // 둘·셋이 먼저 리치를 걸어도 반격은 그중 첫 사람에게만 간다 — 설명에 명시했다)
        if (stringOf(rc.state, prevKey(holder)) === null) {
          rc.emit(augmentDataSet(prevKey(holder), p.player));
        }
        return;
      }

      // 내 추격 리치 — 선리치자가 있고 아직 반격하지 않았다면 발동
      const target = stringOf(rc.state, prevKey(holder));
      if (target === null || flagOf(rc.state, spentKey(holder))) return;
      // 상대의 잔여 점수를 넘겨 뜯지 않는다(2026-08-04 사용자 확정). 정산 밖에서
      // 직접 옮기는 이동이라 도비 판정(국 정산 뒤)이 못 잡는다 — 캡이 없으면
      // 그 사람이 음수 점수인 채로 국을 계속 친다(docs/25 방해 #14).
      const targetScore =
        rc.state.players.find((pl) => pl.id === target)?.score ?? 0;
      /*
       * 대납액은 **표준 리치 공탁**이다 — 내가 실제로 낸 금액이 아니다.
       *
       * 예전에는 `p.riichiCost`(방금 낸 금액)를 그대로 옮겼다. 그래서 공탁을 내지 않는
       * 리치(스텔스 리치·물러설 수 없는 선언)로 추격하면 원금이 0이라 대납도 0원이 됐고,
       * 카드가 못 박은 "1000점이 눈앞에서 넘어온다"가 조용히 사라졌다
       * (2026-08-20 QA 문구 확정 6). 규칙값은 playerId 없이 뽑는다 — 보유자별
       * 공탁 면제 모디파이어를 타지 않는 '그 게임의 표준 공탁'이다.
       * (상한은 그대로 상대의 잔여 점수다.)
       */
      const standardCost = engine.rules.resolve<number>("riichi.cost", {
        state: rc.state,
      });
      const due = Math.max(p.riichiCost ?? 0, standardCost);
      const amount = Math.max(0, Math.min(due, targetScore));
      /*
       * ⚠ 여기서 `if (amount <= 0) return;` 으로 빠져나가면 **반격 전체가 사라졌다.**
       * 대납은 상한(상대 잔여 점수) 때문에 0이 될 수 있는데, 그 한 줄이 COUNTER_STRUCK
       * 앞에 있어서 일발 소멸도, 반격 플래그(= 손 가치 강탈 · 직격 +3판의 전제)도,
       * 공개 채널도 전부 함께 죽었다 — 1000점 미만으로 몰린 상대에게 추격 리치를 걸면
       * 카운터가 통째로 불발이었고 어디에도 그 사실이 안 보였다(2026-08-07).
       *
       * 대납액이 0이어도 반격은 성립한다. 옮길 점수가 없을 뿐이다.
       */
      rc.emit({
        type: COUNTER_STRUCK,
        payload: { holder, target, amount } satisfies CounterStruckPayload,
      });
      rc.emit(augmentDataSet(struckKey(holder), true));
      rc.emit(augmentDataSet(spentKey(holder), true));
      rc.emit(augmentDataSet(paidKey(holder), amount));
      /*
       * 추격 대상 공개 — 다만 **숨은 리치(스텔스 리치)는 이 채널로도 새면 안 된다.**
       *
       * 대상은 "그 국에 가장 먼저 리치를 건 사람"이라, 그 id를 전원 채널에 실으면
       * 리치 표시가 false인 채로 "저 사람이 리치다"가 그대로 공개됐다
       * (2026-08-20 QA 문구 확정 7). 숨은 리치가 대상이면 나만 보는 채널에 싣는다.
       */
      const channel = riichiHidden(engine.rules, rc.state, target) ? holder : "*";
      rc.emit(augmentDataSet(viewKey(channel, `counter:${holder}`), target));
    });

    /*
     * 추격 리치를 **무르면 반격도 함께 무른다** (2026-08-22 QA aug-1 확정 4).
     *
     * 카드가 요구하는 대가는 "**추격 리치로** 반격한다" — 내가 리치에 몸을 싣는 것이다.
     * 그런데 반격은 리치 선언 한 번으로 종결되고 그 뒤에 승부수(`last_stand`)로 리치를
     * 취소하면 공탁 1,000점이 되돌아왔다. 결과: 리치를 걸지 않은 채 순 +1,000점을 벌고,
     * 상대의 일발을 지웠으며, 손 가치 강탈·직격 +3판의 전제인 `struck`까지 그대로 남았다.
     *
     * 여기서 되돌리는 것은 **대납금과 `struck` 플래그**다.
     * - 일발은 되살리지 않는다. 취소는 빨라야 내 다음 순이라 그 시점이면 표준 규칙으로도
     *   이미 일발이 지나 있다 — 되살리면 없던 일발을 만들어 주는 쪽이 오히려 규칙 위반이다.
     * - `spent`(국당 1회)는 내리지 않는다. 무르는 것은 반격의 **효과**이지 기회가 아니다.
     *
     * `conflicts: ["last_stand"]`로 막지 않은 이유: conflicts는 **같은 사람의 드래프트
     * 안에서만** 작동하고 샌드박스·프리셋 경로는 그 밖에 있다. 게다가 리치를 없애는
     * 경로가 승부수 하나뿐이라는 보장도 없어, 근본(취소 시 환급·플래그 해제)을 고친다.
     */
    if (!engine.reducers.has(COUNTER_REVERTED)) {
      engine.reducers.register(COUNTER_REVERTED, (state, event) => {
        const p = event.payload as CounterRevertedPayload;
        return {
          ...state,
          players: state.players.map((pl) => {
            if (pl.id === p.holder) return { ...pl, score: pl.score - p.amount };
            if (pl.id === p.target) return { ...pl, score: pl.score + p.amount };
            return pl;
          }),
        };
      });
    }

    ctx.reaction(RIICHI_CANCELED, (event, rc) => {
      const p = event.payload as { player?: PlayerId };
      if (p.player !== holder) return;
      if (!flagOf(rc.state, struckKey(holder))) return;
      const target = stringOf(rc.state, prevKey(holder));
      const amount = counterOf(rc.state, paidKey(holder));
      if (target !== null && amount > 0) {
        rc.emit({
          type: COUNTER_REVERTED,
          payload: { holder, target, amount } satisfies CounterRevertedPayload,
        });
      }
      rc.emit(augmentDataSet(struckKey(holder), false));
      rc.emit(augmentDataSet(paidKey(holder), 0));
      // 공개 채널의 "이 사람을 추격 중" 표시도 함께 내린다 — 반격이 없던 일이 됐다.
      for (const channel of ["*", holder]) {
        if (stringOf(rc.state, viewKey(channel, `counter:${holder}`)) !== null) {
          rc.emit(augmentDataSet(viewKey(channel, `counter:${holder}`), ""));
        }
      }
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
      // ② 직격 +3판은 여기서 다루지 않는다 — 아래 addWinHanBonus로 옮겼다.
      const bonus =
        yaku === undefined ? 0 : bestWinValue(ic.state, target, ctx.engine.rules, yaku);
      if (bonus <= 0) return event;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas: {
            ...p.deltas,
            [holder]: (p.deltas[holder] ?? 0) + bonus,
          },
          augPoints: withAugPoint(p, ctx, bonus),
        },
      };
    });

    /*
     * ② 그 선리치자에게서 **직접 론**으로 잡았다면 확정 +3판 (①과 중복).
     *
     * ⚠ 예전에는 이 자리에서 `winPointsWithExtraHan`을 직접 불렀고 **여섯 번째 인자
     * `hanSoFar`를 빠뜨렸다** — 2026-08-23에 «+N판은 순서와 무관하게 덧셈»으로 못 박은
     * 규약의 유일한 누락이었다(2026-08-31 QA synergy4 A-4). 밑값 1~12판 스캔에서
     * 12판 중 11판이 어긋났고 최대 ±8,000점이 갈렸다: 등 떠밀기(+2판)와 겹치면
     * 오야 청일색에서 그쪽 +2판이 0원이 되고, 저타점에서는 반대로 과지급됐다.
     * 게다가 판수 표식(augPoint의 han)도 남지 않아 **뒤에 도는 "+N판" 카드가
     * 이 3판을 못 봤다**.
     *
     * 이제 공용 헬퍼 `addWinHanBonus`를 탄다 — hanSoFar를 받고, 판수를 결과 화면과
     * augPoints에 «판»으로 남겨 다른 "+N판" 증강과 정확히 덧셈이 된다.
     * (`score.extraHan`으로는 옮길 수 없다: 그 규칙의 해석 문맥에는 playerId·state뿐이라
     *  «누구에게서 론으로 잡았는가»를 알 수 없고, 쯔모 화료에까지 3판이 붙는다.
     *  WinInfo가 실려 오는 이 경로가 직격 조건을 볼 수 있는 유일한 자리다.)
     *
     * 더블론 가드는 여기에 없어도 된다 — `from === target`이면 target은 자기 버림패로
     * 오를 수 없으므로 «상대도 같이 올랐다»가 성립하지 않는다.
     */
    addWinHanBonus(ctx, (state, info) => {
      if (info.winType !== "ron" || info.from !== target0(state, holder)) return 0;
      if (!flagOf(state, struckKey(holder))) return 0;
      return DIRECT_HIT_BONUS_HAN;
    });
  },
});

/** 이번 국에 먼저 리치를 선언한 상대 (반격 대상) */
function target0(state: GameState, holder: PlayerId): PlayerId | null {
  return stringOf(state, prevKey(holder)) as PlayerId | null;
}
