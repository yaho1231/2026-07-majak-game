/**
 * 마작 용어 사전 — 증강 설명 안의 전문 용어를 초보자 문장으로 풀어 주는 단일 진실.
 *
 * 화면에 뜨는 증강 설명은 "슌쯔·커쯔·오름패" 같은 말을 아무 설명 없이 쓴다.
 * 여기 등록된 표기는 본문에서 자동으로 밑줄이 그이고, 마우스를 잠시 올려 두면
 * `short` 한 줄이 뜬다. 표시 로직은 App.tsx의 `TermText`.
 *
 * ## 무엇을 싣고 무엇을 뺐나
 * **이 게임의 텍스트에 실제로 나오는 말만** 싣는다. 마작 용어 전체를 옮겨 오면
 * 게임에서 한 번도 안 쓰는 말(간짱·마와시우치·오카…)이 사전의 대부분을 차지하고,
 * 정작 쓰는 말을 고칠 때 어디를 봐야 하는지 흐려진다.
 *
 * 수록 기준은 증강의 `description`·`detail`, `augmentBrief.ts`의 요약, 그리고
 * **결과 화면에 뜨는 역 이름**(App.tsx의 `YAKU_NAMES`) — 즉 **플레이어가 실제로
 * 읽는 글**이다. 소스 주석이나 내부 식별자에만 있는 말은 세지 않는다(또이쯔·형식
 * 텐파이가 그래서 빠졌다 — 주석에만 있었다). 안커는 늘 "산안커·스안커" 안에서만
 * 나와 독립 항목이 필요 없었다.
 *
 * 그 밖에 뺀 것들: 샹텐·이샨텐, 간짱·변짱·스지 같은 수비 이론 용어(증강이 다루지
 * 않는다).
 *
 * **이 게임이 만든 말도 싣는다.** 뱅크·생성패·업보 게이지처럼 마작 사전 어디에도
 * 없는 말이 증강 설명에 그냥 나온다 — 아무 데도 정의가 없으면 아무도 모른다.
 *
 * 이 기준은 `content/test/client_augment_brief.test.ts`가 지킨다 — 한 번도 안 걸리는
 * 항목이 남아 있으면 실패한다. 증강 설명을 고치다 어떤 말을 더 안 쓰게 되면 거기서
 * 걸리니, 항목을 빼거나 그 말을 다시 쓰는 증강과 함께 남기면 된다.
 *
 * ## 항목을 추가할 때
 * - `short`는 **한 문장**. 마작을 처음 하는 사람이 읽고 바로 그림이 그려져야 한다.
 *   설명 안에서 또 다른 전문 용어를 쓰지 않는다(쓰면 또 모른다).
 * - `match`는 **정규식 소스**다. 생략하면 `label` 하나만 찾는다.
 *   캡처 그룹 `( )`을 쓰면 안 된다 — 매칭된 항목을 그룹 번호로 되찾기 때문에
 *   깨진다. 조건이 필요하면 전방탐색 `(?!…)` / `(?=…)`만 쓴다.
 * - 짧은 표기가 긴 표기를 잡아먹지 않게, 매칭은 **긴 것 우선**으로 자동 정렬된다
 *   (도라 표시패 → 뒷도라 → 도라). 별도 조치가 필요 없다.
 * - 한 글자·두 글자 표기는 일반 문장에 파묻힌다. `자가`는 "숫자가·혼자가"에 걸려서
 *   아예 뺐고, `대가`는 "그 상대가"에 걸리므로 앞이 한글이면 잡지 않는다.
 *   `판`은 `3판`처럼 숫자를 묶어서만 잡는다.
 *
 * ## 켜고 끄기
 * 설정의 **용어 설명** 토글(`Settings.glossaryTips`)이 꺼지면 밑줄도 툴팁도 없이
 * 맨 글자로 흐른다. 용어를 이미 아는 사람에게는 밑줄이 글을 읽는 데 방해가 된다.
 */
export interface GlossaryEntry {
  /** 안정적인 식별자 (툴팁 key) */
  key: string;
  /** 툴팁 제목 — 기본 매칭 표기이기도 하다 */
  label: string;
  /** 초보자용 한 줄 풀이 */
  short: string;
  /** 본문에서 이 용어로 인식할 표기들(정규식 소스). 생략하면 label 하나. */
  match?: readonly string[];
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  // ── 손의 모양 ──────────────────────────────────────────────
  {
    key: "shuntsu",
    label: "슌쯔",
    short: "같은 무늬로 숫자가 이어지는 3장(예: 3만 4만 5만).",
  },
  {
    key: "koutsu",
    label: "커쯔",
    short: "똑같은 패 3장(예: 5통 5통 5통).",
  },
  {
    key: "kantsu",
    label: "깡쯔",
    short: "똑같은 패 4장을 한 덩어리로 낸 것. 깡을 선언해야 깡쯔가 된다.",
  },
  {
    key: "mentsu",
    label: "멘쯔",
    short: "손을 이루는 3장짜리 덩어리. 완성하려면 이것 4개와 머리 1개가 필요하다.",
    match: ["멘쯔", "몸통"],
  },
  {
    key: "head",
    label: "머리",
    short: "손에 딱 하나 필요한 똑같은 패 2장. 덩어리 4개 + 머리 1개가 완성형이다.",
    match: ["머리(?![카말])"],
  },
  {
    key: "junk_tile",
    label: "잡패",
    short: "어느 덩어리에도 끼지 못해 버려도 그만인 패.",
  },

  // ── 패의 종류 ──────────────────────────────────────────────
  {
    key: "suits",
    label: "무늬",
    short: "숫자패의 세 종류 — 만(萬)·통(筒)·삭(索).",
  },
  {
    key: "number_tile",
    label: "수패",
    short: "1~9 숫자가 적힌 패. 만·통·삭 세 무늬로 각 4장씩 있다.",
  },
  {
    key: "honor_tile",
    label: "자패",
    short: "숫자가 없는 패 — 동·남·서·북과 백·발·중, 모두 7종류.",
  },
  {
    key: "terminal",
    label: "요구패",
    short: "1과 9, 그리고 자패를 통틀어 부르는 말. 손의 '끝자락' 패다.",
  },
  {
    key: "wind_tile",
    label: "풍패",
    short: "동·남·서·북 네 종류. 내 자리나 판에 걸린 것만 점수가 된다.",
  },
  {
    key: "sanyuan",
    label: "삼원패",
    short: "백·발·중 세 종류. 어느 것이든 3장 모으면 그 자체로 점수가 된다.",
  },

  // ── 도라 ──────────────────────────────────────────────────
  {
    key: "dora_indicator",
    label: "도라 표시패",
    short: "뒤집어 놓은 안내패. 이 패의 '다음' 패가 진짜 보너스 패가 된다.",
    match: ["도라 표시패", "표시패"],
  },
  {
    key: "ura_dora",
    label: "뒷도라",
    short: "리치를 걸고 화료했을 때만 추가로 열어 보는 보너스 패.",
  },
  {
    key: "red_dora",
    label: "적도라",
    short: "빨갛게 칠한 5. 한 장당 점수가 한 단계 오르지만, 적도라만으로는 이길 수 없다.",
  },
  {
    key: "kan_dora",
    label: "깡도라",
    short: "깡을 할 때마다 새로 열리는 보너스 패.",
    match: ["깡도라"],
  },
  {
    key: "dora",
    label: "도라",
    short: "보너스 패. 한 장당 점수가 한 단계 오르지만, 도라만으로는 이길 수 없다.",
  },
  {
    key: "nuki_dora",
    label: "북빼기",
    short: "손의 北을 옆에 빼놓고 새 패를 뽑는 규칙. 빼놓은 北은 보너스로 값한다.",
    match: ["북빼기"],
  },

  // ── 진행 ──────────────────────────────────────────────────
  {
    key: "wall",
    label: "패산",
    short: "아직 아무도 뽑지 않은 패 더미. 여기서 한 장씩 가져온다.",
  },
  {
    key: "dead_wall",
    label: "왕패",
    short: "패산 끝에 떼어 둔 14장. 도라 표시패와 영상패가 여기서 나온다.",
  },
  {
    key: "haipai",
    label: "배패",
    short: "국이 시작할 때 처음 받는 13장.",
  },
  {
    key: "rinshan_tile",
    label: "영상패",
    short: "깡을 하면 왕패 끝에서 대신 뽑아 오는 보충 패.",
  },
  {
    key: "haitei",
    label: "해저",
    short: "패산의 맨 마지막 패.",
    match: ["해저패", "해저(?![로모])"],
  },
  {
    key: "river",
    label: "바닥",
    short: "자기 앞에 버린 패가 줄지어 놓이는 자리.",
    match: ["버림패", "바닥(?=[의에을은이과와도만])"],
  },
  {
    key: "honba",
    label: "본장",
    short: "국이 다시 치러질 때마다 쌓이는 카운터. 1개당 이긴 사람이 300점을 더 받는다.",
  },
  {
    key: "renchan",
    label: "연장",
    short: "오야가 이겨서 오야 자리를 그대로 한 번 더 맡는 것.",
    match: ["연장\\(렌짱\\)", "렌짱", "연장(?![된하])"],
  },
  {
    key: "tonpuu",
    label: "동풍전",
    short: "동1국~동4국만 도는 짧은 대국.",
  },
  {
    key: "hanchan",
    label: "반장전",
    short: "동장과 남장을 모두 도는 긴 대국. 동풍전의 두 배 길이다.",
  },
  {
    key: "extra_round",
    label: "서입",
    short: "마지막 국까지 아무도 기준 점수를 못 넘겨 국을 더 이어 가는 것.",
    match: ["서입", "남입"],
  },

  // ── 자리 ──────────────────────────────────────────────────
  {
    key: "oya",
    label: "오야",
    short: "그 국에서 맨 먼저 패를 뽑는 사람. 점수를 1.5배로 주고받는다.",
  },
  {
    key: "seat_wind",
    label: "자풍",
    short: "내 자리에 걸린 바람패. 나만 그 패를 3장 모으면 점수가 된다.",
    match: ["자풍패", "자풍"],
  },
  {
    key: "round_wind",
    label: "장풍",
    short: "판 전체에 걸린 바람패(동장이면 東). 누구든 3장 모으면 점수가 된다.",
    match: ["장풍패", "장풍"],
  },
  {
    key: "taka",
    label: "타가",
    short: "나를 뺀 나머지 세 사람.",
  },
  {
    key: "kamicha",
    label: "상가",
    short: "내 바로 앞 차례인 왼쪽 사람. 이 사람이 버린 패로만 치를 할 수 있다.",
  },
  {
    key: "shimocha",
    label: "하가",
    short: "내 바로 다음 차례인 오른쪽 사람.",
  },
  {
    key: "toimen",
    label: "대가",
    short: "내 반대편(정면)에 위치한 사람. '대면'이라고도 한다.",
    // `대가`는 "그 상대가"에 통째로 파묻힌다 — 앞이 한글이면 잡지 않는다.
    // 게임 텍스트가 실제로 쓰는 표기는 `대면` 쪽이다(예지의 "하가·대면·상가·나").
    match: ["대면", "(?<![가-힣])대가"],
  },

  // ── 이기는 방법 ────────────────────────────────────────────
  {
    key: "agari",
    label: "화료",
    short: "손을 완성해 점수를 받는 것. 이 게임을 승리한다.",
  },
  {
    key: "tsumo",
    label: "쯔모",
    short: "패산에서 스스로 뽑은 패로 이기는 것. 셋 모두에게서 점수를 받는다.",
    match: ["쯔모(?![기])"],
  },
  {
    key: "tsumogiri",
    label: "쯔모기리",
    short: "방금 뽑은 패를 손에 넣지 않고 그대로 버리는 것.",
  },
  {
    key: "dahai",
    label: "타패",
    short: "패를 하나 골라 버리는 것. 매 차례 뽑고 나서 반드시 한 장을 버린다.",
  },
  {
    key: "ron",
    label: "론",
    short: "남이 버린 패를 가로채 이기는 것. 그 한 사람이 점수를 전부 낸다.",
    match: ["론(?![스])"],
  },
  {
    key: "houjuu",
    label: "방총",
    short: "내가 버린 패로 남이 이기는 것. 그 점수를 나 혼자 물어낸다.",
  },
  {
    key: "winning_tile",
    label: "오름패",
    short: "그 한 장만 더 들어오면 손이 완성되는 패.",
    match: ["오름패", "화료패"],
  },
  {
    key: "wait",
    label: "대기",
    short: "지금 어떤 패를 기다리고 있는지, 그 오름패의 모양.",
    match: ["대기(?![만])"],
  },
  {
    key: "tenpai",
    label: "텐파이",
    short: "오름패 한 장만 남은 완성 직전 상태.",
  },
  {
    key: "noten",
    label: "노텐",
    short: "완성 직전이 아닌 상태. 국이 그냥 끝나면 벌점을 낸다.",
  },
  {
    key: "furiten",
    label: "후리텐",
    short: "내 오름패에 포함되는 패를 내가 이미 버려서, 남의 패로는 못 이기게 된 상태. 쯔모는 가능하다.",
  },
  {
    key: "genbutsu",
    label: "현물",
    short: "그 사람이 이미 버린 패. 그 사람에게는 절대 쏘이지 않는 안전패다.",
  },
  {
    key: "ryuukyoku",
    label: "유국",
    short: "아무도 못 이긴 채 패산이 떨어져 국이 끝나는 것.",
    match: ["황패유국", "유국(?![만])"],
  },
  {
    key: "nagashi",
    label: "유국만관",
    short: "버린 패가 전부 1·9와 자패였을 때, 유국인데도 만관을 받는 규칙.",
  },

  // ── 울기 ──────────────────────────────────────────────────
  {
    key: "menzen",
    label: "멘젠",
    short: "한 번도 남의 패를 울지 않은 상태. 리치를 걸 수 있는 조건이다.",
  },
  {
    key: "furo",
    label: "후로",
    short: "남이 버린 패를 가져와 앞에 펼쳐 두는 것. 손이 빨라지지만 멘젠이 깨진다.",
    match: ["후로", "울음"],
  },
  {
    key: "chi",
    label: "치",
    short: "왼쪽 사람이 버린 패로 이어지는 3장을 만드는 울기.",
    match: ["치(?=[·를은도])"],
  },
  {
    key: "pon",
    label: "퐁",
    short: "남이 버린 패로 같은 패 3장을 만드는 울기. 누구에게서든 가져올 수 있다.",
    match: ["퐁", "펑"],
  },
  {
    key: "kan",
    label: "깡",
    short: "같은 패 4장을 한 덩어리로 내는 것. 보너스가 하나 더 열리고 패를 한 장 더 뽑는다.",
    match: ["깡(?![패])"],
  },
  {
    key: "ankan",
    label: "안깡",
    short: "내 손패만으로 만든 깡. 울지 않은 것으로 쳐서 멘젠이 유지된다.",
  },
  {
    key: "kakan",
    label: "가깡",
    short: "이미 퐁해 둔 자리에 4장째를 얹어 만든 깡.",
  },
  {
    key: "daiminkan",
    label: "대명깡",
    short: "남이 버린 패를 가져와 만든 깡.",
  },
  {
    key: "chankan",
    label: "창깡",
    short: "남이 깡하려고 내민 그 패를 가로채 이기는 것.",
  },
  {
    key: "rinshan_kaihou",
    label: "영상개화",
    short: "깡을 하고 보충으로 뽑은 패로 곧바로 이기는 것.",
  },

  // ── 리치 ──────────────────────────────────────────────────
  {
    key: "riichi",
    label: "리치",
    short: "완성 직전에 1000점을 걸고 하는 선언. 이후 손을 못 바꾸는 대신 점수가 크게 붙는다.",
    match: ["리치(?![봉])"],
  },
  {
    key: "double_riichi",
    label: "더블리치",
    short: "첫 한 바퀴 안에 거는 리치. 보통 리치의 두 배로 값한다.",
  },
  {
    key: "ippatsu",
    label: "일발",
    short: "리치를 걸고 한 바퀴 안에 이기면 붙는 보너스. 누가 울면 사라진다.",
  },
  {
    key: "damaten",
    label: "다마텐",
    short: "완성 직전인데 리치를 걸지 않고 조용히 기다리는 것. 상대가 눈치채지 못한다.",
    match: ["다마텐", "야미텐"],
  },
  {
    key: "kyoutaku",
    label: "공탁",
    short: "리치할 때 판에 내놓는 1000점. 다음에 이긴 사람이 통째로 가져간다.",
    match: ["공탁금", "공탁", "리치봉"],
  },

  // ── 점수 ──────────────────────────────────────────────────
  {
    key: "yaku",
    label: "역",
    short: "이기려면 반드시 하나는 있어야 하는 '족보'. 없으면 모양이 완성돼도 못 이긴다.",
    match: ["역(?![만패류])"],
  },
  {
    key: "yakuhai",
    label: "역패",
    short: "3장만 모아도 그 자체로 점수가 되는 패 — 백·발·중과 내 바람패.",
  },
  {
    key: "han",
    label: "판",
    short: "점수의 단위. 1판 오를 때마다 받는 점수가 대략 두 배가 된다.",
    match: ["\\d+판"],
  },
  {
    key: "fu",
    label: "부수",
    short: "판과 함께 점수를 정하는 잔돈 단위. 손의 모양에 따라 조금씩 붙는다.",
  },
  {
    key: "mangan",
    label: "만관",
    short: "점수 등급의 첫 문턱. 8000점(오야는 12000점).",
  },
  {
    key: "haneman",
    label: "하네만",
    short: "만관 바로 위 등급. 12000점(오야는 18000점).",
  },
  {
    key: "baiman",
    label: "배만",
    short: "하네만 위 등급. 16000점(오야는 24000점). 그 위는 삼배만이다.",
    match: ["삼배만", "배만"],
  },
  {
    key: "yakuman",
    label: "역만",
    short: "최고 등급의 손. 32000점(오야는 48000점)으로 한 방에 판이 뒤집힌다.",
  },

  // ── 이 게임이 만든 말 ──────────────────────────────────────
  // 마작에는 없고 증강이 만들어 낸 개념들. 정의가 여기밖에 없다.
  {
    key: "bank",
    label: "뱅크",
    short: "점수를 새로 찍어 내는 가상의 금고. 여기서 나오는 점수는 상대 주머니에서 빠지지 않는다.",
  },
  {
    key: "stake",
    label: "판돈",
    short: "이겼을 때 그만큼 더 받으려고 미리 걸어 두는 점수.",
  },
  {
    key: "karma_gauge",
    label: "업보 게이지",
    short: "잃은 점수가 그대로 쌓이는 눈금. 태우면 쌓인 만큼을 상대에게서 되받는다.",
  },
  {
    key: "conjured_tile",
    label: "생성패",
    short: "패산에 없던 패를 증강이 그 자리에서 만들어 낸 것. 화면에 보라색으로 뜬다.",
  },
  {
    key: "triple_riichi",
    label: "트리플리치",
    short: "증강으로만 나오는 리치. 더블리치 조건에서 한 단계 더 올라 4판으로 값한다.",
  },
  {
    key: "snake_kan",
    label: "장사진",
    short: "증강으로만 되는 깡. 같은 무늬 연속 4장(3-4-5-6)을 한 덩어리로 낸다.",
  },
  {
    key: "sanma",
    label: "삼인마작",
    short: "셋이서 하는 마작. 이 게임은 넷이서 하고, 북빼기 같은 규칙만 증강으로 들여온다.",
  },
  {
    key: "kazoe_yakuman",
    label: "셈수역만",
    short: "역만 족보가 없어도 판이 13판을 넘어 역만으로 값하게 된 손.",
    match: ["셈수역만", "헤아림 역만"],
  },

  // ── 자주 나오는 족보 ────────────────────────────────────────
  {
    key: "kokushi",
    label: "국사무쌍",
    short: "1·9와 자패 13종을 한 장씩 다 모으는 최고 등급 손.",
    match: ["국사무쌍", "국사(?![를])"],
  },
  {
    key: "chiitoi",
    label: "치또이쯔",
    short: "3장 덩어리 대신, 서로 다른 짝 7개로 완성하는 손.",
    // 결과 화면의 역 이름은 "치또이츠"로 뜬다(App.tsx YAKU_NAMES) — 표기가 갈리면
    // 정작 역이 뜬 자리에서 사전이 안 걸린다. 세 표기 모두 이 항목으로 보낸다.
    match: ["치또이쯔", "치또이츠", "치또이"],
  },
  {
    key: "churen",
    label: "구련보등",
    short: "한 무늬만으로 1112345678999 모양을 만드는 최고 등급 손.",
  },
  {
    key: "chuuren_junsei",
    label: "순정구련보등",
    short:
      "1112345678999를 그대로 세운 채 그 무늬 9종 전부로 기다린 구련보등. 2배 역만이다.",
  },
  {
    key: "daisangen",
    label: "대삼원",
    short: "백·발·중을 모두 3장씩 모으는 최고 등급 손.",
  },
  {
    key: "sanankou",
    label: "산안커",
    short: "남의 패를 받지 않고 내 힘만으로 모은 '같은 패 3장' 덩어리가 3개인 손.",
  },
  {
    key: "toitoi",
    label: "또이또이",
    short: "덩어리 넷을 전부 '같은 패 3장'으로만 채운 손.",
  },
  {
    key: "tanyao",
    label: "탕야오",
    short: "1·9와 자패를 하나도 쓰지 않은 손. 가장 흔한 족보다.",
  },
  {
    key: "chinitsu",
    label: "청일색",
    short: "손 전체를 한 무늬로만 채운 손.",
  },
  {
    key: "honitsu",
    label: "혼일색",
    short: "한 무늬 + 자패만으로 채운 손.",
  },
  {
    key: "honroutou",
    label: "혼노두",
    short: "1·9와 자패만으로 채운 손.",
  },
  {
    key: "chanta",
    label: "찬타",
    short: "모든 덩어리와 머리에 1·9나 자패가 한 장씩은 들어간 손.",
    match: ["준찬타", "찬타"],
  },
  {
    key: "ittsu",
    label: "일기통관",
    short: "같은 무늬로 123·456·789를 한 줄로 갖춘 손.",
    match: ["일기통관"],
  },
  {
    key: "pinfu",
    label: "핑후",
    short: "덩어리가 전부 이어지는 3장이고 별다른 가점이 없는 얌전한 손.",
  },
  {
    key: "menzen_tsumo",
    label: "멘젠쯔모",
    short: "한 번도 울지 않은 손을 스스로 뽑은 패로 완성한 것.",
  },
  {
    key: "haitei_raoyue",
    label: "해저로월",
    short: "패산의 마지막 패로 이기는 것. 반대로 마지막 버림패로 이기면 하저로어.",
    match: ["해저로월", "해저모월", "하저로어"],
  },

  // ── 결과 화면에 뜨는 나머지 역 ──────────────────────────────
  // 화료 한 번에 처음 보는 이름이 줄줄이 뜬다. 여기 없으면 그 자리에서 물어볼 데가 없다.
  // (`test/resultYakuGlossary.test.ts`가 YAKU_NAMES 전부를 여기와 대조한다)
  {
    key: "iipeiko",
    label: "이페코",
    short: "같은 무늬로 똑같이 이어지는 3장을 두 벌 갖춘 손(예: 234 234). 울면 사라진다.",
  },
  {
    key: "ryanpeiko",
    label: "량페코",
    short: "이페코를 두 벌 갖춘 손(예: 234 234 567 567). 울면 사라진다.",
  },
  {
    key: "sanshoku",
    label: "삼색동순",
    short: "만·통·삭 세 무늬로 같은 숫자의 이어지는 3장을 하나씩 갖춘 손(예: 456을 세 무늬로).",
  },
  {
    key: "sanshoku_doukou",
    label: "삼색동각",
    short: "만·통·삭 세 무늬로 같은 숫자를 3장씩 모은 손(예: 5만·5통·5삭을 각 3장).",
  },
  {
    key: "shousangen",
    label: "소삼원",
    short: "백·발·중 가운데 둘을 3장씩 모으고 남은 하나를 머리로 쓴 손.",
  },
  {
    key: "sankantsu",
    label: "산깡쯔",
    short: "한 손에 깡을 세 번 해서 깡쯔가 3개인 손.",
    match: ["산깡쯔", "산깡즈"],
  },
  {
    key: "suukantsu",
    label: "스깡쯔",
    short: "한 손에 깡을 네 번 해서 깡쯔가 4개인 최고 등급 손.",
    match: ["스깡쯔", "스깡즈"],
  },
  {
    key: "suuankou",
    label: "스안커",
    short: "남의 패를 받지 않고 내 힘만으로 모은 '같은 패 3장' 덩어리가 4개인 최고 등급 손.",
  },
  {
    key: "suuankou_tanki",
    label: "스안커 단기",
    short: "스안커를 머리 한 장만 기다려 완성한 것. 두 배로 값한다.",
  },
  {
    key: "kokushi_13",
    label: "13면 대기",
    short: "국사무쌍 13종을 이미 다 모아 그 13종 어느 것으로도 이길 수 있는 대기. 두 배로 값한다.",
  },
  {
    key: "shousuushii",
    label: "소사희",
    short: "동·남·서·북 가운데 셋을 3장씩 모으고 남은 하나를 머리로 쓴 최고 등급 손.",
  },
  {
    key: "daisuushii",
    label: "대사희",
    short: "동·남·서·북을 모두 3장씩 모으는 최고 등급 손. 두 배로 값한다.",
  },
  {
    key: "tsuuiisou",
    label: "자일색",
    short: "손 전체를 자패만으로 채운 최고 등급 손.",
  },
  {
    key: "ryuuiisou",
    label: "녹일색",
    short: "초록빛 패(2·3·4·6·8삭과 발)만으로 채운 최고 등급 손.",
  },
  {
    key: "chinroutou",
    label: "청노두",
    short: "손 전체를 1과 9만으로 채운 최고 등급 손.",
  },
  {
    key: "tenhou",
    label: "천화",
    short: "오야가 처음 받은 13장 그대로 첫 쯔모에 이기는 것. 최고 등급이다.",
  },
  {
    key: "chihou",
    label: "지화",
    short: "오야가 아닌 사람이 첫 쯔모로 곧바로 이기는 것. 최고 등급이다.",
  },
  {
    key: "hidden_blade",
    label: "숨은 칼날",
    short: "증강으로만 붙는 역. 리치를 걸지 않은 멘젠 론 화료에 2판이 얹힌다.",
  },
];

interface Pattern {
  source: string;
  entry: GlossaryEntry;
}

/** 전방탐색을 걷어낸 '실제로 소비하는 글자 수' — 긴 표기 우선 정렬용 */
function literalWeight(source: string): number {
  return source.replace(/\(\?[!=][^)]*\)/g, "").replace(/\\d\+/g, "00").length;
}

const PATTERNS: readonly Pattern[] = GLOSSARY.flatMap((entry) =>
  (entry.match ?? [entry.label]).map((source) => ({ source, entry })),
).sort((a, b) => literalWeight(b.source) - literalWeight(a.source));

/**
 * 본문 스캐너. 대안(alternation)은 **왼쪽부터** 시도되므로, 긴 표기를 앞에 둔
 * PATTERNS 순서가 그대로 "긴 것 우선" 규칙이 된다. 각 표기를 캡처 그룹으로 감싸
 * 어느 항목이 걸렸는지 그룹 번호로 되찾는다.
 */
const TERM_RE = new RegExp(PATTERNS.map((p) => `(${p.source})`).join("|"), "g");

export type TermChunk =
  | { kind: "text"; text: string }
  | { kind: "term"; text: string; entry: GlossaryEntry };

/** 문장을 일반 텍스트 조각과 용어 조각으로 가른다 (TermText가 그대로 렌더한다) */
export function splitTerms(text: string): TermChunk[] {
  const out: TermChunk[] = [];
  let last = 0;
  TERM_RE.lastIndex = 0;
  let m = TERM_RE.exec(text);
  while (m !== null) {
    let entry: GlossaryEntry | undefined;
    for (let g = 1; g < m.length; g++) {
      if (m[g] !== undefined) {
        entry = PATTERNS[g - 1]?.entry;
        break;
      }
    }
    if (entry !== undefined) {
      if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
      out.push({ kind: "term", text: m[0], entry });
      last = m.index + m[0].length;
    }
    // 빈 매칭 방어 — 무한 루프를 막는다
    if (m[0] === "") TERM_RE.lastIndex += 1;
    m = TERM_RE.exec(text);
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
