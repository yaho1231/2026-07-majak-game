/**
 * opponents — **이 사람은 어떤 사람인가.**
 *
 * 예전 봇에게 상대 셋은 매 국 처음 보는 사람이었다. 국이 끝나면 아무것도 남지 않아서,
 * 다섯 국 내내 한 번도 안 운 사람과 매 국 세 번씩 우는 사람을 **똑같이** 취급했다.
 * 사람은 그러지 않는다 — 사람이 실제로 하는 말은 이런 것이다.
 *
 *   "쟤는 여태 한 번도 안 울었는데 지금 펑을 했다. 뭔가 있다."
 *   "쟤는 아무 손이나 리치 거니까 이번 것도 별거 아닐 거다."
 *
 * 같은 후로, 같은 리치인데 **누가 했느냐에 따라 뜻이 달라진다.** 이 파일은 그
 * "누가"를 기억한다.
 *
 * ## 어떻게 관측하는가
 *
 * 엔진에 손대지 않는다. 봇은 이미 매 결정마다 뷰를 받으므로, **뷰의 변화만 보고**
 * 사건을 읽어 낸다 — 리치 표시가 꺼졌다 켜지면 리치 선언, 후로 수가 늘면 후로,
 * 국 식별자가 바뀌면 그 국의 관측을 확정한다. 뷰만 쓰기 때문에 정보 비대칭이
 * 깨지지 않고(내가 볼 수 있는 것만 센다), 같은 뷰 흐름이면 같은 값이 나온다.
 *
 * ## 적은 표본을 어떻게 다루는가
 *
 * 두 국 보고 "이 사람은 리치를 100% 건다"고 단정하면 봇이 미신에 빠진다. 그래서
 * 관측을 **사전값(모든 사람의 평균)에 섞는다** — 국이 쌓일수록 관측 쪽으로 서서히
 * 옮겨 간다. 첫 국에는 아무 영향이 없고, 반장전 후반이면 뚜렷해진다. 사람이
 * 상대를 파악해 가는 속도와 비슷하다.
 */

import type { PlayerId, PlayerView } from "@majak/core";

/** 한 상대에 대해 지금까지 읽어 낸 성향 */
export interface OpponentTraits {
  /** 관측한 국 수 — 이 값이 작으면 아래 비율은 사전값에 가깝다 */
  rounds: number;
  /** 국당 리치 비율 */
  riichiRate: number;
  /** 국당 후로 비율 */
  callRate: number;
  /** 리치를 건 순목의 평균 (빠를수록 손이 좋다는 신호) */
  avgRiichiTurn: number;
}

/**
 * 사전값 — 관측이 없을 때의 '보통 사람'.
 * 실측 통계에 가깝게 잡는다: 리치는 국당 20% 남짓, 후로는 45% 남짓.
 */
const PRIOR: OpponentTraits = {
  rounds: 0,
  riichiRate: 0.2,
  callRate: 0.45,
  avgRiichiTurn: 9,
};

/**
 * 사전값의 무게 — "가상의 관측 국 수".
 *
 * 4로 두면 4국을 본 뒤에야 관측과 사전값이 반반이 된다. 크게 잡으면 봇이 끝까지
 * 상대를 못 알아보고, 작게 잡으면 한두 국의 우연을 성격으로 착각한다.
 */
const PRIOR_WEIGHT = 4;

/** 한 국 동안 이 상대에게서 본 것 */
interface RoundFlags {
  riichi: boolean;
  riichiTurn: number;
  called: boolean;
}

interface Totals {
  rounds: number;
  riichis: number;
  calls: number;
  riichiTurnSum: number;
}

const emptyFlags = (): RoundFlags => ({ riichi: false, riichiTurn: 0, called: false });
const emptyTotals = (): Totals => ({ rounds: 0, riichis: 0, calls: 0, riichiTurnSum: 0 });

export class OpponentMemory {
  private readonly totals = new Map<PlayerId, Totals>();
  private readonly flags = new Map<PlayerId, RoundFlags>();
  private roundKey = "";

  /**
   * 뷰 하나를 관측한다 (봇이 뷰를 받을 때마다 호출).
   * 국이 바뀌면 지난 국의 관측을 확정하고 새 국을 시작한다.
   */
  observe(view: PlayerView, me: PlayerId): void {
    const key = `${view.round.prevalentWind}-${view.round.roundNumber}-${view.round.honba}`;
    if (key !== this.roundKey) {
      this.commitRound();
      this.roundKey = key;
    }

    for (const p of view.players) {
      if (p.id === me) continue;
      const rs = view.round.byPlayer[p.id];
      if (rs === undefined) continue;
      let f = this.flags.get(p.id);
      if (f === undefined) {
        f = emptyFlags();
        this.flags.set(p.id, f);
      }
      // 리치는 한 국에 한 번뿐이다 — 처음 본 순간의 순목이 곧 선언 순목이다
      if (rs.riichiDeclared && !f.riichi) {
        f.riichi = true;
        f.riichiTurn = view.round.turnCount;
      }
      if ((rs.meldCount ?? 0) > 0) f.called = true;
    }
  }

  /** 진행 중이던 국의 관측을 총계에 넣는다 */
  private commitRound(): void {
    if (this.roundKey === "") {
      this.flags.clear();
      return;
    }
    for (const [id, f] of this.flags) {
      let t = this.totals.get(id);
      if (t === undefined) {
        t = emptyTotals();
        this.totals.set(id, t);
      }
      t.rounds++;
      if (f.riichi) {
        t.riichis++;
        t.riichiTurnSum += f.riichiTurn;
      }
      if (f.called) t.calls++;
    }
    this.flags.clear();
  }

  /**
   * 이 상대의 성향. 관측이 적으면 사전값에 가깝고, 국이 쌓일수록 관측 쪽으로 간다.
   * **진행 중인 국은 아직 세지 않는다** — 지금 벌어지는 일을 성향으로 되먹이면
   * "리치를 걸었으니 리치를 잘 거는 사람"이라는 순환이 생긴다.
   */
  traitsOf(player: PlayerId): OpponentTraits {
    const t = this.totals.get(player);
    if (t === undefined || t.rounds === 0) return PRIOR;
    const n = t.rounds + PRIOR_WEIGHT;
    const blend = (count: number, prior: number): number =>
      (count + prior * PRIOR_WEIGHT) / n;
    return {
      rounds: t.rounds,
      riichiRate: blend(t.riichis, PRIOR.riichiRate),
      callRate: blend(t.calls, PRIOR.callRate),
      avgRiichiTurn:
        t.riichis === 0 ? PRIOR.avgRiichiTurn : t.riichiTurnSum / t.riichis,
    };
  }

  /** 새 게임 — 기억을 비운다 (상대가 바뀐다) */
  reset(): void {
    this.totals.clear();
    this.flags.clear();
    this.roundKey = "";
  }
}

/** 관측이 없을 때 쓰는 성향 (테스트·최소 경로) */
export const NEUTRAL_TRAITS: OpponentTraits = PRIOR;
