/**
 * 증강 시너지 — **드래프트 편향의 단일 진실**.
 *
 * 목적: 이미 집은 증강과 **결이 맞는 증강이 다음 드래프트에 더 자주 뜨게** 한다.
 * 리치를 먼저 집었으면 리치를 키우는 것들이, 깡을 집었으면 깡·도라가 조금 더 자주 온다 —
 * "한 게임에 하나의 빌드를 완성한다"는 감각을 만드는 장치다.
 *
 * **최신성(2026-08-17)**: 보유 전부가 같은 무게로 끄는 게 아니라, **가장 최근에 고른
 * 증강이 가장 세게** 끈다(`SYNERGY_RECENCY_DECAY`, 한 칸 예전마다 ×0.5). 첫 픽으로
 * 화료형을 잡으면 화료형이 따라오고, 두 번째로 노선을 갈아타면 세 번째 제시는 곧바로
 * 새 노선 쪽으로 기운다 — 예전 픽도 계속 영향을 주되 주도권은 최근 픽에 있다.
 * 상한이 있어(`SYNERGY_MAX_BONUS`) 어디까지나 "확률업"이고, 무엇도 확정되지 않는다.
 *
 * 설계·전수조사 결과 전문은 **docs/26_AUGMENT_SYNERGY.md**. 이 파일은 그 문서의
 * 기계가 읽는 사본이다.
 *
 * ## 세 가지 관계만 있다
 *
 * - `tags` — 이 증강이 노는 축. **겹치는 축이 많을수록** 드래프트 가중치가 오른다.
 * - `anti` — 이 축의 증강과는 서로 죽는다(축 단위). 겹치면 가중치가 **내려간다.**
 * - `antiIds` — 특정 상대와만 죽는(또는 **함께 뜨면 게임이 부서지는**) 짝. 개별 지정.
 *
 * 관계는 **대칭으로 평가한다** — 한쪽에만 적어도 양방향으로 작동한다
 * (`synergyBias`가 두 방향을 함께 본다). `conflicts`(상호 배제)와 달리 여기는
 * **확률만 기울인다** — 무엇도 완전히 막지 않는다. 진짜로 같이 들면 안 되는 것은
 * 지금처럼 `AugmentDef.conflicts`로 잠근다.
 *
 * ## 스텔스 리치가 이 설계의 이유다
 *
 * "리치 계열"을 한 덩어리로 묶으면 스텔스 리치 보유자에게 **자기 은닉을 깨는 리치 증강**이
 * 더 자주 뜬다 — 정확히 반대로 가는 것이다. 그래서 리치 축을 넷으로 쪼갰다:
 * `riichi`(선언 자체) · `riichi_value`(리치 화료의 값) · `riichi_open`(내 리치를 전원에 공개) ·
 * `riichi_deny`(상대 리치 봉쇄, 공개 배너를 동반) · `opp_riichi`(상대의 리치를 이용).
 * 스텔스 리치는 `riichi_open`·`riichi_deny`를 `anti`로 들고 있어, 값을 키우는 쪽만 당겨오고
 * 드러내는 쪽은 밀어낸다. (docs/21 §C-1 — 가장 심한 6종은 이미 `conflicts`로 잠겨 있다.)
 *
 * ## 새 증강을 추가할 때
 * 여기 행을 같은 커밋에서 채운다. 누락되면 커버리지 테스트가 깨진다
 * (`core/test/Synergy.test.ts` — 카탈로그와 실시간 대조).
 */

/**
 * 시너지 축 — "이 증강은 무엇을 하려고 하는가".
 *
 * `AugmentCategory`(표시용 계열)와 다르다. 계열은 "무엇을 건드리는가"이고,
 * 여기는 **"어떤 빌드에 들어가는가"** 다. 그래서 한 증강이 여러 축에 걸친다.
 */
export type SynergyTag =
  /** 리치를 선언한다·리치 선언 자체의 조건을 건드린다 */
  | "riichi"
  /**
   * **자기만의 리치 선언 버튼을 낸다** — 국당 하나만 쓸 수 있으므로 서로 죽는다.
   *
   * 리치는 국당 한 번이다. 이 축의 카드를 둘 이상 들면 텐파이 순간 버튼이 나란히 뜨고
   * 하나를 쓰는 순간 나머지는 그 국 내내 사라진다 — 카드 어디에도 그런 말이 없고
   * `conflicts`도 없다(2026-08-23 QA synergy3 riichi 확정 9). 그런데 다섯 장 전부
   * `riichi` 축을 달고 있어 시너지 표가 오히려 **중복 카드를 몰아 줬다.**
   * 이 축은 자기 자신에게 `anti`라 서로를 밀어낸다.
   */
  | "riichi_declare"
  /** 리치 화료의 값을 키운다 (뒷도라·리치 판수·일발) */
  | "riichi_value"
  /** 내가 리치라는 사실을 전원에게 드러낸다 (스텔스의 반대축) */
  | "riichi_open"
  /** 상대의 리치를 봉쇄한다 (공개 배너를 동반한다) */
  | "riichi_deny"
  /** 상대가 리치를 걸어야 이득이 난다 */
  | "opp_riichi"
  /** 멘젠(문전 청) 유지가 전제이거나 멘젠을 되찾아 준다 */
  | "menzen"
  /** 후로(치·펑·대명깡)를 넓히거나 후로한 손을 살린다 */
  | "call"
  /** 깡을 기반으로 한다 */
  | "kan"
  /** 도라를 늘린다·도라 정보를 다룬다 */
  | "dora"
  /** 판수·배수로 타점을 직접 키운다 */
  | "han"
  /** 상대에게서 빼앗는 게 아니라 **뱅크가 발행하는** 큰 점수 */
  | "bank"
  /** 역만을 노린다 */
  | "yakuman"
  /** 국사무쌍 */
  | "kokushi"
  /** 치또이쯔 */
  | "chiitoi"
  /** 한 색으로 모은다 (청일·혼일) */
  | "suit"
  /** 자패를 자원으로 쓴다 */
  | "honor"
  /** 요구패(1·9)를 자원으로 쓴다 */
  | "terminal"
  /** 탕야오(2~8) 쪽으로 손을 민다 */
  | "tanyao"
  /** 화료형(멘쯔 구성) 자체를 넓힌다 */
  | "shape"
  /** 화료 제약(후리텐·역 필요)을 푼다 */
  | "relax_win"
  /** 손패를 직접 고쳐 만든다 */
  | "hand_edit"
  /** 패산·왕패·다음 쯔모를 본다·고른다 */
  | "wall_info"
  /** 상대의 손·텐파이·대기를 본다 */
  | "opp_info"
  /** 버림패(내 바닥·남의 바닥)를 자원으로 쓰거나 가린다 */
  | "river"
  /** 실점을 막는다 */
  | "defense"
  /** 크게 잃을수록 이득이 난다 */
  | "loss_gain"
  /** 지불의 방향·분담 구조를 바꾼다 */
  | "payout"
  /** 유국(황패·형식)을 이득으로 만든다 */
  | "draw"
  /** 오야(친) 자리를 자원으로 쓴다 */
  | "dealer"
  /** 순번·속도·추가 쯔모 */
  | "tempo"
  /** 상대를 직접 방해한다 */
  | "disrupt"
  /** 상대 점수를 가져온다 */
  | "steal";

/** 축 한 줄 정의 (문서·관리자 화면용) */
export const SYNERGY_TAG_LABEL: Readonly<Record<SynergyTag, string>> = {
  riichi: "리치 선언",
  riichi_declare: "전용 리치 선언",
  riichi_value: "리치 타점",
  riichi_open: "리치 공개",
  riichi_deny: "리치 봉쇄",
  opp_riichi: "상대 리치 이용",
  menzen: "멘젠 유지",
  call: "후로",
  kan: "깡",
  dora: "도라",
  han: "판수·배수",
  bank: "뱅크 발행 대점수",
  yakuman: "역만",
  kokushi: "국사무쌍",
  chiitoi: "치또이쯔",
  suit: "색 모으기",
  honor: "자패",
  terminal: "요구패",
  tanyao: "탕야오",
  shape: "화료형 확장",
  relax_win: "화료 제약 해제",
  hand_edit: "손패 조작",
  wall_info: "패산·왕패 정보",
  opp_info: "상대 정보",
  river: "버림패 활용",
  defense: "수비",
  loss_gain: "실점 역이용",
  payout: "지불 구조",
  draw: "유국",
  dealer: "오야",
  tempo: "템포",
  disrupt: "방해",
  steal: "점수 강탈",
};

export interface SynergyEntry {
  /** 이 증강이 노는 축 */
  tags: readonly SynergyTag[];
  /** 이 축의 증강과는 서로 죽는다 */
  anti?: readonly SynergyTag[];
  /** 특정 상대와만 죽거나, 함께 뜨면 게임이 부서지는 짝 */
  antiIds?: readonly string[];
}

const e = (
  tags: readonly SynergyTag[],
  extra?: Omit<SynergyEntry, "tags">,
): SynergyEntry => ({ tags, ...extra });

/**
 * 증강 id → 시너지 관계. **카탈로그 전체를 덮는다**(표준 증강 4종 포함).
 *
 * 항목 순서는 축(빌드)별로 묶었다 — 표를 읽으며 "이 빌드에 무엇이 있는가"를 볼 수 있게.
 */
export const AUGMENT_SYNERGY: Readonly<Record<string, SynergyEntry>> = {
  // ───────────────────────── 리치 빌드 ─────────────────────────
  // 값을 키우는 쪽(riichi_value)과 드러내는 쪽(riichi_open)을 일부러 갈라 놓았다.
  stealth_riichi: e(["riichi", "riichi_declare", "riichi_value", "menzen"], {
    anti: ["riichi_open", "riichi_deny", "riichi_declare"],
  }),
  // 2026-08-15: 손바닥 뒤집기와의 상호 무효(둘 다 riichi.cost 0)가 사라져 antiIds를 뺐다.
  no_retreat: e(["riichi", "riichi_declare", "riichi_value"], {
    anti: ["riichi_declare"],
  }),
  late_double: e(["riichi", "riichi_value", "menzen"]),
  free_riichi_discard: e(["riichi", "menzen"]),
  off_by_one: e(["riichi", "riichi_open", "shape"]),
  ura_peek: e(["riichi_value", "dora", "wall_info"]),
  soul_hunt: e(["riichi_value", "dora", "opp_riichi"]),
  hidden_blade: e(["menzen", "dora"], {
    // 리치를 걸지 않은 멘젠 론에만 붙는다 — 리치를 거는 증강과는 국마다 하나만 산다.
    anti: ["riichi"],
    antiIds: ["soul_hunt"], // scoring.uraWithoutRiichi 완전 중복 (docs/21 §C-4)
  }),
  soul_strike: e(["riichi", "riichi_declare", "riichi_value", "riichi_open", "tempo"], {
    anti: ["riichi_declare"],
  }),
  open_riichi_reveal: e(["riichi", "riichi_declare", "riichi_open"], {
    anti: ["riichi_declare"],
  }),
  all_or_nothing: e(["riichi", "riichi_declare", "riichi_open", "bank"], {
    anti: ["riichi_declare"],
  }),
  palm_flip: e(["riichi", "riichi_open"]),
  last_stand: e(["riichi", "defense"]),
  siege_riichi: e(["riichi", "disrupt"]),
  riichi_seal: e(["riichi", "riichi_deny", "riichi_open"], {
    anti: ["opp_riichi"], // 상대가 리치를 못 걸면 상대 리치를 먹는 증강이 죽는다
  }),
  riichi_upgrade: e(["riichi", "riichi_value", "riichi_deny"], {
    anti: ["opp_riichi"],
    antiIds: ["riichi_seal"], // riichi.blocked 중복 — 이중 선언의 봉인이 죽는다
  }),
  counter: e(["riichi", "opp_riichi", "bank", "disrupt"]),
  push_riichi: e(["opp_riichi", "disrupt"]),
  peek_riichi_waits: e(["opp_riichi", "opp_info"]),
  open_riichi: e(["riichi", "call"]),

  // ───────────────────────── 멘젠·후로 ─────────────────────────
  silent_pact: e(["call", "menzen", "riichi"]),
  meld_dissolve: e(["call", "menzen", "riichi"]),
  omni_chi: e(["call", "tempo"]),
  bluff_pretense: e(["call"]),
  pond_snatch: e(["river", "menzen"]),
  silent_swap: e(["river"]),
  discard_recall: e(["river"]),

  // ───────────────────────── 깡·도라 ─────────────────────────
  ankan_dora: e(["kan", "dora", "menzen"]),
  snake_kan: e(["kan", "dora"]),
  cliff_bloom: e(["kan", "wall_info"], {
    // 2026-08-23 QA synergy3 kandora 의심 2 — 둘 다 프리즘인데 함께 들면 **배패에서**
    // 연속 4장 두 벌만으로 만개 확정 화료가 선다(5/5, 그중 스안커 역만 1건).
    // 카드 문구는 서로 어긋나지 않으므로 동작은 그대로 두고, `kan` 축을 공유해
    // **오히려 함께 뜰 확률이 오르던 것**만 되돌린다("함께 뜨면 게임이 부서지는 짝").
    antiIds: ["snake_kan"],
  }),
  rinshan_preview: e(["kan", "wall_info"], { antiIds: ["dead_wall_master"] }),
  void_kan: e(["kan", "disrupt"]),
  dead_wall_master: e(["wall_info", "hand_edit"]),
  mirror_dora: e(["dora"]),
  dora_afterimage: e(["dora"]),
  red_five_touch: e(["dora"]),
  dora_conceal: e(["dora", "opp_info"]),
  north_trader: e(["dora", "honor"]),

  // ───────────────────────── 화료형 확장 ─────────────────────────
  broken_border: e(["shape", "call"]),
  mixed_triplet: e(["shape", "call"]),
  broken_wall: e(["shape", "terminal"]),
  polar_ends: e(["shape", "terminal"]),
  wind_lineage: e(["shape", "honor"]),
  // 조커 — 백 한 장이 어떤 몸통·머리도 된다. 자패를 자원으로 쓰고 화료형을 넓힌다
  joker: e(["shape", "honor", "hand_edit"]),
  async_chiitoi: e(["chiitoi", "shape", "menzen"]),
  true_dragon: e(["shape"]),
  tanyao_break: e(["tanyao"]),
  even_world: e(["hand_edit", "tanyao"]),

  // ───────────────────────── 역만 ─────────────────────────
  royal_kokushi: e(["kokushi", "shape", "terminal"]),
  open_kokushi: e(["kokushi", "call", "yakuman", "terminal"]),
  giant_god: e(["kokushi", "yakuman", "hand_edit"]),
  mixed_nine_gates: e(["yakuman", "suit", "shape"]),
  three_dragons_will: e(["yakuman", "honor", "hand_edit"]),
  genesis: e(["hand_edit", "honor", "yakuman"]),
  yakuman_shield: e(["defense"]),

  // ───────────────────────── 색·손패 조작 ─────────────────────────
  suit_unify: e(["hand_edit", "suit"]),
  tile_dyeing: e(["hand_edit", "suit"]),
  picky_eater: e(["suit", "hand_edit", "river"]),
  alchemist: e(["hand_edit"]),
  tile_split: e(["hand_edit"]),
  conjure_draw: e(["hand_edit", "wall_info"]),
  table_flip: e(["hand_edit"]),
  take_back: e(["tempo"]),
  honor_return: e(["honor", "river"]),
  full_hand_swap: e(["hand_edit", "opp_info"]),
  hand_swap3: e(["hand_edit", "opp_info"]),
  grave_rob: e(["river"]),

  // ───────────────────────── 정보 ─────────────────────────
  foresight: e(["wall_info"]),
  triple_peek: e(["wall_info"]),
  bottom_deal: e(["wall_info", "tempo"]),
  future_sight: e(["hand_edit", "wall_info"]),
  xray_hand: e(["opp_info"]),
  tenpai_scan: e(["opp_info", "defense"]),
  danger_sense: e(["opp_info", "defense"]),
  hidden_river: e(["river", "opp_info"], { antiIds: ["brief_fog"] }),
  brief_fog: e(["river", "opp_info"]),

  // ───────────────────────── 화료 제약 해제 ─────────────────────────
  iron_wall: e(["relax_win"]),
  yakuless_win: e(["relax_win"]),
  late_bloomer: e(["relax_win", "shape"]),
  late_bloomer_east: e(["relax_win", "shape"]),
  avenger: e(["relax_win", "loss_gain"]),

  // ───────────────────────── 타점·정산 ─────────────────────────
  aotenjou_ceiling: e(["han", "bank"], {
    // docs/21 §B-1 — 판수 증강과 겹치면 한 국 수백만 점. 같이 뜨는 것을 눌러 둔다.
    antiIds: [
      "ankan_dora",
      "north_trader",
      "no_retreat",
      "riichi_upgrade",
      "counter",
      "true_dragon",
    ],
  }),
  unification: e(["bank", "han"], {
    // docs/21 §B-2 — 뱅크 발행 증강과 겹치면 첫 국에 매치가 끝난다.
    antiIds: [
      "aotenjou_ceiling",
      "jackpot",
      "big_hand",
      "all_or_nothing",
      "devils_advance",
      "counter",
    ],
  }),
  big_hand: e(["han", "bank"]),
  jackpot: e(["han", "bank"]),
  devils_advance: e(["bank", "han"]),
  blood_contract: e(["han"]),
  let_it_ride: e(["han"]),
  bottom_yaku: e(["river"]),
  haitei_lord: e(["draw"]),
  honba_hunter: e(["dealer", "han"]),
  eternal_dealer: e(["dealer", "han"]),
  pseudo_dealer: e(["dealer", "disrupt"]),

  // ───────────────────────── 수비·역이용 ─────────────────────────
  invincible: e(["defense"], { antiIds: ["no_ron_pact"] }),
  no_ron_pact: e(["defense", "menzen"], {
    // 리치·후로 순간 파기된다 — 그 둘을 요구하는 증강과는 서로 죽는다.
    anti: ["call", "riichi"],
  }),
  die_hard: e(["loss_gain"], {
    // docs/21 §C-3 — 수비가 성공할수록 죽기살기의 수익이 0에 수렴한다.
    anti: ["defense"],
  }),
  sign_flip: e(["loss_gain", "payout"]),
  karma: e(["steal", "loss_gain"]),

  // ───────────────────────── 유국 ─────────────────────────
  always_tenpai: e(["draw", "defense"]),
  nagashi_yakuman: e(["draw", "yakuman", "terminal", "river"]),
  hourglass: e(["draw", "tempo"]),
  regret: e(["draw", "menzen", "tempo"]),

  // ───────────────────────── 지불·강탈 ─────────────────────────
  blame_shift: e(["payout"]),
  scapegoat: e(["payout", "disrupt"]),
  blind_ron: e(["payout", "disrupt"]),
  parasite: e(["steal", "disrupt"]),
  spy: e(["steal", "disrupt"]),

  // ───────────────────────── 방해·템포 ─────────────────────────
  disarm: e(["disrupt"]),
  call_seal: e(["disrupt"]),
  discard_lock: e(["disrupt"]),
  rank_gate: e(["disrupt"]),
  frame_up: e(["river", "disrupt"]),
  seat_swap: e(["disrupt", "dealer"]),
  time_stop: e(["tempo"]),
  time_pressure: e(["disrupt", "tempo"]),

  // ───────────────────────── 축이 없는 것 ─────────────────────────
  // 모든 빌드에 똑같이 어울려 축을 매기면 오히려 왜곡된다 — 균등하게 둔다.
  reload: e([]),
  cornucopia: e([]),
};

/** 축 하나가 겹칠 때(가장 최근 픽 기준) 오르는 폭 — 1.0이면 배수 2.0이 된다 */
/**
 * **자기 자신을 anti로 두는 축** — "이 부류는 한 게임에 하나만 산다".
 *
 * 보통은 축을 자기 anti에 넣지 않는다(그러면 자기를 누르는 셈이다). 예외는 카드끼리
 * **자원이 겹쳐 서로를 죽이는** 부류다 — `riichi_declare`가 그렇다: 리치는 국당 한 번이라
 * 전용 선언 버튼이 둘이면 하나는 늘 논다. 보유는 이미 후보에서 빠지므로(`heldSet`)
 * 자기 자신이 눌리는 일은 없고, **같은 부류의 다른 카드만** 밀어낸다.
 */
export const SELF_ANTI_TAGS: readonly SynergyTag[] = ["riichi_declare"];

export const SYNERGY_PER_TAG = 1.0;

/** 시너지 배수의 상한. 아무리 겹쳐도 여기서 멈춘다 — "확률업"이지 확정이 아니다 */
export const SYNERGY_MAX_BONUS = 4.0;

/**
 * **최신성 감쇠** — 한 칸 예전에 집은 증강의 영향력 배수(2026-08-17).
 *
 * 드래프트가 "연계되는 느낌"을 주려면 **방금 고른 것**이 다음 제시를 가장 크게 끌어야 한다.
 * 가장 최근 픽이 1.0, 그 앞이 0.5, 그 앞이 0.25 … 로 줄어든다 — 예전 픽도 계속 영향을
 * 주지만(합산된다) 노선을 갈아타면 새 노선이 곧바로 주도권을 갖는다.
 *
 * **0.5인 이유는 감각뿐이 아니다**: 2의 거듭제곱이라 부동소수 오차가 없다. 이 값이 곧
 * 드래프트 가중치 눈금(`AugmentRegistry.pickWeighted`, ×100 반올림)에 들어가므로,
 * 오차 없는 값이어야 리플레이·재계산이 플랫폼을 건너 같은 결과를 낸다.
 */
export const SYNERGY_RECENCY_DECAY = 0.5;

/** 역시너지(축 또는 개별 지정)일 때의 배수 — 보너스를 무조건 이긴다 */
export const SYNERGY_PENALTY = 0.25;

/** 겹침 점수(가중 합)에 대한 배수. 0이면 1.0(그대로), 상한에서 멈춘다. */
export function synergyBonusFor(shared: number): number {
  return Math.min(1 + SYNERGY_PER_TAG * shared, SYNERGY_MAX_BONUS);
}

/**
 * 보유 증강별 **최신성 가중치** — 마지막 원소(가장 최근 픽)가 1.0, 앞으로 갈수록 감쇠.
 * `held`는 픽 순서로 쌓인 목록이다(`player.augments`).
 */
function recencyWeights(held: readonly string[]): number[] {
  const last = held.length - 1;
  return held.map((_, i) => SYNERGY_RECENCY_DECAY ** (last - i));
}

/**
 * 보유 증강 목록으로부터 **증강 id → 드래프트 가중치 배수**를 만든다.
 *
 * `held`는 **픽 순서**로 주어야 한다 — 뒤쪽(최근)일수록 크게 반영된다
 * (`SYNERGY_RECENCY_DECAY`). 첫 증강으로 화료형 계열을 집으면 그 축이 다음 제시를
 * 끌어올리고, 두 번째로 다른 축을 집으면 세 번째 제시는 **그 두 번째 쪽으로** 더 기운다.
 *
 * - 축이 겹칠 때마다 `그 보유의 최신성 가중치`만큼 점수가 쌓이고, 배수는
 *   `1 + 점수`(상한 `SYNERGY_MAX_BONUS`)다. 같은 축을 여러 장 들고 있으면 합산돼
 *   더 세게 끌린다.
 * - 배수가 1.0인 항목은 넣지 않는다(호출자는 `?? 1`로 읽는다).
 * - 이미 보유한 것은 넣지 않는다(어차피 제외된다).
 * - 역시너지는 보너스를 이긴다 — 축이 셋 겹쳐도 anti 하나면 0.25다. **역시너지는
 *   감쇠하지 않는다**: "함께 들면 서로 죽는다"는 언제 집었는지와 무관하기 때문이다.
 *
 * 결정적이다(입력이 같으면 출력이 같다). 순수 함수라 드래프트 밖에서도 안전하다.
 *
 * ## 카탈로그의 `conflicts` 와 어긋나면 안 된다 (2026-08-22)
 *
 * 함께 **가질 수 없는** 쌍에 «함께 오면 좋다»는 ×2~×3 가중치가 붙어 있었다 —
 * 실측 10쌍(QA 2차 synergy 확정 3). 그 카드는 `excludeFor`가 어차피 후보에서
 * 지우므로 화면에 오지는 않지만, **두 표가 서로 반대를 말한다**는 것이 문제다:
 * 다음 사람이 어느 쪽을 믿어야 할지 알 수 없고, 끌어올린 가중치는 도달할 수 없는
 * 카드에 버려진다. 그래서 배타 관계를 아는 쪽(카탈로그)이 `conflictsOf`로 알려
 * 주면 여기서 그 항목을 아예 빼 준다 — 두 표를 손으로 맞춰 두면 언젠가 또 갈린다.
 */
export function synergyBias(
  held: readonly string[],
  /** id → 그 증강이 배타하는 id들 (카탈로그가 안다). 없으면 검사하지 않는다. */
  conflictsOf?: (id: string) => readonly string[],
): Readonly<Record<string, number>> {
  if (held.length === 0) return {};

  const weights = recencyWeights(held);
  const heldSet = new Set(held);
  /** 축 → 최신성 가중 합. 최근에 민 축일수록 크다. */
  const tagWeight = new Map<SynergyTag, number>();
  const heldAnti = new Set<SynergyTag>();
  const heldAntiIds = new Set<string>();
  held.forEach((id, i) => {
    const entry = AUGMENT_SYNERGY[id];
    if (entry === undefined) return; // 표에 없는 id는 축이 없는 것으로 본다
    const w = weights[i] as number;
    for (const t of entry.tags) tagWeight.set(t, (tagWeight.get(t) ?? 0) + w);
    for (const t of entry.anti ?? []) heldAnti.add(t);
    for (const other of entry.antiIds ?? []) heldAntiIds.add(other);
  });

  /** 보유 증강과 **함께 가질 수 없는** id — 어느 방향이든 배타면 대상이다. */
  const conflicting = new Set<string>();
  if (conflictsOf !== undefined) {
    for (const id of held) for (const c of conflictsOf(id)) conflicting.add(c);
  }

  const out: Record<string, number> = {};
  for (const [id, entry] of Object.entries(AUGMENT_SYNERGY)) {
    if (heldSet.has(id)) continue;
    // 애초에 함께 가질 수 없는 카드는 끌어올릴 것도 눌러 둘 것도 없다.
    if (
      conflicting.has(id) ||
      (conflictsOf !== undefined && conflictsOf(id).some((c) => heldSet.has(c)))
    ) {
      continue;
    }

    // 역시너지 — 네 방향 중 하나라도 걸리면 눌린다(관계는 대칭).
    const anti =
      heldAntiIds.has(id) ||
      (entry.antiIds ?? []).some((other) => heldSet.has(other)) ||
      entry.tags.some((t) => heldAnti.has(t)) ||
      (entry.anti ?? []).some((t) => tagWeight.has(t));
    if (anti) {
      out[id] = SYNERGY_PENALTY;
      continue;
    }

    const shared = entry.tags.reduce((sum, t) => sum + (tagWeight.get(t) ?? 0), 0);
    if (shared > 0) out[id] = synergyBonusFor(shared);
  }
  return out;
}
