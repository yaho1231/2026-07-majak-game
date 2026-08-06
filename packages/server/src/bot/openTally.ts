/**
 * openTally — **울고 난 국은 어떻게 끝나는가.**
 *
 * ## 왜 필요한가
 *
 * 봇의 후로율은 14~15%, 사람은 30~40%다. 그 격차를 좁히려는 시도가 세 번 있었고
 * 세 번 다 같은 모양으로 끝났다 — **후로율은 사람 쪽으로 가는데 판은 나빠진다.**
 *
 *   - #136 쿠이탄 게이트 완화 → 유국률 25.6% → 30.6%
 *   - #148 같은 게이트 재측정 → 순위 -0.0450 ± 0.0399 · 점수 -1314 ± 754
 *   - 콜 게이트에 역 읽기 연결 → 순위 -0.0250 ± 0.0282 · 점수 -855 ± 550
 *
 * 세 번째는 게이트가 실제로 열렸는데도(구조적 거절 83.1% → 77.6%) 결과가 같았다.
 * 그러니 원인은 **문턱도, 아는 역의 수도 아니다.** 남은 설명은 하나뿐이다 —
 * 지금 봇에게는 그 콜들이 실제로 손해라는 것. 즉 **울고 난 뒤를 잘 못 둔다.**
 *
 * 그건 아직 한 번도 안 재 봤다. 세 번 추측하고 세 번 틀린 다음이라 이번에는
 * 짐작하기 전에 센다(`bot/callAudit.ts`와 같은 순서다).
 *
 * ## 무엇을 세는가
 *
 * 국을 **그 사람이 울었는가**로 둘로 갈라, 각각의 화료율·방총률·평균 화료 점수를 낸다.
 * 사람의 실측에서 열린 손은 닫힌 손보다 화료율이 **높다**(빠르니까) — 대신 싸고
 * 방총이 늘어난다. 봇에게서 그 관계가 뒤집혀 있다면(울면 오히려 덜 이긴다면)
 * 문제는 콜 판단이 아니라 그 뒤의 진행·수비에 있다는 뜻이다.
 *
 * 안깡은 후로로 세지 않는다 — 멘젠이 유지되므로 `StatsTracker`의 후로율 정의와 맞춘다.
 *
 * ## 이 표로 말할 수 있는 것과 없는 것
 *
 * 이건 **관찰이지 인과가 아니다.** 울 수 있었던 손과 그렇지 않은 손은 애초에 다른
 * 손이다 — 울고 싶어지는 손은 대개 멘젠으로는 가망이 적던 손이라, "울어서 싸졌다"가
 * 아니라 "싼 손이라 울었다"일 수 있다. 그러니 이 표에서 **"후로가 손해다"는 따라
 * 나오지 않는다.**
 *
 * 인과를 재는 자리는 여전히 2:2 정책 대전(`--ab`)이고, 그쪽이 말하는 것은 "지금
 * 봇에게 **더 우는 것**은 손해"라는 것뿐이다.
 *
 * 이 표가 실제로 주는 것은 **어디를 볼지**다. 울고 난 손이 3371점이라는 사실은
 * 그 자체로 개선 여지를 가리킨다 — 후로를 줄이지 않고도 그 값을 올릴 수 있다면
 * 그건 순수한 이득이다. (`call.ts`가 콜 후보를 속도로만 고르고 있던 것이 그 예다.)
 */

import {
  CALL_MADE,
  KAN_DECLARED,
  ROUND_SETTLED,
  ROUND_STARTED,
} from "@majak/core";
import type { PlayerId } from "@majak/core";

/** 국 종료 이벤트에서 우리가 보는 부분만 */
interface SettledPayload {
  winInfos?: {
    winner: PlayerId;
    points: number;
    winType: string;
    from?: PlayerId | null;
  }[];
}

/** 한 갈래(울었다 / 안 울었다)의 성적 */
export interface OpenSplit {
  /** 이 갈래에 속한 국 수 (사람 수만큼 중복해 센다 — 국당 4인분) */
  rounds: number;
  wins: number;
  dealIns: number;
  /** 화료 점수 합 */
  winPoints: number;
}

const empty = (): OpenSplit => ({ rounds: 0, wins: 0, dealIns: 0, winPoints: 0 });

/** 비율까지 낸 표시용 */
export interface OpenSplitView extends OpenSplit {
  winRate: number;
  dealInRate: number;
  avgWinPoints: number;
}

function derive(s: OpenSplit): OpenSplitView {
  return {
    ...s,
    winRate: s.rounds === 0 ? 0 : s.wins / s.rounds,
    dealInRate: s.rounds === 0 ? 0 : s.dealIns / s.rounds,
    avgWinPoints: s.wins === 0 ? 0 : s.winPoints / s.wins,
  };
}

/**
 * 이벤트를 소비해 "울었는가"별로 국 성적을 가른다.
 *
 * `StatsTracker`와 **같은 이벤트**를 보되 교차표를 만드는 것이 다르다. 코어의
 * 집계를 건드리지 않는 이유는 이것이 측정 전용이기 때문이다 — 실제 전적 화면에
 * 없는 항목을 코어에 넣으면 실대국 통계의 뜻이 흐려진다.
 */
export class OpenTally {
  private readonly opened = new OpenSplitAccumulator();
  private readonly closed = new OpenSplitAccumulator();
  /** 이번 국에 운 사람 */
  private roundCall = new Set<PlayerId>();
  private readonly seats: PlayerId[];

  constructor(seats: readonly PlayerId[]) {
    this.seats = [...seats];
  }

  /**
   * 확정 이벤트 하나를 소비한다 — `StatsTracker`와 **같은 이벤트, 같은 정의**를 쓴다.
   * (후로에 안깡을 넣지 않는 것까지 맞춰야 두 표의 '후로'가 같은 뜻이 된다.)
   */
  consume(event: { type: string; payload?: unknown }): void {
    switch (event.type) {
      case ROUND_STARTED:
        this.roundCall.clear();
        break;
      case CALL_MADE: {
        const p = event.payload as { caller: PlayerId };
        this.roundCall.add(p.caller);
        break;
      }
      case KAN_DECLARED: {
        const p = event.payload as { player: PlayerId; kanKind: string };
        // 안깡은 멘젠이 유지되므로 후로가 아니다
        if (p.kanKind === "kan_open" || p.kanKind === "kan_added") {
          this.roundCall.add(p.player);
        }
        break;
      }
      case ROUND_SETTLED:
        this.settle(event.payload as SettledPayload);
        break;
      default:
        break;
    }
  }

  private settle(p: SettledPayload): void {
    const won = new Map<PlayerId, number>();
    const lost = new Map<PlayerId, number>();
    for (const w of p.winInfos ?? []) {
      won.set(w.winner, (won.get(w.winner) ?? 0) + w.points);
      if (w.winType === "ron" && w.from !== null && w.from !== undefined) {
        lost.set(w.from, (lost.get(w.from) ?? 0) + w.points);
      }
    }
    for (const seat of this.seats) {
      const bucket = this.roundCall.has(seat) ? this.opened : this.closed;
      bucket.round();
      const points = won.get(seat);
      if (points !== undefined) bucket.win(points);
      if (lost.has(seat)) bucket.dealIn();
    }
    this.roundCall.clear();
  }

  view(): { opened: OpenSplitView; closed: OpenSplitView } {
    return { opened: derive(this.opened.raw), closed: derive(this.closed.raw) };
  }
}

class OpenSplitAccumulator {
  readonly raw: OpenSplit = empty();
  round(): void {
    this.raw.rounds++;
  }
  win(points: number): void {
    this.raw.wins++;
    this.raw.winPoints += points;
  }
  dealIn(): void {
    this.raw.dealIns++;
  }
}
