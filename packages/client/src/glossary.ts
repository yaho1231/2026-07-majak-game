/**
 * 마작 용어 사전 — 증강 설명 안의 전문 용어를 초보자 문장으로 풀어 주는 단일 진실.
 *
 * 화면에 뜨는 증강 설명은 "슌쯔·커쯔·오름패" 같은 말을 아무 설명 없이 쓴다.
 * 여기 등록된 표기는 본문에서 자동으로 밑줄이 그이고, 마우스를 잠시 올려 두면
 * `short` 한 줄이 뜬다. 표시 로직은 App.tsx의 `TermText`.
 *
 * ## 항목을 추가할 때
 * - `short`는 **한 문장**. 마작을 처음 하는 사람이 읽고 바로 그림이 그려져야 한다.
 *   설명 안에서 다른 전문 용어를 쓰지 않는다(쓰면 또 모른다).
 * - `match`는 **정규식 소스**다. 생략하면 `label` 하나만 찾는다.
 *   캡처 그룹 `( )`을 쓰면 안 된다 — 매칭된 항목을 그룹 번호로 되찾기 때문에
 *   깨진다. 조건이 필요하면 전방탐색 `(?!…)` / `(?=…)`만 쓴다.
 * - 짧은 표기가 긴 표기를 잡아먹지 않게, 매칭은 **긴 것 우선**으로 자동 정렬된다
 *   (도라 표시패 → 뒷도라 → 도라). 별도 조치가 필요 없다.
 * - 한 글자 용어(국·자·판)는 일반 문장에 너무 흔해 기본적으로 넣지 않는다.
 *   꼭 필요하면 `\\d+판`처럼 앞뒤를 묶은 표기로 등록한다.
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
    short: "같은 무늬로 숫자가 이어지는 3장(예: 3만 4만 5만). 덩어리 하나로 친다.",
  },
  {
    key: "koutsu",
    label: "커쯔",
    short: "똑같은 패 3장(예: 5통 5통 5통). 덩어리 하나로 친다.",
  },
  {
    key: "mentsu",
    label: "멘쯔",
    short: "손을 이루는 3장짜리 덩어리. 슌쯔나 커쯔를 말하며, 보통 4개가 필요하다.",
  },
  {
    key: "body",
    label: "몸통",
    short: "3장으로 된 한 덩어리(슌쯔·커쯔). 보통 4개 + 머리 1개로 손이 완성된다.",
  },
  {
    key: "head",
    label: "머리",
    short: "똑같은 패 2장. 손 하나에 딱 하나만 필요하다.",
    match: ["머리(?![카말])"],
  },
  {
    key: "shanten",
    label: "셰텐",
    short: "완성까지 몇 장이 모자라는지를 세는 숫자. 0이면 완성 직전이다.",
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
    short: "1~9 숫자가 적힌 패. 만·통·삭 세 무늬가 있다.",
  },
  {
    key: "honor_tile",
    label: "자패",
    short: "숫자가 없는 패 — 동·남·서·북과 백·발·중.",
  },
  {
    key: "terminal",
    label: "요구패",
    short: "1과 9, 그리고 자패를 통틀어 부르는 말. 손의 '끝자락' 패다.",
  },
  {
    key: "sanyuan",
    label: "삼원패",
    short: "백·발·중 세 종류의 자패.",
  },

  // ── 도라 ──────────────────────────────────────────────────
  {
    key: "dora_indicator",
    label: "도라 표시패",
    short: "뒤집어 놓은 안내패. 이 패의 '다음' 패가 진짜 도라가 된다.",
    match: ["도라 표시패", "표시패"],
  },
  {
    key: "ura_dora",
    label: "뒷도라",
    short: "리치를 걸고 이겼을 때만 추가로 열리는 보너스 도라. 공짜 한 방.",
  },
  {
    key: "red_dora",
    label: "적도라",
    short: "빨간 5. 들고 있기만 해도 점수가 한 단계 붙는다.",
  },
  {
    key: "dora",
    label: "도라",
    short: "보너스 패. 한 장당 점수가 한 단계 오르지만, 도라만으로는 이길 수 없다.",
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
    short: "패산 끝에 떼어 둔 14장. 도라 표시패와 깡 보충패가 여기서 나온다.",
  },
  {
    key: "haipai",
    label: "배패",
    short: "국이 시작할 때 처음 받는 13장.",
  },
  {
    key: "rinshan_tile",
    label: "영상패",
    short: "깡을 하면 왕패에서 대신 뽑아 오는 보충 패.",
  },
  {
    key: "haitei",
    label: "해저",
    short: "패산의 맨 마지막 패. 그 패로 이기면 점수가 한 단계 더 붙는다.",
    match: ["해저패", "해저"],
  },
  {
    key: "river",
    label: "바닥",
    short: "자기 앞에 버린 패가 줄지어 놓이는 자리. '버림패'라고도 한다.",
    match: ["버림패", "바닥(?=[의에을은이과])"],
  },
  {
    key: "honba",
    label: "본장",
    short: "유국이나 연장으로 쌓이는 카운터. 1개당 이긴 사람이 300점을 더 받는다.",
  },
  {
    key: "renchan",
    label: "연장",
    short: "딜러(오야)가 이겨서 딜러 자리를 그대로 한 번 더 맡는 것.",
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

  // ── 자리 ──────────────────────────────────────────────────
  {
    key: "oya",
    label: "오야",
    short: "그 국의 딜러. 점수를 1.5배로 주고받고, 이기면 한 번 더 딜러를 한다.",
  },
  {
    key: "seat_wind",
    label: "자풍",
    short: "내 자리에 붙은 바람패. 그 패를 3장 모으면 점수가 한 단계 붙는다.",
    match: ["자풍패", "자풍"],
  },
  {
    key: "round_wind",
    label: "장풍",
    short: "그 판 전체에 걸린 바람패(동풍전이면 東). 3장 모으면 한 단계 붙는다.",
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
    short: "내 바로 앞 차례인 왼쪽 사람.",
  },
  {
    key: "shimocha",
    label: "하가",
    short: "내 바로 다음 차례인 오른쪽 사람.",
  },

  // ── 이기는 방법 ────────────────────────────────────────────
  {
    key: "agari",
    label: "화료",
    short: "손을 완성해서 점수를 받는 것. 이 게임의 '이겼다'.",
  },
  {
    key: "tsumo",
    label: "쯔모",
    short: "패산에서 스스로 뽑은 패로 이기는 것. 셋 모두에게서 점수를 받는다.",
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
    short: "내 오름패를 내가 이미 버려서, 남의 패로는 못 이기게 된 상태. 쯔모는 된다.",
  },
  {
    key: "ryuukyoku",
    label: "유국",
    short: "아무도 못 이긴 채 패산이 떨어져 국이 끝나는 것.",
    match: ["황패유국", "유국(?![만역])"],
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
    short: "남이 버린 패로 이어지는 3장을 만드는 울기.",
    match: ["치(?=[·를은도])"],
  },
  {
    key: "pon",
    label: "퐁",
    short: "남이 버린 패로 같은 패 3장을 만드는 울기.",
    match: ["퐁", "펑"],
  },
  {
    key: "kan",
    label: "깡",
    short: "같은 패 4장을 한 덩어리로 내는 것. 도라가 하나 더 열리고 패를 한 장 더 뽑는다.",
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
    short: "깡을 하고 보충으로 뽑은 패로 바로 이기는 것.",
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
    short: "리치를 걸고 한 바퀴 안에 이기면 붙는 보너스.",
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
    short: "이기기 위해 반드시 하나는 있어야 하는 '족보'. 없으면 손이 완성돼도 못 이긴다.",
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
    short: "점수 등급의 첫 문턱. 8000점(딜러는 12000점).",
  },
  {
    key: "haneman",
    label: "하네만",
    short: "만관 바로 위 등급. 12000점(딜러는 18000점).",
  },
  {
    key: "baiman",
    label: "배만",
    short: "하네만 위 등급. 16000점(딜러는 24000점).",
  },
  {
    key: "yakuman",
    label: "역만",
    short: "최고 등급의 손. 32000점(딜러는 48000점)으로 한 방에 판이 뒤집힌다.",
  },

  // ── 대표 족보 ──────────────────────────────────────────────
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
    match: ["치또이쯔", "치또이"],
  },
  {
    key: "churen",
    label: "구련보등",
    short: "한 무늬만으로 1112345678999 모양을 만드는 최고 등급 손.",
  },
  {
    key: "daisangen",
    label: "대삼원",
    short: "백·발·중을 모두 3장씩 모으는 최고 등급 손.",
  },
  {
    key: "tanyao",
    label: "탕야오",
    short: "1·9와 자패를 하나도 쓰지 않은 손. 가장 흔한 족보다.",
  },
  {
    key: "chinitsu",
    label: "청일색",
    short: "손 전체를 한 무늬로만 채운 손. 점수가 크게 붙는다.",
  },
  {
    key: "pinfu",
    label: "핑후",
    short: "덩어리가 전부 이어지는 3장이고 별다른 가점이 없는 얌전한 손.",
  },
  {
    key: "iipeiko",
    label: "이페코",
    short: "똑같이 이어지는 3장 짝을 두 벌 갖춘 손.",
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
