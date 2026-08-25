/**
 * DraftController — 개인별 3지선다 드래프트의 진행.
 *
 * 선택지는 (게임 시드, 스테이지, 플레이어)에서 파생된 별도 PRNG로 뽑는다 —
 * 게임 진행용 PRNG를 소비하지 않으며, 언제든 재계산 가능하다.
 * 상태를 바꾸는 것은 오직 픽(AugmentDrafted)이다.
 *
 * **다양성(2026-07-26)**: 한 게임에 증강이 최대한 골고루 나오게 두 겹을 건다.
 * ① 스테이지마다 제시 가능한 풀을 좌석별 **서로 소인 후보 칸**으로 갈라 —
 *    같은 스테이지에 두 사람에게 같은 증강이 제시되지 않는다(`cellFor`).
 * ② **스테이지가 열린 시점에** 누가 보유한 증강은 아무에게도 다시 제시하지 않는다 —
 *    한 게임에 같은 증강을 둘이 갖는 일이 없다(`heldByOthers`).
 * 두 장치 모두 **결정적**이며, 스테이지 도중 남이 픽해도 내 후보가 흔들리지 않는다
 * (근거는 `heldAtStageStart` 주석 — `pick`의 "제시된 것인가" 검증이 여기에 의존한다.
 * 흔들리면 게임이 예외로 끊긴다. 실제로 끊겼다).
 *
 * **시너지(2026-08-05)**: 그 위에 세 번째 겹을 얹었다 — 내가 **이미 집은 증강과 축이 겹치는**
 * 증강의 가중치를 올리고, 서로 죽는 증강의 가중치를 내린다(`synergyBiasFor` → `augment/synergy.ts`).
 * 리치를 집었으면 리치를 키우는 것이 더 자주 오되, 스텔스 리치처럼 **은닉이 존재 이유인** 증강에는
 * 리치를 드러내는 것들이 오히려 덜 온다. 근거가 내 보유 목록뿐이라 위 두 장치의 결정성을 깨지 않는다.
 * **가장 최근에 집은 증강이 가장 세게 끈다**(2026-08-17, `SYNERGY_RECENCY_DECAY`) —
 * 보유 목록은 픽 순서로 쌓이므로 그 순서를 그대로 `synergyBias`에 넘긴다.
 *
 * **슬롯 새로고침(2026-08-17)**: 마음에 안 드는 카드는 슬롯당 한 번 갈아 끼울 수 있다
 * (`rollWithRerolls`). 교체분은 **제시와 같은 추첨에서 미리 함께 뽑으므로** 위 ①②의
 * 겹침 금지가 교체된 카드에도 그대로 걸린다 — 새로고침으로 남과 같은 증강이 뜨는 일이 없다.
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §3~4
 */

import { Prng } from "../engine/random/Prng.js";
import type { GameEngine } from "../engine/GameEngine.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import { FIRST_DRAFT_EXCLUDED_COMPLEXITY, installAugment } from "./Augment.js";
import { augmentGrantKey } from "./events.js";
import type { AugmentDef, AugmentExtras } from "./Augment.js";
import { AugmentRegistry } from "./AugmentRegistry.js";
import { synergyBias } from "./synergy.js";

/**
 * 드래프트 스테이지 — 각 국에 **처음 진입할 때 1회씩**만 열린다.
 * - gameStart:  게임 시작(동1국 진입) — 두 모드 공통.
 * - eastThird:  동3국 진입 — 두 모드 공통.
 * - eastFourth: 동4국 진입 — 동풍전 전용.
 * - southEntry: 남장 진입(남1국) — 반장전 전용.
 * - southThird: 남3국 진입 — 반장전 전용.
 *
 * 결과적으로 동풍전은 3개(동1·동3·동4), 반장전은 4개(동1·동3·남1·남3)를 지급한다.
 */
export type DraftStage =
  | "gameStart"
  | "eastThird"
  | "eastFourth"
  | "southEntry"
  | "southThird";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 드래프트를 **추첨하지 않고 못 박는** 통로 (튜토리얼) */
export interface DraftOptions {
  /**
   * 이 좌석·스테이지에 세울 카드를 통째로 지정한다 (없으면 평소대로 추첨).
   *
   * 튜토리얼은 코치의 대본이 "«연금술사»를 고르세요"라고 이름을 부르므로, 카드가
   * 판마다 달라지면 안내가 곧바로 거짓말이 된다(`RoomManager.TUTORIAL_ROOM_NOTE`).
   * 보유·난도·좌석 칸 같은 평소 규칙은 여기서 전부 건너뛴다 — 못 박는다는 뜻이다.
   */
  forcedChoices?: (stage: DraftStage, player: PlayerId) => readonly string[] | undefined;
}

export class DraftController {
  /**
   * **이 스테이지가 열린 순간의** 보유 현황 (플레이어 id → 보유 증강).
   *
   * ## 왜 스냅샷인가 — 실제로 게임이 죽었다
   *
   * `heldByOthers`가 살아 있는 상태를 읽으면 **내 후보가 남의 픽에 흔들린다.**
   * 스테이지 진행은 (전원에게 오퍼 → 전원 응답 → 고정 순서로 픽 적용)인데,
   * `pick`은 "제시된 것인가"를 **다시 뽑아서** 검증한다. 앞 사람의 픽이 이미
   * 적용된 뒤라 그 픽이 내 금지 목록에 새로 들어가고, 그러면 내 후보가 달라져
   * 내가 고른 것이 "제시된 적 없다"가 된다 — `Augment X was not offered to pY`로
   * **게임 진행이 예외로 끊긴다.**
   *
   * 칸(`cellFor`)이 서로 소라 원래는 이런 일이 없어야 하지만, 칸이 말라 **칸 밖에서
   * 보충**하면 남의 칸에 있는 증강이 새어 들어온다. 그때 둘이 같은 것을 고르면 터진다.
   * (증강 켠 아레나 60배패에서 재현됐다.)
   *
   * 스냅샷이면 스테이지 도중에는 무엇도 변하지 않는다 — "이미 누가 보유한 증강은
   * 다시 제시하지 않는다"는 뜻도 그대로 지켜진다. 이번 스테이지에 **동시에** 고른
   * 것까지 막지는 못하지만, 그건 애초에 칸이 막던 일이고 예외로 끊는 것보다 낫다.
   *
   * 스테이지별로 **처음 뽑을 때** 찍는다(생성자가 아니다) — 컨트롤러 하나로 여러
   * 스테이지를 도는 호출자가 있고, 그때도 "앞 스테이지에서 누가 가져간 것"은
   * 제외돼야 하기 때문이다.
   */
  private readonly heldAtStageStart = new Map<
    DraftStage,
    ReadonlyMap<PlayerId, readonly string[]>
  >();

  constructor(
    private readonly engine: GameEngine,
    private readonly catalog: AugmentRegistry,
    private readonly extras: AugmentExtras = {},
    private readonly opts: DraftOptions = {},
  ) {}

  /**
   * 이 좌석·스테이지에 **못 박아 둔 카드**가 있으면 그 정의들 (없으면 null).
   *
   * 추첨을 통째로 건너뛰는 자리라 `rollWithRerolls` 안에 둔다 — `pick`이 검증할 때도
   * 같은 함수를 다시 부르므로, 여기서 갈아 끼우면 제시와 검증이 저절로 일치한다.
   * 바깥에서 오퍼만 바꿔치기하면 `pick`이 "제시된 적 없다"로 던진다.
   */
  private forced(stage: DraftStage, player: PlayerId): AugmentDef[] | null {
    const ids = this.opts.forcedChoices?.(stage, player);
    if (ids === undefined || ids.length === 0) return null;
    const defs: AugmentDef[] = [];
    for (const id of ids) {
      const def = this.catalog.get(id);
      // 이름이 틀렸으면 그 한 장만 빠진다 — 못 박기가 통째로 무너지는 것보다 낫다.
      if (def !== undefined) defs.push(def);
    }
    return defs.length > 0 ? defs : null;
  }

  /** 현재 게임 모드 (없으면 반장전 폴백) */
  private mode(): import("../engine/state/GameState.js").GameMode {
    return this.engine.state.config.mode ?? "hanchan";
  }

  /** 이 증강이 현재 스테이지·모드에서 제시 가능한지 (보유 여부와 무관) */
  private offerable(def: AugmentDef, stage: DraftStage): boolean {
    if (def.draftStages !== undefined && !def.draftStages.includes(stage)) {
      return false;
    }
    if (def.modes !== undefined && !def.modes.includes(this.mode())) {
      return false;
    }
    return true;
  }

  /**
   * **첫 드래프트에서 빼는 난도**인가 (`gameStart` 스테이지 한정).
   *
   * 처음 앉은 사람의 첫 선택은 30초 3지선다인데, 거기에 특수 역·부수·판 계산을 알아야
   * 뜻이 서는 카드가 섞이면 읽지도 못한 채 시간이 지난다(`AugmentComplexity` 주석).
   * 두 번째 스테이지부터는 한 국을 이미 쳐 봤으므로 아무것도 빼지 않는다.
   *
   * **왜 `tierAdjust`의 가중치 배관이 아니라 제외인가**: 그쪽은 드롭 "확률"을 움직이는
   * 길이고 여기 필요한 것은 **확정 배제**다. 게다가 가중 추출은 눈금을
   * `Math.max(1, …)`로 바닥을 깔아(`AugmentRegistry.pickWeighted`) 0을 줘도 안 사라지고,
   * 가중치 덮어쓰기는 카탈로그(=게임) 단위라 스테이지별로 갈라 쓸 수도 없다.
   * 그래서 이미 스테이지·플레이어 단위로 도는 `excludeFor`에 한 줄로 얹는다 —
   * 새 경로를 만들지 않으므로 `pick`의 "제시된 것인가" 재계산 검증도 그대로 성립한다.
   */
  private tooHardForFirstDraft(def: AugmentDef, stage: DraftStage): boolean {
    if (stage !== "gameStart") return false;
    return (def.complexity ?? 2) >= FIRST_DRAFT_EXCLUDED_COMPLEXITY;
  }

  /**
   * 이 스테이지·플레이어에게 제외할 증강 id
   * (보유 ∪ 스테이지/모드 부적합 ∪ 보유 증강과 상호 배제(conflicts) 관계
   *  ∪ 첫 드래프트에 너무 어려운 것 ∪ 보유 상황 전제 불충족(`draftRequires`)).
   */
  private excludeFor(stage: DraftStage, player: PlayerId): Set<string> {
    const state = this.engine.state;
    const held = state.players.find((p) => p.id === player)?.augments ?? [];
    const heldSet = new Set(held);
    const exclude = new Set<string>(held);

    // 보유 증강이 금지하는 상대 id (H.conflicts) — 상호 배제의 한 방향.
    const forbiddenByHeld = new Set<string>();
    for (const id of held) {
      for (const c of this.catalog.get(id)?.conflicts ?? []) {
        forbiddenByHeld.add(c);
      }
    }

    for (const def of this.catalog.all()) {
      if (!this.offerable(def, stage) || this.tooHardForFirstDraft(def, stage)) {
        exclude.add(def.id);
        continue;
      }
      /*
       * 보유 상황 전제(`draftRequires`) — 지금 이 사람에게 값이 서지 않는 카드는 뺀다.
       *
       * `offerable`(스테이지·모드)과 갈라 둔 이유: 저쪽은 **국 중에 변하지 않아** 칸
       * 계산(`cellFor`)에 쓸 수 있는데(그 함수 주석), 이쪽은 사람마다·시점마다 달라진다.
       * 칸 크기 계산에 섞으면 좌석마다 칸이 달라져 «서로 소» 불변식이 무너진다.
       * 그래서 여기(좌석별 제외 목록)에만 얹는다 — 스테이지 시작에 한 번 굳는 스냅샷이라
       * pick 검증(«제시된 것인가» 재계산)도 그대로 성립한다.
       */
      if (def.draftRequires?.(state, player) === false) {
        exclude.add(def.id);
        continue;
      }
      // 상호 배제: 보유 증강이 def를 금지하거나(H.conflicts ∋ def),
      // def가 보유 증강을 금지하면(def.conflicts ∩ 보유) 둘 다 제외한다 — 관계는 대칭.
      if (
        forbiddenByHeld.has(def.id) ||
        (def.conflicts ?? []).some((c) => heldSet.has(c))
      ) {
        exclude.add(def.id);
      }
    }
    return exclude;
  }

  /** 좌석 칸 폴백 경고를 이미 낸 스테이지 (스테이지당 한 번만 시끄럽게 한다). */
  private readonly cellFallbackWarned = new Set<DraftStage>();

  /**
   * 좌석 칸을 만들지 못해 전역 추첨으로 강등됐음을 알린다 (스테이지당 1회).
   *
   * 조용한 강등이 확정 5의 본질이었다 — 카탈로그가 줄거나 modes/draftStages 제한이
   * 늘거나 좌석 수가 바뀌면 이 경로로 떨어지는데, 그때 아무 흔적도 남지 않았다.
   */
  private warnCellFallback(stage: DraftStage): void {
    if (this.cellFallbackWarned.has(stage)) return;
    this.cellFallbackWarned.add(stage);
    const seats = this.engine.state.players.length;
    const pool = this.catalog.all().filter((d) => this.offerable(d, stage)).length;
    const count = this.engine.rules.resolve<number>("augment.draft.choices");
    const minCell = Math.max(count * 4, 12);
    const need = seats * minCell + this.drawCount();
    console.warn(
      `[draft] 좌석 칸 없이 전역 추첨으로 강등됐다 (stage=${stage}, 제시 가능 풀=${pool}, ` +
        `최소 요구치=${need} = 좌석 ${seats} × 최소 칸 ${minCell} + 보충 ${this.drawCount()}). ` +
        `좌석별로 순서대로 뽑아 오퍼가 서로 겹치지 않게 유지한다 — 게임 내 중복 보유는 ` +
        `그대로 막히지만, 카테고리 균형(칸이 하던 일)은 이 스테이지에 보장되지 않는다.`,
    );
  }

  /**
   * 다른 플레이어가 **이 스테이지에 들어오기 전에** 보유한 증강 id
   * (한 게임에 같은 증강이 둘 있지 않게). 스냅샷을 읽는 이유는 위 필드 주석에.
   */
  private heldByOthers(stage: DraftStage, player: PlayerId): Set<string> {
    let snapshot = this.heldAtStageStart.get(stage);
    if (snapshot === undefined) {
      snapshot = new Map(
        this.engine.state.players.map((p) => [p.id, [...p.augments]] as const),
      );
      this.heldAtStageStart.set(stage, snapshot);
    }
    const out = new Set<string>();
    for (const [id, augments] of snapshot) {
      if (id === player) continue;
      for (const augId of augments) out.add(augId);
    }
    return out;
  }

  /**
   * 한 슬롯을 새로고침할 수 있는 횟수. 마음에 안 드는 카드 한 장을 **한 번씩만**
   * 갈아 끼운다(2026-08-17 사용자 요청). 곧 한 사람이 이 스테이지에 볼 수 있는
   * 증강은 최대 `choices × (1 + 이 값)`장이고, 교체분까지 **미리 뽑아 두므로**
   * 좌석 간 겹침 금지가 새로고침에도 그대로 적용된다.
   */
  static readonly REROLLS_PER_SLOT = 1;

  /** 이 스테이지에 한 좌석이 볼 수 있는 총 장수 (화면 3장 + 교체분 3장) */
  private drawCount(): number {
    const count = this.engine.rules.resolve<number>("augment.draft.choices");
    return count * (1 + DraftController.REROLLS_PER_SLOT);
  }

  /**
   * 이 스테이지의 **좌석별 후보 칸(cell)** — 좌석마다 서로 겹치지 않는 후보 묶음.
   *
   * 한 게임에서 증강이 최대한 다양하게 나오도록, 스테이지가 열릴 때 제시 가능한 풀을
   * (시드 ⊕ 스테이지)로 섞어 좌석 순서대로 **서로 소인 구간**으로 나눠 준다. 각 좌석은
   * 자기 칸에서만 뽑으므로 **같은 스테이지에 두 사람에게 같은 증강이 제시되는 일이 없다.**
   *
   * 결정성·안정성이 이 설계의 핵심이다:
   * - 칸 계산에 쓰는 것은 `offerable`(draftStages·modes)뿐이다 — **국 중에 변하지 않는다.**
   *   보유 증강 같은 가변 상태를 칸 계산에 넣으면, 스테이지 도중 누가 픽할 때마다 남의
   *   후보가 흔들려 `pick`의 "제시된 것인가" 검증이 깨진다.
   * - 칸이 서로 소이므로 **다른 사람이 이번 스테이지에 픽한 증강은 내 칸에 애초에 없다.**
   *   다만 칸이 마르면 칸 밖에서 보충하는 통로가 있어 이 성질이 새어 나갔다 — 그래서
   *   금지 목록의 근거(`heldByOthers`)는 **스테이지 시작 시점 스냅샷**으로 고정한다.
   *
   * 카탈로그가 좌석 수를 감당할 만큼 크지 않으면 `null`을 돌려 **기존 전역 균등 추첨**으로
   * 돌아간다(작은 테스트 카탈로그·극단적 모드 필터). 그때 포기하는 것은 **좌석 간 오퍼
   * 겹침**뿐이다 — "게임 내 중복 보유 금지"는 `draw`의 폴백 경로가 계속 지키고, 강등
   * 사실은 스테이지당 한 번 경고로 남는다(`warnCellFallback`, QA disrupt 확정 5).
   */
  private cellFor(stage: DraftStage, player: PlayerId): AugmentDef[] | null {
    const state = this.engine.state;
    const seats = state.players.length;
    const seatIdx = state.players.findIndex((p) => p.id === player);
    if (seatIdx < 0 || seats <= 1) return null;

    const count = this.engine.rules.resolve<number>("augment.draft.choices");
    const draw = this.drawCount();
    // 칸 크기는 제시 수의 8배(최소 24) — 스테이지가 4회(반장전)로 늘면서 마지막 스테이지에는
    // 남들이 이미 가진 것(최대 3×3=9)과 내가 가진 것(3)이 내 칸에서 빠질 수 있다. 슬롯별
    // 새로고침(REROLLS_PER_SLOT)까지 미리 뽑으므로 채워야 할 장수는 3이 아니라 **6**이다 —
    // 6+9+3=18이 최소치라 24로 잡아 상호 배제(conflicts)만큼의 여유를 둔다.
    // (예전 18은 새로고침 없이 3장만 뽑던 시절의 값이고, 그때도 최소치 15에 3장 여유였다.)
    // 칸이 마르면 칸 밖에서 보충하는데(아래 draw), 그 경로는 남의 보유분을 걸러 내지 못해
    // 중복이 새어 나간다. 칸 밖에는 보충용 나머지가 최소 draw개 남아야 한다.
    const idealCell = Math.max(count * 8, 24);
    const pool = this.catalog.all().filter((d) => this.offerable(d, stage));

    /*
     * **칸 크기를 풀에 맞춰 좁힌다** (2026-08-20 QA disrupt 확정 5).
     *
     * 예전에는 `pool.length < seats * idealCell + draw` 면 곧장 `null` 을 돌려 전역 추첨으로
     * 강등했다. 그런데 오늘 카탈로그의 여유는 12~13장뿐이라(115 vs 요구치 102), 증강을
     * 13종만 정리하거나 modes/draftStages 제한을 몇 개 더 걸면 **절벽처럼** 서로 소인
     * 분할이 통째로 사라졌다 — 실측으로 -13종에서 게임의 절반이 중복 보유였다.
     * 칸이 꼭 24여야 할 이유는 없다: 서로 소이기만 하면 "같은 스테이지에 두 사람에게 같은
     * 증강이 제시되지 않는다"는 성질은 그대로다. 이상치(24)는 **칸이 마를 확률을 낮추는
     * 여유**일 뿐이므로, 풀이 모자라면 여유부터 깎고 분할 자체는 지킨다.
     *
     * 최소치(`count*4`) 아래로는 칸이 상시 말라 보충 경로만 타게 되므로 그때는 전역
     * 추첨으로 내려간다(작은 테스트 카탈로그). 그 강등은 `draw` 에서 경고로 남는다.
     */
    const fit = Math.floor((pool.length - draw) / seats);
    const cellSize = Math.min(idealCell, fit);
    if (cellSize < Math.max(count * 4, 12)) return null; // 카탈로그가 작다 → 기존 방식

    // (시드 ⊕ 스테이지)로 결정적 셔플 — 플레이어에 의존하지 않는다(칸 경계가 흔들리면 안 된다).
    const prng = new Prng(
      (state.config.seed ^ hashString(`cells:${stage}`)) >>> 0,
    );
    for (let i = pool.length - 1; i > 0; i--) {
      const j = prng.int(i + 1);
      [pool[i], pool[j]] = [pool[j] as AugmentDef, pool[i] as AugmentDef];
    }
    return pool.slice(seatIdx * cellSize, (seatIdx + 1) * cellSize);
  }

  /**
   * 이 플레이어에게 제시할 3개. 결정적이므로 몇 번 호출해도 같은 결과.
   *
   * 2026-07-22 (52차) 등급 폐기: 등급 통일·가중치를 걷어내고 **균등 비복원**으로 단순화했다.
   *
   * 2026-07-26 다양성: 좌석별 후보 칸(`cellFor`)에서 뽑아 **같은 스테이지에 다른 사람과
   * 겹치지 않게** 하고, 이미 **누가 보유한 증강은 아무에게도 다시 제시하지 않는다**
   * (한 게임에 같은 증강이 둘 있지 않게).
   */
  roll(stage: DraftStage, player: PlayerId): AugmentDef[] {
    const count = this.engine.rules.resolve<number>("augment.draft.choices");
    return this.draw(stage, player).slice(0, count);
  }

  /**
   * 화면에 서는 `count`장과, **슬롯별 새로고침으로 갈아 끼울** `count`장을 함께 준다.
   *
   * 교체분을 그 자리에서 새로 뽑지 않고 **여기서 미리 확정**하는 이유가 이 기능의 핵심이다:
   * `draw`가 한 번에 6장을 뽑으므로 교체분도 내 좌석 칸 안에 있고 남의 보유분이 걸러진
   * 상태다 — 곧 **새로고침으로 갈아 낀 카드도 다른 사람과 겹치지 않는다**(2026-08-17
   * 사용자 요청). 나중에 뽑으면 그 시점의 보유 현황이 달라져 있어 이 성질이 깨진다.
   *
   * 비복원 추출이라 앞 `count`장은 `roll`이 주는 것과 **글자 그대로 같다** — 새로고침을
   * 얹었다고 원래 제시가 달라지지 않는다.
   */
  rollWithRerolls(
    stage: DraftStage,
    player: PlayerId,
  ): { choices: AugmentDef[]; rerolls: AugmentDef[] } {
    /*
     * 못 박아 둔 자리(튜토리얼)에는 **새로고침을 주지 않는다.** 갈아 끼울 수 있으면
     * 고정이 아니고, 그 순간 코치의 대본이 가리키는 카드가 화면에서 사라진다.
     */
    const forced = this.forced(stage, player);
    if (forced !== null) return { choices: forced, rerolls: [] };
    const count = this.engine.rules.resolve<number>("augment.draft.choices");
    const drawn = this.draw(stage, player);
    return { choices: drawn.slice(0, count), rerolls: drawn.slice(count) };
  }

  /**
   * 이 스테이지·플레이어의 후보를 `drawCount()`장 뽑는다 (화면분 + 교체분).
   * 결정적이므로 몇 번 호출해도 같은 결과이며, 앞에서부터 잘라 쓰면 된다.
   */
  private draw(stage: DraftStage, player: PlayerId): AugmentDef[] {
    const state = this.engine.state;
    const exclude = this.excludeFor(stage, player);
    const seed = (state.config.seed ^ hashString(`${stage}:${player}`)) >>> 0;
    const prng = new Prng(seed);
    const total = this.drawCount();
    const bias = this.synergyBiasFor(player);

    const cell = this.cellFor(stage, player);
    if (cell === null) {
      /*
       * 좌석 칸을 못 만든 폴백 (2026-08-20 QA disrupt 확정 5).
       *
       * 예전에는 여기서 `exclude` 만 걸고 전역 균등 추첨으로 돌아갔다 — `exclude` 에는
       * **`heldByOthers` 가 없어서**, 이 파일 머리말이 못 박은 불변식
       * *"한 게임에 같은 증강을 둘이 갖는 일이 없다"* 가 **아무 신호 없이** 꺼졌다.
       * 여유는 12~13장뿐이라(카탈로그 115 vs 요구치 102) 증강 13종만 정리하거나
       * modes/draftStages 제한을 몇 개 더 걸면 절벽처럼 무너진다: 실측으로 -13종에서
       * 게임의 52.5%가 중복 보유였다. 값이 아니라 불변식이 깨지는데 로그도 테스트도
       * 아무 말을 하지 않는 것이 이 건의 본질이다.
       *
       * 이제 폴백에서도 금지 목록을 유지한다 — 포기하는 것은 **좌석 간 오퍼 겹침**
       * (같은 스테이지에 두 사람에게 같은 카드가 보이는 것)뿐이고, "게임 내 중복 보유"는
       * 살아남는다. 그리고 강등됐다는 사실을 스테이지당 한 번 경고로 남긴다.
       */
      this.warnCellFallback(stage);
      return this.fallbackDraw(stage, player);
    }

    // 내 칸에서 뽑는다 — 기존 제외 + 남이 이미 가진 것(게임 내 중복 금지).
    const banned = new Set([...exclude, ...this.heldByOthers(stage, player)]);
    const chosen = this.catalog.rollFromCell(prng, total, cell, banned, bias);
    if (chosen.length >= total) return chosen;

    // 칸이 말라붙은 극단적 경우에만 칸 밖에서 보충한다. 보충분에도 **같은 금지 목록**을
    // 건다 — 금지 목록이 스테이지 내내 고정(스냅샷)이라 pick 검증이 흔들리지 않는다.
    // (예전에는 여기서만 남의 보유분을 걸러 내지 못해 같은 증강이 둘에게 새어 나갔다.)
    const picked = new Set(chosen.map((d) => d.id));
    const rest = this.catalog
      .all()
      .filter((d) => !banned.has(d.id) && !picked.has(d.id));
    return [
      ...chosen,
      ...this.catalog.rollFromCell(prng, total - chosen.length, rest, new Set(), bias),
    ];
  }

  /** 폴백 스테이지의 좌석별 후보 — 스테이지당 한 번 통째로 만들어 둔다. */
  private readonly fallbackOffers = new Map<DraftStage, Map<PlayerId, AugmentDef[]>>();

  /**
   * 좌석 칸 폴백의 후보 뽑기 — **좌석끼리 겹치지 않게** 한 스테이지분을 한 번에 만든다.
   *
   * 예전에는 좌석마다 독립적으로 전역 추첨을 돌렸다. `heldByOthers`(스테이지 **시작
   * 시점** 스냅샷)를 걸긴 했지만, 그건 "**이번 스테이지에 동시에 고르는 것**"을 막지
   * 못한다 — 칸이 있을 때는 칸이 서로 소라 그 경우가 아예 생기지 않아서 문제가 없었고,
   * 칸을 못 만든 폴백은 정확히 그 방어가 사라진 자리다. 그래서 폴백이 걸리는 순간
   * **게임의 59~82%가 중복 보유로 끝났다**(QA 2차 synergy 확정 1). 같은 증강을 둘이
   * 들면 보유자 전용 채널(잔량·쿨다운)이 좌석을 구분하지 못한다 — 그게 이 불변식이
   * 있는 이유다(`Augment.grantAugments` 주석).
   *
   * 더 나쁜 것은 경고 문구가 *"게임 내 중복 보유는 계속 막지만"* 이라고 **반대로**
   * 말하고 있었다는 점이다. 원인 추적을 정확히 틀린 방향으로 보낸다.
   *
   * 고치는 방법은 칸이 하던 일을 그대로 흉내 내는 것이다: 좌석 순서대로 뽑되 **앞
   * 좌석이 이미 제시받은 id를 다음 좌석에서 제외**한다. 아무도 남의 후보를 볼 수
   * 없으므로, 오퍼가 서로 소면 중복 보유는 원천적으로 불가능하다.
   *
   * 결정성은 그대로다 — `state.players` 순서와 시드만으로 정해지고, 몇 번 호출해도
   * 같은 값이 나온다(`draw`의 계약). 그래서 pick 검증이 흔들리지 않는다.
   */
  private fallbackDraw(stage: DraftStage, player: PlayerId): AugmentDef[] {
    let byPlayer = this.fallbackOffers.get(stage);
    if (byPlayer === undefined) {
      byPlayer = new Map();
      const total = this.drawCount();
      const count = this.engine.rules.resolve<number>("augment.draft.choices");
      const seats = this.engine.state.players;
      /** 앞 좌석에 이미 나간 후보 — 칸이 하던 «서로 소» 역할을 대신한다. */
      const takenThisStage = new Set<string>();
      /** 좌석별 상태 — 두 패스가 같은 난수열을 이어 써야 결과가 결정적이다. */
      const perSeat = seats.map((p) => ({
        id: p.id,
        prng: new Prng((this.engine.state.config.seed ^ hashString(`${stage}:${p.id}`)) >>> 0),
        bias: this.synergyBiasFor(p.id),
        fixed: new Set([...this.excludeFor(stage, p.id), ...this.heldByOthers(stage, p.id)]),
        out: [] as AugmentDef[],
      }));
      /*
       * **두 패스로 나눠 뽑는다.**
       *
       * 한 패스로 좌석마다 `drawCount()`(화면분 + 교체분)를 통째로 예약하면, 카탈로그가
       * 좁을 때 뒤쪽 좌석이 통째로 굶는다(좌석 4 × 6 = 24장이 필요하다). 그러면 겹침을
       * 풀 수밖에 없고, 그 순간 이 함수가 막으려던 중복 보유가 그대로 돌아온다.
       *
       * 그래서 **화면에 서는 몫을 먼저 전 좌석에 돌리고**, 남은 것으로 교체분을 채운다.
       * 필요량이 좌석 4 × 3 = 12장으로 내려가므로 웬만한 좁은 카탈로그에서도 모든 좌석이
       * 고를 것을 갖는다. 교체분이 짧아지는 것은 «새로고침할 카드가 없다»는 정직한
       * 열화라 그대로 둔다 — 불변식(같은 증강을 둘이 갖지 않는다)은 지켜진다.
       */
      for (const seat of perSeat) {
        let got = this.catalog.rollUniform(
          seat.prng,
          count,
          new Set([...seat.fixed, ...takenThisStage]),
          seat.bias,
        );
        /*
         * **화면 칸은 언제나 채운다 — 모자라면 겹침 금지를 먼저 놓는다.**
         *
         * 좌석 수 × 화면 칸보다도 작은 카탈로그에서는 겹침 금지를 지킬 방법이 아예
         * 없다(좌석 4 × 3칸 = 12장이 매 스테이지 새로 필요한데, 지난 스테이지들이
         * 이미 12장을 가져간 상태다). 그때 «중복 보유 가능성»과 «고를 것이 없는
         * 드래프트 화면» 중에서 고르면 후자가 더 나쁘다 — 판이 그 자리에 선다.
         *
         * 그리고 **0장일 때만** 풀어 주면 안 된다: 뒤쪽 좌석이 1~2장짜리 화면을 받는
         * 어중간한 상태가 남는다(실측으로 표준 4종 카탈로그에서 한 좌석이 1장만
         * 받았다). 그건 «선택지가 준다»가 아니라 선택이 사라지는 것이고, 무엇보다
         * 이 자리의 동작을 예전과 다르게 만든다. 채울 수 있으면 채운다.
         *
         * 여기까지 오려면 카탈로그가 대략 30종 아래여야 한다(실제 114종).
         */
        if (got.length < count) {
          got = this.catalog.rollUniform(seat.prng, count, seat.fixed, seat.bias);
        }
        for (const d of got) takenThisStage.add(d.id);
        seat.out.push(...got);
      }
      for (const seat of perSeat) {
        const want = total - seat.out.length;
        if (want <= 0) continue;
        const got = this.catalog.rollUniform(
          seat.prng,
          want,
          new Set([...seat.fixed, ...takenThisStage]),
          seat.bias,
        );
        for (const d of got) takenThisStage.add(d.id);
        seat.out.push(...got);
      }
      for (const seat of perSeat) byPlayer.set(seat.id, seat.out);
      this.fallbackOffers.set(stage, byPlayer);
    }
    return byPlayer.get(player) ?? [];
  }


  /**
   * 이 플레이어의 **보유 증강과의 시너지** 편향 (증강 id → 가중치 배수).
   *
   * 첫 스테이지에는 보유가 없어 빈 객체 = 완전 중립이다. 이후 스테이지에서는
   * 이미 집은 것과 축이 겹치는 증강이 더 자주, 서로 죽는 증강이 덜 뜬다
   * (표와 사유는 `augment/synergy.ts` · docs/26).
   *
   * **결정성**: 근거가 `player` 본인의 보유 목록뿐이라 `excludeFor`와 같은 안정성을
   * 가진다 — 스테이지 도중 남이 픽해도 내 후보가 흔들리지 않는다. 내 보유 목록은
   * 내가 픽하는 순간에만 바뀌고, `pick`은 제출 **전에** `roll`을 다시 계산해 검증한다.
   */
  private synergyBiasFor(player: PlayerId): Readonly<Record<string, number>> {
    const held =
      this.engine.state.players.find((p) => p.id === player)?.augments ?? [];
    // 배타 관계는 카탈로그만 안다 — 시너지 표가 배타 쌍을 끌어올리지 않게 넘겨 준다.
    return synergyBias(held, (id) => this.catalog.get(id)?.conflicts ?? []);
  }

  /**
   * 제시(오퍼)를 로그에 기록한다 — 픽률·등급 분포 통계 전용(상태 불변).
   * 픽보다 먼저, 고정 순서로 호출해야 리플레이 이벤트 순서가 결정적이다.
   */
  recordOffer(_stage: DraftStage, player: PlayerId, offered: AugmentDef[]): void {
    const result = this.engine.submit({
      player,
      type: "draftOffer",
      payload: { player, augmentIds: offered.map((d) => d.id) },
    });
    if (!result.ok) throw new Error(`draftOffer failed: ${result.reason}`);
  }

  /**
   * 픽 확정: 제시된 것 중 하나여야 하며, 상태 갱신 후 설치까지 한다.
   *
   * "제시"에는 **슬롯별 새로고침으로 닿을 수 있는 교체분까지** 포함한다 — 실제로
   * 새로고침을 눌렀는지는 여기서 알 수 없고(그 상태는 좌석의 것이다), 화면에 실제로
   * 무엇이 서 있었는지는 `HumanAgent`가 이미 검증한다. 여기 검증의 목적은 픽이
   * **이 좌석의 후보 칸에서 나왔는가**이며, 그 성질은 교체분에도 그대로 성립한다.
   */
  pick(stage: DraftStage, player: PlayerId, augmentId: string): void {
    const { choices, rerolls } = this.rollWithRerolls(stage, player);
    const offered = [...choices, ...rerolls].map((d) => d.id);
    if (!offered.includes(augmentId)) {
      throw new Error(`Augment ${augmentId} was not offered to ${player}`);
    }
    const def = this.catalog.get(augmentId);
    if (def === undefined) throw new Error(`Unknown augment: ${augmentId}`);

    // 정식 픽 — 스테이지 완료 플래그도 함께 기록(도박사가 2개를 줘도 진행 추적이 견고)
    const result = this.engine.submit({
      player,
      type: "draftPick",
      payload: { augmentId, markStage: stage },
    });
    if (!result.ok) throw new Error(`draftPick failed: ${result.reason}`);

    installAugment(this.engine, def, player, {
      ...this.extras,
      reservedAugmentIds: this.reservedForOthers(stage, player),
    });
  }

  /**
   * **이번 스테이지에 다른 좌석이 집을 수도 있는 증강 id** (지급형 증강의 후보에서 뺀다).
   *
   * 스테이지 진행은 (전원 오퍼 → 전원 응답 → **고정 순서로 픽 적용**)이라, 앞 좌석의
   * 픽이 적용되는 시점에 뒷 좌석의 픽은 아직 상태에 없다. 수상한 주사위는 바로 그
   * 순간에 지급까지 끝내므로 `heldByAnyone`이 뒷 좌석의 픽을 못 보고, 곧이어 그 픽이
   * 적용되면 **한 게임에 같은 증강을 둘이 보유**한다(머리말 불변식 ②, QA cross 확정 1).
   *
   * 남이 무엇을 고를지는 여기서 알 수 없지만 **무엇을 고를 수 있는지**는 결정적으로
   * 다시 계산할 수 있다 — 오퍼(+교체분) 전체를 예약분으로 넘겨 그 창을 닫는다.
   * 오퍼는 `rollWithRerolls`가 몇 번을 불러도 같은 값이라 리플레이·재개에서도 같다.
   */
  private reservedForOthers(stage: DraftStage, player: PlayerId): string[] {
    const out = new Set<string>();
    for (const p of this.engine.state.players) {
      if (p.id === player) continue;
      const { choices, rerolls } = this.rollWithRerolls(stage, p.id);
      for (const d of [...choices, ...rerolls]) out.add(d.id);
    }
    return [...out];
  }
}

/**
 * 좌석별 **지급받은(=드래프트로 집지 않은) 증강 id** — 지급 이력(`augmentGrantKey`)에서 읽는다.
 * 재구성이 "인덱스 = 스테이지"를 셀 때 이 id들을 빼야 스테이지가 밀리지 않는다.
 */
function grantedAugmentIds(
  engine: GameEngine,
  catalog: AugmentRegistry,
): Map<PlayerId, Set<string>> {
  const out = new Map<PlayerId, Set<string>>();
  for (const player of engine.state.players) {
    const granted = new Set<string>();
    for (const by of player.augments) {
      const rec = engine.state.augmentData[augmentGrantKey(player.id, by)];
      if (!Array.isArray(rec)) continue;
      for (const id of rec as string[]) {
        if (catalog.get(id) !== undefined) granted.add(id);
      }
    }
    out.set(player.id, granted);
  }
  return out;
}

/** 게임 재구성·리플레이용: state.augments에 있는 모든 증강을 재설치한다 */
export function rebuildAugments(
  engine: GameEngine,
  catalog: AugmentRegistry,
  extras: AugmentExtras = {},
): void {
  // 설치 순서를 **원본 드래프트와 같은 모양**으로 맞춘다.
  //
  // 원본은 스테이지마다 자리 순으로 한 장씩 돌아간다(p0 gameStart, p1 gameStart, …,
  // p0 southEntry, …). 예전 재구성은 플레이어별로 몰아서(p0의 전부 → p1의 전부)
  // 설치해 등록 순서(seq)가 달라졌고, seq에 기대는 동률 훅의 결과가 뒤집혔다 —
  // 즉 **이어하기·리플레이가 원본과 다른 점수를 낼 수 있었다**(docs/25 P6).
  // player.augments는 픽 순서로 쌓이므로 인덱스가 곧 드래프트 스테이지에 대응한다.
  //
  // ⚠ **지급받은 증강은 이 루프에서 세지 않는다.** 수상한 주사위(cornucopia)가 한
  // 스테이지에 2장을 더 밀어 넣으면 "인덱스 = 스테이지"라는 전제가 그 자리에서 깨져,
  // 뒤쪽 스테이지가 통째로 한 칸씩 밀린다. 게다가 원본에서 지급분은 **지급자의 install
  // 안에서** 설치되므로(지급자보다 먼저 등록된다) 여기서 다시 설치하면 순서가 두 번
  // 어긋난다. 지급자를 설치하면 `grantAugments`가 지급 이력을 읽어 **원본과 같은 자리에**
  // 지급분을 설치해 준다(Augment.ts). 600게임 중 75게임의 순서 불일치가 이것이었다
  // (QA cross 확정 2).
  const grantedIds = grantedAugmentIds(engine, catalog);
  const slots = new Map<PlayerId, string[]>(
    engine.state.players.map((p) => [
      p.id,
      p.augments.filter((id) => !(grantedIds.get(p.id)?.has(id) ?? false)),
    ]),
  );
  const maxCount = Math.max(0, ...[...slots.values()].map((ids) => ids.length));
  for (let i = 0; i < maxCount; i++) {
    for (const player of engine.state.players) {
      const augmentId = slots.get(player.id)?.[i];
      if (augmentId === undefined) continue;
      const def = catalog.get(augmentId);
      if (def === undefined) {
        throw new Error(`Cannot rebuild unknown augment: ${augmentId}`);
      }
      installAugment(engine, def, player.id, extras);
    }
  }
}
