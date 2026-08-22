/** 검증할 "실제 빌드" 목록 — 한 좌석(p0)에 테마가 맞는 증강 3~4개 */
export interface BuildDef {
  key: string;
  name: string;
  ids: readonly string[];
  mode: "tonpuu" | "hanchan";
  /** 미리 적은 예측 (보고서에 그대로 옮긴다) */
  predict: string;
}

export const BUILDS: readonly BuildDef[] = [
  {
    key: "riichi",
    name: "리치 최대화",
    ids: ["stealth_riichi", "late_double", "ura_peek", "no_retreat"],
    mode: "tonpuu",
    predict:
      "리치 관련 판수가 크게 붙어 p0 평균 타점이 대조군 대비 +50% 이상. no_retreat(2국 1회)과 " +
      "stealth_riichi(국 1회)는 둘 다 '리치를 대신 거는' 액티브라 서로 기회를 잡아먹어 한쪽 발동 수가 낮을 것. " +
      "late_double은 7순 이내 리치에만 붙어 발동 빈도가 낮다. ura_peek은 리치와 무관하게 매 국 발동 가능.",
  },
  {
    key: "kandora",
    name: "깡·도라",
    ids: ["ankan_dora", "snake_kan", "mirror_dora", "red_five_touch"],
    mode: "tonpuu",
    predict:
      "안깡 1개당 +4판이 붙어 화료 시 하네만~배만이 흔해야 한다. snake_kan은 봇이 커스텀 깡 액션을 " +
      "쓸 정책이 있어야 발동한다 — 없으면 0회. mirror_dora는 상시라 화료마다 도라 판이 늘어야 한다. " +
      "red_five_touch는 게임 1회 액티브.",
  },
  {
    key: "kokushi",
    name: "국사",
    ids: ["royal_kokushi", "giant_god", "polar_ends", "broken_wall"],
    mode: "tonpuu",
    predict:
      "국사 완화(royal_kokushi)로 역만 화료가 대조군보다 잦아야 한다. giant_god은 '13종을 내가 전부 버려 둬야' " +
      "하는 조건이라 실전에서 거의 발동하지 않을 것(0회 예상). polar_ends·broken_wall은 손 모양 규칙이라 " +
      "화료율 자체를 올린다. 단 royal_kokushi(요구패)와 broken_wall/polar_ends(수패 몸통)는 서로 다른 손을 " +
      "요구해 한 손에 같이 쓰이지 못한다 — '빌드 안에서 서로를 못 돕는' 조합일 것.",
  },
  {
    key: "open",
    name: "후로 타점",
    ids: ["omni_chi", "mixed_triplet", "broken_border", "big_hand"],
    mode: "tonpuu",
    predict:
      "치 기회가 3배로 늘어 후로율·화료율이 크게 오른다. mixed_triplet·broken_border로 몸통이 쉬워져 " +
      "화료가 빨라지지만 역이 사라져(멘젠·탕야오 붕괴) 타점은 낮을 것. big_hand는 최소 만관 보장이라 " +
      "평균 타점을 끌어올린다. big_hand가 봇 정책 없으면 0회.",
  },
  {
    key: "bank",
    name: "뱅크",
    ids: ["jackpot", "big_hand", "devils_advance", "honba_hunter"],
    mode: "tonpuu",
    predict:
      "devils_advance의 선불 10,000으로 초반 점수가 34,000에서 시작. jackpot 배수와 big_hand 만관 보장이 " +
      "곱해져 화료 1회의 점수가 폭발할 것. honba_hunter는 본장이 쌓여야 의미가 있어 동풍전에서는 거의 죽는다.",
  },
  {
    key: "defense",
    name: "수비 존버",
    ids: ["invincible", "always_tenpai", "danger_sense", "tenpai_scan"],
    mode: "tonpuu",
    predict:
      "p0의 방총이 0에 가깝고 최종 점수 분산이 작다. always_tenpai로 유국마다 +점수. " +
      "화료율은 대조군과 비슷하거나 낮다. danger_sense·tenpai_scan은 정보만 주므로 봇이 안 쓰면 0회.",
  },
  {
    key: "steal",
    name: "훔치기",
    ids: ["spy", "parasite", "karma", "blame_shift"],
    mode: "tonpuu",
    predict:
      "p0는 스스로 화료하지 않아도 점수가 오른다. spy·parasite는 상대 화료가 있어야 발동. " +
      "parasite와 spy가 같은 화료에 겹치면 '숙주가 얻는 점수'를 두 번 나눠 갖는 순서 문제가 날 수 있다. " +
      "karma는 게이지 8,000 이상이 필요해 초반엔 못 쓴다.",
  },
  {
    key: "info",
    name: "정보",
    ids: ["xray_hand", "foresight", "triple_peek", "peek_riichi_waits"],
    mode: "tonpuu",
    predict:
      "정보 증강뿐이라 점수 자체는 대조군과 큰 차이가 없다(foresight의 +2판만 예외). " +
      "봇이 뷰의 추가 정보를 실제 판단에 쓰지 않으면 4종 모두 '눌리기만 하고 이득 없음'이 된다. " +
      "발동 횟수는 높되 성적은 대조군과 동일할 것 — 그게 이 빌드의 핵심 관측점.",
  },
  {
    key: "hand",
    name: "손패 조작",
    ids: ["alchemist", "tile_split", "suit_unify", "conjure_draw"],
    mode: "tonpuu",
    predict:
      "화료율이 뚜렷하게 오른다(손을 직접 고칠 수 있으므로). suit_unify가 손패를 한 색으로 만들면 " +
      "청일색이 붙어 타점이 급등. suit_unify와 tile_split/alchemist가 순서에 따라 서로의 결과를 덮어쓸 수 있다. " +
      "손패 장수 불변식(HAND_SIZE)이 깨질 위험이 가장 큰 빌드.",
  },
  {
    key: "draw",
    name: "유국",
    ids: ["always_tenpai", "nagashi_yakuman", "hourglass", "regret"],
    mode: "tonpuu",
    predict:
      "유국 수가 대조군과 비슷하나 유국마다 p0가 이득. hourglass·regret은 '내가 텐파이인 유국'이 필요하고 " +
      "always_tenpai가 '항상 텐파이 취급'을 주므로, 세 증강이 같은 조건을 공유한다 — always_tenpai의 " +
      "가짜 텐파이가 hourglass/regret 조건까지 열어 주는지가 관측점(설명에는 그런 말이 없다).",
  },
  {
    key: "dealer",
    name: "오야 고정",
    ids: ["eternal_dealer", "pseudo_dealer", "honba_hunter", "big_hand"],
    mode: "tonpuu",
    predict:
      "p0가 계속 오야여서 연장·본장이 쌓이고 honba_hunter(본장 1,500)가 살아난다. " +
      "eternal_dealer의 '언제나 오야 점수'와 실제 오야 자리가 겹치면 1.5배가 두 번 붙을 위험. " +
      "pseudo_dealer는 이미 오야일 때 발동하면 무의미 — 봇이 그걸 거르는지 본다.",
  },
  {
    key: "wall",
    name: "패산 지배",
    ids: ["dead_wall_master", "bottom_deal", "haitei_lord", "cliff_bloom"],
    mode: "tonpuu",
    predict:
      "haitei_lord는 해저패까지 가야 해서 발동이 드물다(유국 직전 텐파이 필요). bottom_deal은 매 순 1회라 " +
      "발동 수가 매우 많을 것. dead_wall_master의 왕패 교환과 cliff_bloom의 영상패 선택이 같은 왕패를 " +
      "건드려 서로의 자원을 갉아먹는지가 관측점.",
  },
  {
    key: "disrupt",
    name: "봉인",
    ids: ["riichi_seal", "call_seal", "disarm", "time_stop"],
    mode: "tonpuu",
    predict:
      "상대 세 명의 리치·후로가 줄어 상대 화료율이 뚜렷이 떨어져야 한다. riichi_seal은 '내가 첫 리치를 " +
      "선언할 때'만이라 조건이 좁다. disarm은 상대가 증강을 가져야 의미 있는데 대조군 좌석은 증강이 없다 " +
      "— 이 빌드에서는 disarm이 죽은 증강이 될 것(관측 예정).",
  },
  {
    key: "ron",
    name: "론 특화",
    ids: ["avenger", "blind_ron", "off_by_one", "frame_up"],
    mode: "tonpuu",
    predict:
      "avenger는 먼저 방총당해야 켜지므로 초반 발동 없음. off_by_one은 리치 중에만 작동하는데 이 빌드에는 " +
      "리치 유도 증강이 없어 발동이 드물 것. blind_ron은 '획득 즉시 이번 국만'이라 preset 지급 시점(배패 전)에 " +
      "1국만 살아 있고 그 뒤 완전히 죽는다 — preset 경로에서 아예 발동조차 못 할 가능성.",
  },
  {
    key: "shape",
    name: "손 모양 파괴",
    ids: ["async_chiitoi", "mixed_triplet", "broken_border", "polar_ends"],
    mode: "tonpuu",
    predict:
      "네 증강 모두 화료형을 넓혀 화료율이 대조군의 2배 가까이 오를 것. 다만 역이 안 붙어(무역) 화료가 " +
      "성립하지 않는 손이 늘어 '텐파이인데 못 올린다'가 생길 수 있다. 화료 시 평균 판수는 낮을 것.",
  },
  {
    key: "multi",
    name: "타점 배수",
    ids: ["aotenjou_ceiling", "eternal_dealer", "mirror_dora", "ankan_dora"],
    mode: "tonpuu",
    predict:
      "상한이 없어져 도라 판수가 그대로 점수로 간다 — 한 번 화료에 5만점 이상이 나올 수 있다. " +
      "aotenjou와 eternal_dealer의 1.5배가 곱해지는 순서에 따라 결과가 갈린다.",
  },
  {
    key: "late",
    name: "역전 (동풍전 후반)",
    ids: ["late_bloomer_east", "rank_gate", "last_stand", "cliff_bloom"],
    mode: "tonpuu",
    predict:
      "late_bloomer_east는 동4국부터만 켜지므로 앞 3국에서는 완전히 죽어 있다. rank_gate는 매 국 첫 순 " +
      "액티브라 발동 수가 높아야 한다. last_stand는 리치를 걸어야 의미가 있는데 봇이 리치를 잘 안 풀면 0회.",
  },
];
