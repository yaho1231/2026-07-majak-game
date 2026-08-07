/**
 * Augment — 증강의 정의와 설치 문맥.
 *
 * 증강은 데이터 + install 함수다. install은 획득 시 각 Registry에 능력을 등록한다.
 * 새 증강을 추가하는 데 엔진 코드를 고쳐선 안 된다 — install은 등록 API만 쓴다.
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §1
 */

import type { GameEngine } from "../engine/GameEngine.js";
import { isSourceDisarmed } from "../engine/GameEngine.js";
import type { GameState } from "../engine/state/GameState.js";
import type {
  Interceptor,
  Reaction,
} from "../engine/effects/EffectRegistry.js";
import { RuleLayer } from "../engine/rules/RuleRegistry.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import type { GameMode } from "../engine/state/GameState.js";
import type { YakuRegistry } from "../mahjong/scoring/YakuRegistry.js";
import type { PlayerView } from "../information/PlayerView.js";
import type { TileKind } from "../mahjong/tiles/Tile.js";
import { augmentGrantKey } from "./events.js";

export type AugmentTier = "silver" | "gold" | "prism";

/**
 * 증강 계열 — "이 증강은 무엇을 하는 물건인가"의 단일 축.
 *
 * 등급(tier)이 폐기된 뒤 증강의 유일한 시각 분류다. 드래프트 카드·이름표 pill·
 * 발동 컷인 색(`--fx-color`)이 전부 이 값 하나로 갈린다(docs/19 §4.1).
 * 클라이언트가 id로 추측하던 것을 증강 정의로 끌어올린 값이라, 새 증강은
 * 계열을 **반드시 자기 파일에 선언**한다(빠뜨리면 타입 에러 + 커버리지 테스트 실패).
 *
 * - `scoring`  점수·판수·배수를 키우거나 남의 점수를 가져온다
 * - `info`     남이 못 보는 것을 보거나, 남에게서 정보를 가린다
 * - `hand`     내 손패를 직접 바꾼다(교환·변형·생성)
 * - `shape`    화료형·역 성립 규칙 자체를 넓힌다(분해 규칙·후리텐·무역 화료)
 * - `call`     치·펑·깡의 규칙을 넓히거나 되돌린다
 * - `riichi`   리치의 조건·보상·해제를 건드린다
 * - `defense`  방총·실점·벌점을 막는다
 * - `disrupt`  상대를 지목해 방해하거나 흐름(턴·순서·자리)을 틀어놓는다
 * - `etc`      위 어디에도 안 붙는 메타 능력(증강 자체를 다루는 것 등)
 */
export type AugmentCategory =
  | "scoring"
  | "info"
  | "hand"
  | "shape"
  | "call"
  | "riichi"
  | "defense"
  | "disrupt"
  | "etc";

/**
 * 이해 난도 1~3 — **첫 드래프트에서 무엇을 빼는가**의 단일 축.
 *
 * 처음 앉은 사람의 첫 드래프트는 30초 제한의 3지선다다. 그 자리에 리치마작 지식을
 * 요구하는 카드가 섞이면 읽지도 못한 채 시간이 지나간다 — 그런데 이 저장소에는
 * 난도를 나타내는 값이 **어디에도 없었다**(`synergy.ts`의 `tags`는 시너지 가중용이다).
 *
 * - `1` 리치마작을 몰라도 한 줄로 읽힌다 (쯔모 리롤·손패 교환·점수 배수 …)
 * - `2` 리치마작 용어 하나를 안다는 전제 (후리텐·멘젠·도라·본장·공탁 …)
 * - `3` 규칙 여럿이 겹치거나 특수 역·부수·판 계산을 알아야 뜻이 선다
 *
 * `3`은 **첫 스테이지(gameStart)에서만** 제외된다(`DraftController.excludeFor`).
 * 두 번째 스테이지부터는 한 국을 이미 쳐 봤으므로 전부 나온다.
 *
 * 애매하면 **높게** 잡는다 — 잘못된 3은 제시 한 번을 잃지만, 잘못된 1은 첫 픽을
 * 통째로 버리게 한다.
 */
export type AugmentComplexity = 1 | 2 | 3;

/** 첫 드래프트(gameStart)에서 빼는 난도 */
export const FIRST_DRAFT_EXCLUDED_COMPLEXITY: AugmentComplexity = 3;

export const AUGMENT_CATEGORIES: readonly AugmentCategory[] = [
  "scoring",
  "info",
  "hand",
  "shape",
  "call",
  "riichi",
  "defense",
  "disrupt",
  "etc",
];

// ─────────────────────────── 봇 정책 (액티브 증강 사용) ───────────────────────────

/** 프롬프트에 제시되는 액션 후보 (FlowController.ActionOption과 동형 — 순환 참조 회피용 구조 타입) */
export interface BotAugmentOption {
  type: string;
  payload: unknown;
}

/** 봇 정책이 쓰는 결정론 난수 (BotAgent가 시드 PRNG로 제공) */
export interface BotRng {
  /** 0 이상 n 미만 정수 */
  int(n: number): number;
  /** 0 이상 1 미만 실수 */
  float(): number;
}

/**
 * 봇이 액티브 증강 발동을 판단할 때 받는 문맥.
 *
 * 뷰만 넘기던 것을 2026-07-29에 **봇이 이미 계산해 둔 판 읽기**까지 넘기도록 넓혔다.
 * 예전엔 각 정책이 "지금 위험한가 / 이 패가 몇 장 남았나"를 알 수 없어, 그걸 알아야
 * 판단이 서는 증강(자유 선언·승부수·손바닥 뒤집기)에 아예 정책을 못 달았다.
 * 값은 전부 봇이 자기 뷰로 계산한 것이라 정보 비대칭을 깨지 않는다.
 */
export interface BotDecisionContext {
  /** 봇(보유자)의 현재 뷰 */
  view: PlayerView;
  /** 이번 프롬프트에 제시된 전체 옵션 (이 증강 소유 타입만 골라 봐야 한다) */
  options: readonly BotAugmentOption[];
  /** 봇 자신의 id */
  holder: PlayerId;
  /** 결정론 난수 (같은 상황이면 같은 선택) */
  rng: BotRng;
  /** 보유자가 텐파이인지 (BotAgent가 계산해 제공) */
  tenpai: boolean;
  /** 화료까지 남은 갈아치기 횟수 (0=텐파이, 1=1샹텐 …) */
  shanten: number;
  /** 텐파이면 오름패 종류 목록 (아니면 빈 배열) */
  waits: readonly TileKind[];
  /** 이번 국의 순목 (몇 번째 차례인가) */
  turn: number;
  /** 패산에 남은 장수 */
  wallLeft: number;
  /** 상대 중 가장 높은 위협도 0(무해)~1(리치) */
  threat: number;
  /** 이 종류가 보이지 않는 곳에 몇 장 남았나 (0~4) */
  remaining(kind: TileKind): number;
  /** 이 패를 지금 버릴 때의 안전도 0(위험)~1(완전 안전) */
  safety(kind: TileKind): number;
  /**
   * **이 국이 게임의 어디인가.**
   *
   * 2026-08-05까지 이 문맥에는 판(손패·위협)만 있고 **점수판이 없었다.** 그래서
   * 증강 정책은 "올라스 선두라 지금은 조용히 끝내는 게 이득이다" 같은 판단을 할
   * 길이 아예 없었고, 동1국과 올라스에서 똑같이 발동했다. 봇의 버림·리치는 이미
   * 순위를 보는데(`bot/match.ts`) 증강만 못 보고 있었다.
   */
  placement: BotPlacement;
  /**
   * 지금 손이 화료하면 몇 점인가 (봇의 추정, 오야 보정 포함).
   * 값을 키우는 증강이 "이 손에 걸 만한가"를 판단하는 근거다 — 1000점짜리 손에
   * 배율을 걸어 봐야 그 국을 흘릴 뿐이다.
   */
  handPoints: number;
  /**
   * 봇의 **실험 스위치**(`server/bot/flags.ts`) — 2:2 정책 대전 전용.
   *
   * 증강 정책의 판단을 바꿀 때도 곧바로 갈아치우지 않고 스위치 뒤에 두고 재려면,
   * 정책이 스위치를 볼 수 있어야 한다. 실대국에서는 항상 비어 있거나 없다.
   */
  flags?: ReadonlySet<string>;
}

/** 게임 전체에서 이 국의 처지 (봇이 점수판에서 읽어 넘긴다) */
export interface BotPlacement {
  /** 1(선두) ~ 4(꼴찌) */
  rank: number;
  /** 마지막 국인가 */
  allLast: boolean;
  /**
   * -1(순위를 지킨다: 조용히 끝내는 게 이득) ~ 0(평시) ~ +1(뒤집는다: 크게 걸어야 한다).
   * 봇의 버림·리치가 쓰는 것과 **같은 축**이라 증강 판단이 나머지와 어긋나지 않는다.
   */
  riskAppetite: number;
}

/**
 * 봇이 이 증강의 액티브 액션을 '언제' 발동할지 판단하는 정책 (선택).
 * 정의하면 BotAgent가 매 결정마다 choose를 호출한다. 없으면 봇은 이 증강을 쓰지 않는다.
 *
 * choose는 발동할 옵션(반드시 ctx.options 중 하나와 동형)을 돌려주거나, 발동하지 않으면 null.
 * 이 증강이 소유한 액션 타입만 골라야 하며(다른 옵션은 무시), 발동은 그 증강에
 * 명백히 유리하고 자해 위험이 낮을 때만 하는 것을 원칙으로 한다.
 *
 * **액티브를 둘 이상 보유한 봇**은 한 프롬프트에 하나만 제출할 수 있다. 그때 누구를
 * 태울지는 `{ option, weight }`로 돌려준 **발동 강도**가 정한다 — 옵션만 돌려주면
 * 그 증강의 파워 점수에서 나온 기본 강도를 쓴다(`defaultBotWeight` 참조).
 * 예전에는 `player.augments` 배열의 첫 non-null이 무조건 이겨 **픽 순서**가 판단을
 * 눌렀다(docs/25 시스템 횡단 #10).
 */
export interface AugmentBotPolicy {
  choose(ctx: BotDecisionContext): BotAugmentOption | BotAugmentChoice | null;
}

/** 발동 강도를 실어 보내는 choose 반환형 */
export interface BotAugmentChoice {
  option: BotAugmentOption;
  /**
   * 이번 결정에서 이 증강을 태우고 싶은 정도 0~100.
   * 같은 프롬프트에서 여럿이 발동을 원하면 가장 큰 값이 이기고, 동점은 보유 순서로
   * 끊는다(결정론). 기준은 `BOT_WEIGHT`.
   */
  weight: number;
}

/** choose 반환값에서 옵션만 꺼낸다 (강도 표기 유무를 흡수) */
export function botChosenOption(
  picked: BotAugmentOption | BotAugmentChoice | null,
): BotAugmentOption | null {
  if (picked === null) return null;
  return "option" in picked ? picked.option : picked;
}

/**
 * 발동 강도 기준값 — 정책이 상황별로 골라 쓰는 공용 어휘.
 * 숫자를 직접 쓰지 말고 여기서 고른다(정책 간 비교가 의미를 갖도록).
 */
export const BOT_WEIGHT = {
  /** 지금 화료가 걸렸다 / 역만이 확정된다 — 놓치면 국이 끝난다 */
  win: 90,
  /** 방총·즉사를 막는다. 위협이 실재할 때만 이 값을 쓴다 */
  defend: 75,
  /** 손이 실제로 전진한다 (텐파이·대기 개선) */
  advance: 60,
  /** 특별히 급하지 않은 평시 발동 */
  normal: 50,
  /** 나중을 위한 포석 (자원 적립·조건 세팅) */
  setup: 35,
  /** 정보만 얻는다 — 늦게 써도 손해가 거의 없다 */
  info: 20,
} as const;

export const TIER_LAYER: Record<AugmentTier, RuleLayer> = {
  silver: RuleLayer.Silver,
  gold: RuleLayer.Gold,
  prism: RuleLayer.Prism,
};

/**
 * 훅 등록 시 합성 순서를 직접 지정하는 옵션.
 *
 * 기본값은 `layer = 증강의 tier`, `priority = 0`이다 — 그러면 실행 순서가 tier와
 * **드래프트 픽 순서**에 끌려간다. 여러 증강이 같은 이벤트를 이어서 고쳐 쓰는 경우
 * (특히 ROUND_SETTLED의 deltas) 그 순서가 곧 결과이므로 명시해야 한다.
 * 정산 인터셉터는 직접 쓰지 말고 `settleInterceptor`(content/util) 헬퍼를 쓴다 —
 * 단계 정의는 `settleStages.ts`가 단일 진실이다.
 */
export interface EffectOptions {
  /** 합성 레이어. 생략하면 증강의 tier에서 나온 layer */
  layer?: RuleLayer;
  /** 같은 layer 내 세부 순서 (작을수록 먼저). 생략 시 0 */
  priority?: number;
}

/** install이 받는 도구 상자. 뒤에서 전부 source=instanceId로 등록된다 */
export interface AugmentContext {
  holder: PlayerId;
  /** 이 증강의 id (instanceId에서 파싱하지 않아도 되게 그대로 준다) */
  augmentId: string;
  instanceId: string;
  layer: RuleLayer;
  engine: GameEngine;
  /**
   * 역 레지스트리 — 새 역 등록·기존 역 교체용.
   * StandardGame 경로(DraftController·리플레이 재구성)에서는 항상 제공된다.
   */
  yaku?: YakuRegistry;

  /** 보유자에게만 규칙 값을 고정한다 (다른 플레이어는 원래 값) */
  setHolderRule(rule: string, value: unknown): void;
  /** 이벤트 후 반응 (새 이벤트 방출) */
  reaction(on: string, react: Reaction<GameState>, opts?: EffectOptions): void;
  /** 이벤트를 수정·취소·대체 */
  interceptor(
    on: string,
    intercept: Interceptor<GameState>,
    opts?: EffectOptions,
  ): void;
  /**
   * 보유자의 턴에 추가 선택지를 프롬프트에 노출한다.
   * build는 후보 목록을 만들고, FlowController가 각 후보를 validate로 걸러 제시한다.
   * (새 액션 자체는 engine.actions.register로 별도 등록해야 한다)
   */
  holderTurnOptions(
    build: (state: GameState) => { type: string; payload: unknown }[],
  ): void;
  /**
   * 보유자에게 **리액션(후로) 프롬프트**의 추가 선택지를 노출한다.
   * `holderTurnOptions`의 리액션판 — 우는 국사·허장성세·묵계처럼 남의 버림에 반응하는
   * 커스텀 콜이 쓴다.
   *
   * ⚠ `engine.registerReactionOptions`를 직접 부르지 말 것. 그 경로에는 **무장해제 게이트가
   * 없어**, 잠긴 증강의 콜 버튼이 그대로 뜨고 제출까지 통과한다(2026-07-29 감사에서
   * 3종 전부 확인). 이 헬퍼는 `holderTurnOptions`와 같은 `isSourceDisarmed` 가드를 건다.
   */
  holderReactionOptions(
    build: (
      state: GameState,
      discard: { player: PlayerId; tileId: number },
    ) => { type: string; payload: unknown }[],
  ): void;

  /**
   * 이 증강이 파괴될 때(`uninstallAugment`) 실행할 정리 훅.
   *
   * 코어가 소유한 등록(규칙·효과·옵션 프로바이더)은 자동으로 지워지므로 여기 쓸 필요가
   * 없다. **코어가 모르는 곳**에 심어 둔 것 — 커스텀 역의 보유자 집합(`yakuHolders`)처럼
   * 게임 스코프에 남는 것 — 을 걷어내는 통로다.
   */
  onUninstall(cleanup: () => void): void;

  /**
   * **다른 증강을 보유자에게 지급한다** (지급형 증강 전용 — 화수분).
   *
   * `pick`은 지급 가능한 후보(보유 중인 것과 자기 자신을 제외한 카탈로그 전체)를 받아
   * 지급할 것을 고른다. 선택은 **상태에서 파생된 결정론적 난수**로 해야 한다
   * (리플레이·재개에서 같은 결과가 나와야 하므로 Math.random 금지).
   *
   * 지급은 **한 인스턴스당 한 번**이다 — 결과가 `augmentGrantKey`로 상태에 남아,
   * 재구성(rebuildAugments)에서 install이 다시 불려도 다시 뽑지 않는다.
   * 카탈로그를 넘기지 않은 경로(최소 테스트 게임)에서는 아무 일도 하지 않는다.
   */
  grantAugments(pick: (available: readonly AugmentDef[]) => readonly AugmentDef[]): void;
}

export interface AugmentDef {
  id: string;
  tier: AugmentTier;
  /** 계열 — 표시·연출 분류의 단일 진실. AugmentCategory 주석 참고 */
  category: AugmentCategory;
  /**
   * 이해 난도 1~3 — 첫 드래프트 제외 판단에 쓴다. `AugmentComplexity` 주석 참고.
   * 생략하면 2(보통)로 본다. 새 증강은 반드시 자기 파일에 선언한다(커버리지 테스트가 강제).
   */
  complexity?: AugmentComplexity;
  name: string;
  description: string;
  /**
   * 증강 도감(Codex)에 노출되는 상세 설명. 한 줄 요약인 description과 달리
   * 작동 원리·전략 팁·주의점을 자유 서술한다(여러 문단 허용, 표시용). 생략 가능 —
   * 엔진/드래프트 로직은 이 필드를 읽지 않는다. 카탈로그를 통해 클라이언트에만 전달된다.
   */
  detail?: string;
  /**
   * 이 증강이 제시될 수 있는 드래프트 스테이지 제한.
   * 생략하면 모든 스테이지에서 제시된다. (예: 게임 전체에 걸쳐 성장해야
   * 의미가 있는 증강은 ["gameStart"]로 제한한다)
   */
  draftStages?: readonly import("./DraftController.js").DraftStage[];
  /**
   * 이 증강이 제시될 수 있는 게임 모드 제한.
   * 생략하면 모든 모드에서 제시된다. 게임 진행 길이(장 수)에 의존하는 템포 증강은
   * 모드별로 다른 변형이 필요하므로, 반장전 전용은 ["hanchan"], 동풍전 전용은
   * ["tonpuu"]로 잠근다. (같은 이름·다른 id의 변형을 각 모드에 하나씩 둔다)
   */
  modes?: readonly GameMode[];
  /**
   * 이 증강과 **동시에 보유할 수 없는** 증강 id 목록 (상호 배제).
   * 드래프트에서, 한쪽을 이미 가진 플레이어에겐 다른 쪽을 제시하지 않는다.
   * 관계는 **대칭**이다 — 한쪽에만 선언해도 양방향 모두 배제된다
   * (DraftController.excludeFor가 두 방향을 함께 본다).
   *
   * 용례: 화료형·손패 장수를 통째로 바꾸는 증강이 다른 특수형을 무력화하거나
   * 소프트락시킬 때. 예: 진짜 용(5멘쯔·17장)은 국사·치토이·구련(14장/4멘쯔 전제)을
   * 전부 죽이므로 그 증강들을 conflicts로 잠근다.
   */
  conflicts?: readonly string[];
  /**
   * 봇(AI)이 이 증강의 액티브 액션을 상황에 맞게 발동하는 정책 (선택).
   * 생략하면 봇은 이 증강을 드래프트에서 뽑아도 게임 중 발동하지 않는다.
   * 정책은 순수 함수여야 한다(부수효과 금지) — BotAgent가 뷰만 넘겨 판단을 위임한다.
   */
  bot?: AugmentBotPolicy;
  install(ctx: AugmentContext): void;
}

const ID_PATTERN = /^[a-z0-9_]+$/;

export function defineAugment(def: AugmentDef): AugmentDef {
  if (!ID_PATTERN.test(def.id)) {
    throw new Error(`Augment id must be snake_case: ${def.id}`);
  }
  if (!(def.tier in TIER_LAYER)) {
    throw new Error(`Unknown augment tier: ${def.tier}`);
  }
  if (!AUGMENT_CATEGORIES.includes(def.category)) {
    throw new Error(`Unknown augment category: ${def.category} (${def.id})`);
  }
  if (def.complexity !== undefined && ![1, 2, 3].includes(def.complexity)) {
    throw new Error(`Augment complexity must be 1~3: ${def.complexity} (${def.id})`);
  }
  return def;
}

export function augmentInstanceId(holder: PlayerId, augmentId: string): string {
  return `aug:${holder}:${augmentId}`;
}

/** installAugment에 넘길 수 있는 부가 도구 (StandardGame이 제공) */
export interface AugmentExtras {
  yaku?: YakuRegistry;
  /**
   * 증강 카탈로그 — 지급형 증강(`ctx.grantAugments`)이 후보를 고를 때 쓴다.
   * 없으면 지급은 조용히 no-op이다.
   */
  catalog?: {
    all(): readonly AugmentDef[];
    get(id: string): AugmentDef | undefined;
  };
}

/** 획득 시 증강 능력을 엔진 Registry에 등록한다 (부수효과 — DraftController가 호출) */
export function installAugment(
  engine: GameEngine,
  def: AugmentDef,
  holder: PlayerId,
  extras: AugmentExtras = {},
): void {
  const instanceId = augmentInstanceId(holder, def.id);
  const layer = TIER_LAYER[def.tier];
  const ctx: AugmentContext = {
    holder,
    augmentId: def.id,
    instanceId,
    layer,
    engine,
    ...(extras.yaku !== undefined ? { yaku: extras.yaku } : {}),
    setHolderRule(rule, value) {
      engine.rules.addModifier(rule, {
        source: instanceId,
        layer,
        apply: (current, c) => (c.playerId === holder ? value : current),
      });
    },
    reaction(on, react, opts) {
      engine.effects.register({
        source: instanceId,
        layer: opts?.layer ?? layer,
        on,
        react,
        ...(opts?.priority !== undefined ? { priority: opts.priority } : {}),
      });
    },
    interceptor(on, intercept, opts) {
      engine.effects.register({
        source: instanceId,
        layer: opts?.layer ?? layer,
        on,
        intercept,
        ...(opts?.priority !== undefined ? { priority: opts.priority } : {}),
      });
    },
    holderTurnOptions(build) {
      engine.registerTurnOptions((state, player) => {
        if (player !== holder) return [];
        // 무장해제: 잠긴 증강은 액티브 버튼도 사라진다. FlowController가 제시되지
        // 않은 옵션의 submit을 거부하므로, 여기서 후보를 비우면 액션도 함께 막힌다.
        if (isSourceDisarmed(state, instanceId)) return [];
        return build(state);
      }, instanceId);
    },
    holderReactionOptions(build) {
      engine.registerReactionOptions((state, player, discard) => {
        if (player !== holder) return [];
        // holderTurnOptions와 동일한 무장해제 가드 — 잠기면 콜 버튼도 함께 사라진다
        if (isSourceDisarmed(state, instanceId)) return [];
        return build(state, discard);
      }, instanceId);
    },
    onUninstall(cleanup) {
      engine.registerUninstallHook(instanceId, cleanup);
    },
    grantAugments(pick) {
      const catalog = extras.catalog;
      if (catalog === undefined) return;
      // 이미 지급 이력이 있으면(재구성) 다시 뽑지 않는다 — 지급된 증강은
      // player.augments에 남아 있어 rebuildAugments가 알아서 재설치한다.
      if (engine.state.augmentData[augmentGrantKey(holder, def.id)] !== undefined) {
        return;
      }
      const held = new Set(
        engine.state.players.find((p) => p.id === holder)?.augments ?? [],
      );
      // 상호 배제(conflicts)는 지급에서도 지킨다 — 드래프트에서 못 만나게 막아 둔 조합이
      // 지급으로 뚫리면 손패 장수·화료형이 어긋나 그 국이 통째로 벽돌이 된다.
      const forbidden = new Set<string>();
      for (const id of held) {
        for (const c of catalog.get(id)?.conflicts ?? []) forbidden.add(c);
      }
      const mode = engine.state.config.mode ?? "hanchan";
      const available = catalog
        .all()
        .filter(
          (d) =>
            d.id !== def.id &&
            !held.has(d.id) &&
            !forbidden.has(d.id) &&
            !(d.conflicts ?? []).some((c) => held.has(c)) &&
            (d.modes === undefined || d.modes.includes(mode)),
        );
      const chosen = pick(available);
      const augmentIds = [...new Set(chosen.map((d) => d.id))];
      const res = engine.submit({
        player: holder,
        type: "augmentGrant",
        payload: { by: def.id, augmentIds },
      });
      if (!res.ok) return;
      for (const id of augmentIds) {
        const granted = catalog.get(id);
        if (granted !== undefined) installAugment(engine, granted, holder, extras);
      }
    },
  };
  def.install(ctx);
}

/**
 * 증강 파괴 시 그 인스턴스가 남긴 등록을 한 번에 걷어낸다 (증강 파괴/교체 계열용).
 *
 * 지우는 것 — 규칙 모디파이어, 효과(reaction/interceptor), 턴·리액션 옵션 프로바이더,
 * 그리고 증강이 `ctx.onUninstall`로 등록해 둔 정리 훅(커스텀 역 보유자 집합 등).
 *
 * **일부러 남기는 것**:
 *  - `engine.actions`에 등록된 액션 타입 — 게임당 1회 등록이라 같은 증강을 든 다른
 *    사람의 것까지 함께 지워진다. 액션의 validate가 `player.augments.includes(id)`를
 *    보므로, 보유 목록에서 빠지면 그대로 무력해진다.
 *  - `engine.reducers`에 등록된 이벤트 리듀서 — 지나간 이벤트를 다시 적용하는
 *    리플레이·resume이 이 리듀서를 필요로 한다. 지우면 과거 기록을 못 읽는다.
 *
 * ⚠ 호출자는 **`player.augments`에서 그 id를 빼는 일까지** 해야 한다. 이 함수는
 * 등록만 걷어내고 상태는 건드리지 않는다(상태 변경은 이벤트로만 한다는 규약).
 */
export function uninstallAugment(
  engine: GameEngine,
  def: AugmentDef,
  holder: PlayerId,
): void {
  const instanceId = augmentInstanceId(holder, def.id);
  engine.rules.removeBySource(instanceId);
  engine.effects.removeBySource(instanceId);
  engine.removeOptionProvidersBySource(instanceId);
  engine.runUninstallHooks(instanceId);
}
