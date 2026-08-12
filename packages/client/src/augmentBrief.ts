/**
 * 증강 한 줄 요약 — 게임 화면에 **기본으로** 뜨는 설명.
 *
 * 설명이 세 겹이라는 것만 기억하면 된다.
 *
 * | 층 | 내용 | 사는 곳 |
 * |----|------|---------|
 * | 요약 | "이게 뭘 하는 증강인가" 딱 한 문장 | **이 파일** |
 * | 설명 | 조건·예외까지 포함한 정식 문장 | `AugmentDef.description` |
 * | 상세 | 작동 원리·전략·주의점 | `AugmentDef.detail` |
 *
 * **어느 층을 펼치는지는 화면마다 다르다** (`AugmentDescVariant`). 요약은 어디서나 늘 보이고,
 * 그 아래 펼쳐지는 것만 갈린다.
 *
 * | 화면 | 펼쳤을 때 | 왜 |
 * |------|-----------|-----|
 * | 드래프트 카드·인게임 이름표 툴팁 (`"draft"`) | 요약 + **설명** | 판 중에 몇 초 안에 고르는 자리다. 상세는 길어서 방해가 된다 |
 * | 증강 도감 상세·샌드박스 상세 (`"codex"`) | 요약 + **상세** | 목록에 이미 요약이 서 있고, 설명은 상세와 말이 겹친다 |
 *
 * 상세가 아직 없는 증강은 도감에서도 설명이 그 자리를 대신한다 — 빈 패널을 두지 않는다.
 *
 * 드래프트 카드와 이름표 툴팁은 좁다 — 요약이 길어지면 그 자리에서 다섯 줄을 넘긴다.
 * 그래서 요약은 **60자 안쪽**을 지킨다(`test/augmentBrief.test.ts`가 지킨다).
 *
 * ## 새 증강을 추가할 때
 * 여기 항목을 같은 커밋에서 넣는다. 빠지면 `briefOf`가 description 앞부분으로
 * 대체 표시하므로 화면이 깨지진 않지만, 길고 어려운 원문이 그대로 노출된다.
 *
 * `use`는 사용 빈도 배지다. 본문에서 `(상시)`·`(매 국 1회)` 같은 머리말을 떼어내
 * 배지로 옮긴 것이라, 요약 본문은 순수하게 효과만 말한다.
 */
export interface AugmentBrief {
  /** 사용 빈도 배지 — "상시", "매 국 1회", "동풍전1·반장전2" 등 */
  use: string;
  /** 효과 한 문장 (60자 안쪽) */
  text: string;
}

/** 동풍전 1회 · 반장전 2회 — 가장 흔한 배지라 상수로 둔다 */
const MODE_1_2 = "동풍전1·반장전2";

/** 표기를 줄일 때 기준이 되는 게임 모드 (core의 `GameMode`와 같은 값). */
export type DisplayMode = "hanchan" | "tonpuu";

/**
 * "동풍전 1회 · 반장전 2회"처럼 두 모드를 나란히 적은 횟수 표기.
 *
 * 배지("동풍전1·반장전2")·원문 머리말("(동풍전 1회 · 반장전 2회)")·본문 어디에나
 * 나오고, 띄어쓰기와 "회"의 유무가 제각각이라 하나의 패턴으로 받는다.
 */
const MODE_COUNT_RE = /동풍전\s*(\d+)\s*회?\s*·\s*반장전\s*(\d+)\s*회?/g;

/**
 * 인게임 표기를 **지금 도는 판**의 횟수 하나로 줄인다 — 동풍전이면 "게임 1회",
 * 반장전이면 "게임 2회".
 *
 * 판 중에는 자기 판에 없는 숫자가 같이 서 있으면 몇 번 쓸 수 있는지 한 번 더
 * 셈해야 한다. 반대로 증강 도감은 모드를 가리지 않고 읽는 자리라 두 숫자를 그대로
 * 둔다 — 그래서 `mode`가 `null`이면 원문을 손대지 않는다.
 */
export function forMode(text: string, mode: DisplayMode | null): string {
  if (mode === null) return text;
  return text.replace(MODE_COUNT_RE, (_all, tonpuu: string, hanchan: string) =>
    `게임 ${mode === "tonpuu" ? tonpuu : hanchan}회`);
}

export const AUGMENT_BRIEF: Record<string, AugmentBrief> = {
  // 2026-08-04 6차 신규 8종
  blind_ron: { use: "이번 국만", text: "이 국의 모든 론이 네 명 중 무작위 한 명에게 청구된다." },
  cornucopia: { use: "획득 즉시", text: "무작위 증강 2개를 획득한다. 전원에게 공개된다." },
  dora_afterimage: { use: "2국에 1회", text: "직전 국의 도라가 되살아나 이번 국 내 도라로 겹쳐진다." },
  mirror_dora: { use: "상시", text: "도라 표시패의 앞 패도 나에게만 도라가 된다." },
  picky_eater: { use: "2국에 1회", text: "한 무늬만 12장 버리면 손패의 수패를 원하는 한 색으로 바꾼다." },
  soul_strike: { use: "2국에 1회", text: "리치(2판)를 걸고 혼자 연속 6쯔모. 그 사이 쯔모 화료는 일발." },
  sign_flip: { use: "이번 국만", text: "이 국에는 내 점수의 부호가 뒤집힌다 — 쏘이면 오히려 받는다." },
  // 2026-08-07 7차 신규
  joker: { use: "2국에 1회", text: "이번 국 손패의 백이 무엇이든 되는 만능패가 된다." },
  time_pressure: { use: "이번 국만", text: "이 국에는 전원의 모든 결정이 5초 제한이다. 나도 포함이다." },
  alchemist: { use: "게임 5회", text: "손패의 수패 1장을 숫자 ±1로 바꾼다. 리치 중에도 사용 가능하다." },
  all_or_nothing: { use: MODE_1_2, text: "리치에 내 점수 절반을 건다. 이기면 그만큼 더 받고, 져도 잃지 않는다." },
  always_tenpai: { use: "상시", text: "유국 때 늘 텐파이 취급 — 벌점을 안 내고 노텐인 상대마다 2000점을 받는다." },
  ankan_dora: { use: "상시", text: "안깡할 때마다 깡친 네 장이 나만의 도라가 된다(+4판)." },
  aotenjou_ceiling: { use: "상시", text: "내 점수에 상한이 없다. 판이 오르는 만큼 끝없이 커진다." },
  async_chiitoi: { use: "상시", text: "치또이쯔에서 무늬가 달라도 숫자만 같으면 한 쌍이다." },
  avenger: { use: "상시", text: "나를 쏜 상대에게는 후리텐이어도 역이 없어도 론할 수 있다." },
  big_hand: { use: "2국에 1회", text: "국 첫 순에 선언하면 그 국의 화료가 최소 만관이 된다." },
  blame_shift: { use: "상시", text: "내 론 점수를 쏜 사람 혼자가 아니라 셋이 나눠 낸다(총액은 그대로)." },
  blood_contract: { use: "매 국 1회", text: "역 하나를 미리 걸고, 그 역으로 화료하면 점수가 1.5배가 된다." },
  bluff_pretense: { use: "매 국 1회", text: "같은 패가 1장뿐이어도 퐁한다. 모자란 장은 잡패가 변신해 채운다." },
  bottom_deal: { use: "매 순 1회", text: "패산 맨 밑 3장이 나만 보이고, 쓰면 다음 쯔모를 맨 밑에서 뽑는다." },
  bottom_yaku: { use: "상시", text: "내 버림패 모양에 따라 화료 시 최대 3판이 더 붙는다." },
  brief_fog: { use: MODE_1_2, text: "6순 동안 모두의 버림패를 가린다. 나만 그대로 볼 수 있다." },
  broken_border: { use: "상시", text: "슌쯔에 무늬 제한이 없다 — 2만·3통·4삭도 한 몸통." },
  broken_wall: { use: "상시", text: "슌쯔가 9에서 1로 이어진다 — 8-9-1, 9-1-2도 한 몸통." },
  call_seal: { use: MODE_1_2, text: "6순 동안 상대 셋이 치·퐁·대명깡을 하지 못한다." },
  cliff_bloom: { use: "상시", text: "영상패를 직접 고른다. 한 국에 깡을 두 번 하면 그 자리에서 화료." },
  conjure_draw: { use: "매 국 1회", text: "손패 1장을 지목하면 다음 쯔모가 그 패의 복제로 온다." },
  counter: { use: "매 국 1회", text: "상대 리치에 추격 리치로 반격 — 공탁을 떠넘기고 일발을 지운다." },
  danger_sense: { use: "매 국 1회", text: "지금 버리면 방총이 되는 패가 무엇인지 나에게만 알려 준다." },
  dead_wall_master: { use: "매 국 2회", text: "왕패 14장이 다 보이고, 첫 순에 왕패와 손패를 2장까지 바꾼다." },
  devils_advance: { use: "게임 1회", text: "10,000점을 미리 받고, 만관 이상으로 화료하면 상대에게 각 3,000점을 받는다." },
  die_hard: { use: MODE_1_2, text: "점수가 0 아래로 떨어지면 그 마이너스만큼 플러스로 되돌아온다." },
  disarm: { use: MODE_1_2, text: "상대 증강 하나를 골라 이번 국 동안 완전히 잠근다." },
  discard_lock: { use: "2국에 1회", text: "국 시작에 상대들의 손패 일부를 이번 국 동안 못 버리게 묶는다." },
  dora_conceal: { use: "상시", text: "도라 표시패가 상대에게는 덮인다 — 도라를 나만 안다." },
  eternal_dealer: { use: "상시", text: "나는 늘 오야 취급 — 점수가 1.5배가 되고 역패 동이 항상 붙는다." },
  even_world: { use: MODE_1_2, text: "손패의 홀수 수패가 전부 한 칸 위 짝수로 바뀐다." },
  foresight: { use: "4순에 1회", text: "패산 다음 4장을 나만 본다. 국에 한 번은 그 순서까지 바꾼다." },
  frame_up: { use: "2국에 1회", text: "내가 버릴 패를 상대 바닥에 놓아 그 사람을 후리텐에 빠뜨린다." },
  free_riichi_discard: { use: "상시", text: "리치를 걸어도 오름패만 고정되고, 버리는 패는 계속 자유롭다." },
  full_hand_swap: { use: "게임 2회", text: "국 첫 순에 상대의 손패를 통째로 빼앗는다." },
  future_sight: { use: "3순에 1회", text: "손패 3장을 패산 위 3장과 바꾼다. 쓸수록 그 국 화료에 판이 붙는다." },
  genesis: { use: MODE_1_2, text: "손패의 자패는 수패로, 수패는 자패로 통째로 뒤바뀐다." },
  giant_god: { use: "상시", text: "내 바닥의 국사무쌍 13종을 손으로 끌어올려 텐파이 — 다음 순에 화료한다." },
  grave_rob: { use: MODE_1_2, text: "상대가 최근 버린 10장 중 1장을 파내 그대로 화료한다." },
  haitei_lord: { use: "상시", text: "텐파이로 해저패를 쯔모하면 대기와 상관없이 무조건 화료한다." },
  hand_swap3: { use: "게임 2회", text: "상대 손패를 들여다보고 내 3장과 상대 3장을 맞바꾼다." },
  hidden_blade: { use: "상시", text: "리치 없이 멘젠 론으로 이기면 +2판에 뒷도라까지 붙는다." },
  hidden_river: { use: "게임 1회", text: "게임이 끝날 때까지 모두의 버림패가 가려진다. 나만 그대로 본다." },
  honba_hunter: { use: "상시", text: "나만 본장 1개당 추가 점수가 300점이 아니라 1500점이 된다." },
  honor_return: { use: MODE_1_2, text: "이번 국에 버린 자패를 최대 4장까지 다음 국 배패로 되받는다." },
  hourglass: { use: "2국에 1회", text: "유국 때 내가 텐파이면 국이 안 끝나고 나 혼자 4장을 더 쯔모한다." },
  invincible: { use: "2국에 1회", text: "이번 국이 끝날 때까지 아무도 나를 론할 수 없다." },
  jackpot: { use: "매 국 1회", text: "국 첫 순에 룰렛을 돌려 그 국 점수에 0.5~3배를 곱한다." },
  karma: { use: "상시", text: "잃은 점수가 게이지로 쌓이고, 태우면 그만큼 상대 셋에게서 뺏는다." },
  last_stand: { use: "매 국 1회", text: "내 리치를 취소한다. 냈던 리치봉도 돌려받는다." },
  late_bloomer: { use: "상시(반장전)", text: "남4국에 들어서면 후리텐을 무시하고, 역이 없어도 화료한다." },
  late_bloomer_east: { use: "상시(동풍전)", text: "동4국에 들어서면 후리텐을 무시하고, 역이 없어도 화료한다." },
  late_double: { use: "상시", text: "7순까지 건 리치는 더블리치가 되고 +1판이 더 붙는다." },
  let_it_ride: { use: "상시", text: "연속으로 화료할수록 내 점수 배수가 오른다(최대 4배)." },
  meld_dissolve: { use: "매 국 1회", text: "내 치·퐁 하나를 손으로 되돌린다. 하나뿐이었으면 멘젠이 복구된다." },
  mixed_nine_gates: { use: "상시", text: "구련보등이 무늬를 가리지 않는다." },
  mixed_triplet: { use: "상시", text: "커쯔에 무늬 제한이 없다 — 1만·1통·1삭도 한 커쯔." },
  nagashi_yakuman: { use: "상시", text: "유국만관이 역만이 되고, 남이 울어 가도 무효가 되지 않는다." },
  no_retreat: { use: "2국에 1회", text: "그 국은 공탁이 공짜고 리치·일발·뒷도라가 각 2판이 된다." },
  no_ron_pact: { use: "상시", text: "매 국 첫 6순은 론당하지 않는다. 리치·후로하면 즉시 깨진다." },
  north_trader: { use: "상시", text: "손의 北을 빼놓고 새로 뽑는다. 빼놓은 北은 한 장당 1판." },
  off_by_one: { use: "상시", text: "리치 후 쯔모한 패가 오름패의 ±1이면 그 패가 오름패로 바뀐다." },
  omni_chi: { use: "상시", text: "상가뿐 아니라 누구의 버림패로든 치를 할 수 있다." },
  open_kokushi: { use: "상시", text: "요구패를 퐁해서도 국사무쌍을 완성할 수 있다." },
  open_riichi_reveal: { use: "매 국 1회", text: "오름패를 공개하고 리치. 리치 안 건 사람이 쏘면 그 화료가 역만이 된다." },
  palm_flip: { use: MODE_1_2, text: "리치를 풀었다가 같은 국에 다시 건다. 재선언은 공짜다." },
  parasite: { use: "국마다 1회", text: "상대 하나에 기생해, 그 국에 그가 버는 점수의 절반을 가져온다." },
  peek_riichi_waits: { use: "매 국 1회", text: "리치한 상대의 오름패를 확인하고, 한 번은 내 패를 그것으로 바꾼다." },
  polar_ends: { use: "상시", text: "같은 무늬의 1과 9를 같은 패로 본다 — 199·911도 한 커쯔." },
  pond_snatch: { use: "게임 3회", text: "쯔모 대신 상대가 최근 버린 3장 중 1장을 줍는다. 멘젠은 유지된다." },
  pseudo_dealer: { use: "2국에 1회", text: "그 자리에서 오야를 빼앗는다. 자풍도 나를 기준으로 다시 정해진다." },
  push_riichi: { use: MODE_1_2, text: "상대 하나에게 낙인 — 리치 가능한 상태로 버리면 강제로 리치가 된다." },
  rank_gate: { use: "매 국 1회", text: "지목한 상대는 이번 국에 4판 이하로는 화료하지 못한다." },
  red_five_touch: { use: "게임 1회", text: "숫자 하나를 정하면 그 뒤로 내게 오는 그 숫자가 전부 적도라가 된다." },
  regret: { use: "2국에 1회", text: "유국 때 멘젠 텐파이면 그 손패가 그대로 다음 국 배패가 된다." },
  reload: { use: MODE_1_2, text: "이미 다 쓴 내 다른 증강 하나의 사용 횟수를 1회 되살린다." },
  riichi_seal: { use: "매 국 1회", text: "그 국의 첫 리치를 내가 걸면 다른 셋은 리치를 걸지 못한다." },
  riichi_upgrade: { use: "상시", text: "내 리치는 언제나 더블리치. 내 하가는 그 국에 리치를 못 건다." },
  rinshan_preview: { use: "매 국 1회", text: "다음 영상패가 늘 보이고, 깡 없이도 내 쯔모패와 바꿀 수 있다." },
  royal_kokushi: { use: "상시", text: "국사무쌍에 13종을 다 안 모아도 된다. 빠진 종류는 중복으로 때운다." },
  scapegoat: { use: "매 국 1회", text: "내 쯔모 화료 점수를 지목한 상대 하나가 전액 낸다." },
  seat_swap: { use: "국당 1회", text: "상대와 자리·손패를 통째로 맞바꾼다. 자풍·오야까지 따라온다." },
  siege_riichi: { use: "상시", text: "텐파이가 아니어도 리치를 걸 수 있다(그 상태로는 화료 불가)." },
  silent_pact: { use: "매 국 1회", text: "이 증강으로 부른 퐁 1회는 멘젠이 유지된다 — 리치도 그대로 된다." },
  silent_swap: { use: "매 국 1회", text: "아무도 리치를 안 건 국에, 아무 바닥에서 버림패 1장을 손으로 가져온다." },
  snake_kan: { use: "상시", text: "같은 무늬 연속 4장(예: 3-4-5-6)을 깡으로 낼 수 있다." },
  soul_hunt: { use: "상시", text: "리치한 상대를 론하면 그 리치를 빼앗아 내 화료가 리치가 된다." },
  spy: { use: "매 국 1회", text: "패 1종을 몰래 찍고, 상대가 그 패로 화료하면 그 점수를 내가 가져온다." },
  stealth_riichi: { use: "매 국 1회", text: "남에게 보이지 않는 리치를 건다. 공탁도 내지 않는다." },
  suit_unify: { use: MODE_1_2, text: "손패의 수패를 전부 원하는 한 무늬로 바꾼다. 숫자는 그대로다." },
  table_flip: { use: "매 국 1회", text: "첫 순에 손패를 전부 반납하고 패산에서 새 손을 받는다." },
  take_back: { use: "3순에 1회", text: "방금 쯔모한 패를 패산에 되돌리고 새로 1장 뽑는다." },
  tanyao_break: { use: "상시", text: "자패만 없으면 1·9가 섞여도 탕야오. 게다가 2판으로 값한다." },
  tenpai_scan: { use: MODE_1_2, text: "지금 텐파이인 상대가 누구인지 나에게만 알려 준다." },
  three_dragons_will: { use: MODE_1_2, text: "백·발·중 중 둘이 커쯔면 남은 한 장을 커쯔로 완성해 준다." },
  tile_dyeing: { use: "게임 5회", text: "손패의 수패 1장을 같은 숫자의 다른 무늬로 바꾼다. 리치 중에도 사용 가능하다." },
  tile_split: { use: "매 국 1회", text: "손패의 수패 1장을 합이 같은 두 장으로 쪼갠다(9통 → 4통+5통)." },
  time_stop: { use: "매 국 1회", text: "그 국에서 내 차례를 한 번 더 진행한다." },
  triple_peek: { use: "2국에 1회", text: "내 다음 쯔모 세 장이 무엇인지 나에게만 보인다." },
  true_dragon: { use: "상시", text: "배패를 16장 받고 몸통 5개로 화료한다. 화료 시 +3판." },
  // 문턱은 고정 50000이 아니다 — 증강이 얹어 준 점수만큼 함께 올라간다(unification.ts).
  unification: { use: "상시", text: "목표 점수에 닿는 순간 즉시 우승. 목표는 증강이 준 점수만큼 올라간다." },
  ura_peek: { use: "매 국 1회", text: "뒷도라 표시패를 나만 확인하고, 한 번은 다른 패로 바꿔치기한다." },
  void_kan: { use: "상시", text: "내가 텐파이면 상대의 깡을 오름패와 상관없이 창깡으로 가로챈다." },
  wind_lineage: { use: "상시", text: "자패로 슌쯔를 만든다 — 동남서·백발중도 한 몸통이 된다." },
  xray_hand: { use: MODE_1_2, text: "그 국이 끝날 때까지 상대 셋의 손패가 나에게만 보인다." },
  yakuman_shield: { use: "상시", text: "역만에 완전 면역 — 잃을 점수를 전액 돌려받는다." },
  iron_wall: { use: "상시", text: "후리텐이어도 론할 수 있다. 진짜 후리텐이었으면 +3판." },
  open_riichi: { use: "상시", text: "후로한 손으로도 리치를 걸 수 있다. 그 리치는 2판으로 값한다." },
  yakuless_win: { use: "상시", text: "역이 없어도 화료할 수 있다. 그 화료는 2판으로 값한다." },
  discard_recall: { use: "매 국 1회", text: "쯔모패를 버리고 내 과거 버림패 하나를 손으로 되가져온다." },
};

/**
 * 원문 설명에서 머리말 `(상시)` `(매 국 1회 · 국의 첫 순)`을 떼어낸다.
 *
 * 요약을 펼쳐 원문을 보여줄 때 머리말을 그대로 두면 배지와 같은 말이 두 번 나온다.
 * 대신 배지를 이 머리말로 바꿔 단다 — 요약의 `use`보다 조건이 자세할 때가 많다.
 */
export function splitLead(description: string): { use: string; body: string } {
  const raw = description.trim();
  const head = /^\(([^)]*)\)\s*/.exec(raw);
  if (head === null) return { use: "", body: raw };
  return { use: head[1]!.trim(), body: raw.slice(head[0].length) };
}

/**
 * 화면에 띄울 요약을 고른다. 표에 없는 증강(새로 추가되고 요약을 안 넣은 것)은
 * 머리말을 배지로 떼어내고 첫 문장만 보여준다 — 원문 전체보다는 짧다.
 */
export function briefOf(id: string, description: string | undefined): AugmentBrief {
  const known = AUGMENT_BRIEF[id];
  if (known !== undefined) return known;
  const { use, body } = splitLead(description ?? "");
  const first = /^[^.。]*[.。]?/.exec(body)?.[0] ?? body;
  return { use, text: first.trim() };
}

/**
 * 설명을 펼치는 자리가 어디인가 — 화면마다 보여주는 층이 다르다.
 *
 * 렌더 컴포넌트가 자기 위치를 추측하지 않게, **호출부가 명시**한다.
 * - `"draft"` — 증강 선택 카드, 인게임 이름표 툴팁. 요약 + 설명.
 * - `"codex"` — 증강 도감 상세, 샌드박스 상세 패널. 요약 + 상세.
 */
export type AugmentDescVariant = "draft" | "codex";

/**
 * "자세히"를 펼쳤을 때 요약 **아래에** 붙일 문단들.
 *
 * 어느 층이 오는지는 위 표대로 `variant`가 정한다. 원문 머리말 `(상시)`은 떼어낸다 —
 * 그 말은 이미 배지가 하고 있다. 상세는 빈 줄로 나뉜 여러 문단일 수 있다.
 */
export function expandParas(
  variant: AugmentDescVariant,
  description: string | undefined,
  detail?: string | undefined,
): string[] {
  const body = splitLead(description ?? "").body.trim();
  const fallback = body === "" ? [] : [body];
  if (variant === "draft") return fallback;
  const paras = (detail ?? "")
    .trim()
    .split(/\n\n+/)
    // 상세도 첫 문단에 머리말 `(2국에 1회)`을 달고 있는 것이 많다 — 요약 배지가 이미
    // 하는 말이라 여기서도 뗀다(예전엔 배지·설명·상세가 같은 말을 세 번 했다).
    .map((p, i) => (i === 0 ? splitLead(p).body : p).trim())
    .filter((p) => p !== "");
  // 상세가 아직 없는 증강 — 도감 상세를 비워 두는 것보다 설명이라도 보여준다
  return paras.length > 0 ? paras : fallback;
}
