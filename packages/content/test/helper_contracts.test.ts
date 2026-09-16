/**
 * 공용 헬퍼 사용 계약 — 소스 스캔 (docs/25 §1).
 *
 * 이번 감사 결함의 절반이 "한 파일에서 고쳤는데 형제 파일에 안 퍼진 사본"이었다.
 * 헬퍼를 만드는 것만으로는 부족하고, 안 쓰면 잡히게 해야 재발이 멈춘다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AUG_DIR = fileURLToPath(new URL("../src/augments/", import.meta.url));
const files = readdirSync(AUG_DIR).filter((f) => f.endsWith(".ts"));
const read = (f: string): string => readFileSync(AUG_DIR + f, "utf8");

describe("widenPeek 계약 (docs/25 P7)", () => {
  /**
   * 같은 가시성 규칙에 여러 증강이 모디파이어를 걸면, 각자 `cur`를 무시하고 덮을 때
   * 최종 열람 범위가 **드래프트 픽 순서로 갈린다**. 실제로 rinshan_preview가
   * `{ mode:"peek", count:1 }`을 그대로 돌려줘서, 왕패를 더 넓게 여는 증강
   * (왕패의 주인 14장·이면투시 전체 공개)을 1장으로 좁혀 버렸다.
   */
  /**
   * 예외: **가리는**(narrowing) 모디파이어. 남에게서 정보를 빼앗는 것이 능력이라
   * "더 넓은 쪽을 남긴다"는 widenPeek의 의미가 반대로 적용된다. 이들은 대신
   * cur를 직접 비교해 이미 더 좁게 가려진 것을 넓히지 않는지 스스로 확인한다.
   */
  const NARROWING = new Set(["hidden_river.ts", "brief_fog.ts"]);

  it("정보를 여는 visibility.* 모디파이어는 widenPeek을 거친다", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = read(f);
      if (!src.includes("addModifier<VisibilityRule>")) continue;
      if (NARROWING.has(f)) continue;
      // `return { mode: "peek" ... }` 형태로 cur를 무시하고 덮는 곳
      if (/return\s*\{\s*mode:\s*"peek"/.test(src)) offenders.push(f);
    }
    expect(offenders, "widenPeek 없이 peek을 덮어쓰는 증강").toEqual([]);
  });

  // 참고: brief_fog는 비보유자에게 무조건 "count_only"를 돌려줘 **피해자가 자기 바닥도
  // 못 보는** 별개 결함이 있다(docs/25 정보 계열 #2, 미해결). 그 수정은 owner 면제를
  // 다루는 별도 작업이라 여기서 계약으로 강제하지 않는다.
});

describe("숨은 리치 인지 계약 (docs/25 P3)", () => {
  /**
   * 리치 중인 **상대**를 대상에서 빼는 증강은 원시 `byPlayer[target].riichi`를
   * 보면 안 된다 — 스텔스 리치를 건 사람만 후보에서 조용히 사라져, 그 빈자리가
   * 곧 "저 사람이 리치다"가 된다. riichiBlocksSwap/riichiHidden을 거쳐야 한다.
   *
   * 자기 자신의 리치를 보는 것은 무해하다(본인은 이미 안다).
   */
  const SELF_READ = /byPlayer\[(?:req\.player|player|holder|h|me|p\.id|winner)\]/;

  it("손 교환 3종은 대상 판정에 riichiBlocksSwap을 쓴다", () => {
    for (const f of ["hand_swap3.ts", "full_hand_swap.ts", "seat_swap.ts"]) {
      const src = read(f);
      expect(src, `${f}: riichiBlocksSwap 미사용`).toContain("riichiBlocksSwap");
      // 대상(target)에 대한 원시 riichi 조회가 남아 있으면 안 된다
      const rawTargetReads = (src.match(/byPlayer\[target[^\]]*\]\??\.riichi/g) ?? []).filter(
        (m) => !SELF_READ.test(m),
      );
      expect(rawTargetReads, `${f}: 대상의 원시 riichi 조회`).toEqual([]);
    }
  });
});

describe("augPoints 기록 계약 (docs/25 P9)", () => {
  /**
   * 정산 deltas를 직접 고치면서 augPoints를 안 남기면, 결과 화면이 표시하는 합계와
   * 실제 점수 증감이 어긋난다 — 클라이언트는 화료자 표시 점수를
   * `w.points + augPointsOf(...)`로 계산하기 때문이다(App.tsx). 판돈·연승 배수·
   * 부활·역만 방어·강탈이 전부 "유령 점수"로 움직였다.
   *
   * addWinPointBonus / addWinPointTransfer / addHanBonus 래퍼는 내부에서
   * withAugPoint를 부르므로, 래퍼만 쓰는 증강은 이 계약을 자동으로 만족한다.
   */
  const WRAPPERS = ["addWinPointBonus", "addWinPointTransfer", "addHanBonus", "addWinHanBonus"];

  it("settleInterceptor로 deltas를 직접 고치는 증강은 augPoints를 남긴다", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = read(f);
      if (!src.includes("settleInterceptor")) continue;
      // deltas를 payload에 실어 돌려주는가 (직접 수정)
      if (!/deltas[,:]/.test(src)) continue;
      // 호출부만 센다 — 이름만 보면 주석에 적힌 설명까지 기록으로 잡힌다.
      // `withAugNoteFor`는 **남의 줄에** 남기는 같은 계약의 짝이다(지불자 재배선).
      if (/\b(?:withAugPoint|withAugNoteFor)\(/.test(src)) continue;
      // 래퍼만 쓰는 경우는 통과 (래퍼가 내부에서 기록한다)
      if (WRAPPERS.some((w) => src.includes(w))) continue;
      offenders.push(f);
    }
    expect(offenders, "deltas만 고치고 augPoints를 안 남기는 증강").toEqual([]);
  });
});

describe("커스텀 역 보유자 등록 계약 (docs/25 시스템 횡단 #7)", () => {
  /**
   * 커스텀 역은 게임(YakuRegistry)당 1회만 등록하고 보유자는 `yakuHolders` 집합으로
   * 가린다. 그래서 코어의 `uninstallAugment`가 source로 걷어낼 수 없는 유일한
   * 잔재다 — 직접 `.add(holder)`를 부르면 증강이 파괴된 뒤에도 **역이 계속 성립한다**.
   * `addYakuHolder`는 등록과 동시에 `ctx.onUninstall`로 해제까지 걸어 준다.
   */
  it("yakuHolders 등록은 addYakuHolder를 거친다", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = read(f);
      if (/yakuHolders\([^)]*\)\.add\(/.test(src)) offenders.push(f);
    }
    expect(offenders, "addYakuHolder 없이 보유자를 직접 추가하는 증강").toEqual([]);
  });
});

describe("턴 카운터 계약 (docs/25 P5)", () => {
  /**
   * `discardedKinds`는 **후리텐 이력**이라 누명(frame_up)이면 지목당한 사람 쪽에
   * 새겨지고, 거신병·미래를 보는 자는 이 목록을 통째로 다시 쓴다. 그래서 이 길이를
   * "내가 몇 번 버렸나"로 쓰면 매 버림을 남의 바닥에 심는 것만으로 값이 0에 고정돼
   * **10순에도 "첫 순"** 으로 인정된다. 턴 세기는 `discardCount`가 단일 진실이다.
   */
  it("discardedKinds.length를 턴 카운터로 쓰지 않는다", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (/discardedKinds\.length/.test(read(f))) offenders.push(f);
    }
    expect(offenders, "discardedKinds.length를 세는 증강 (discardCount를 쓸 것)").toEqual(
      [],
    );
  });
});

describe("깡 판정 단일 진실 계약 (docs/25 벽패/왕패/깡 #9)", () => {
  /**
   * 장사진(`snake_kan`)의 '4연속 깡' 판정은 코어 `isRunQuad`가 단일 진실이다.
   * 증강 쪽에 사본을 두면 엔진의 ankan validate와 봇 정책이 서로 다른 규칙을 보게 되어,
   * 봇이 제시받지 못한 깡을 고르거나 반대로 낼 수 있는 깡을 영영 안 치게 된다.
   */
  it("증강이 isRunQuad를 자체 구현하지 않는다", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (/function\s+isRunQuad\s*\(/.test(read(f))) offenders.push(f);
    }
    expect(offenders, "isRunQuad 사본을 둔 증강 (코어에서 import할 것)").toEqual([]);
  });
});

// ───────────── 소스 스캔 공용: 주석을 걷어낸 코드 · 호출 인자 추출 (아래 두 계약이 쓴다) ─────────────

/** 블록·행 주석을 걷어낸다 — 주석에 적힌 설명이 «호출»로 잡히지 않게 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** `name(` 호출마다 괄호 안 텍스트를 돌려준다 (중첩 괄호 안전 — 여러 줄 호출도 한 덩어리) */
function callArgs(code: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b${name}\\(`, "g");
  for (let m = re.exec(code); m !== null; m = re.exec(code)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < code.length && depth > 0) {
      const ch = code[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    out.push(code.slice(start, i - 1));
  }
  return out;
}

describe("손 가공 표식 계약 (handAltered — 천화·지화 게이트, docs/55 C-2·C-3)", () => {
  /**
   * 손패의 실물·종류를 갈아 끼우는 리듀서는 `handAlteredMark/Key`를 남겨야 한다 —
   * 코어의 천화·지화 게이트(`flow/helpers.ts` handAlteredByAugment)는 그 표식만 본다.
   * 자리 바꿈·선언 간파 위조가 표식 없이 손을 바꿔, 첫 순에 «만든» 손에 지화가 붙었다
   * (2026-09-16 QA 계획 C-2·C-3; 통째로 바꾸기가 같은 모양으로 48,000점 — aug-2 확정 2).
   *
   * 검사 대상: 주석을 걷어낸 코드에 `tileKindChanged(` 호출이 있거나, `moveTiles(` 호출
   * 인자에 `handZone(`이 있는 파일. 표식이 없는 파일은 아래 두 표 중 하나에 **이유와 함께**
   * 있어야 한다 — 표에 없는 새 파일이 잡히면 표식을 찍든지 이유를 적든지 둘 중 하나다.
   */
  const changesHand = (code: string): boolean =>
    /\btileKindChanged\(/.test(code) ||
    callArgs(code, "moveTiles").some((args) => /\bhandZone\(/.test(args));
  const marksAltered = (code: string): boolean => /\bhandAltered(?:Mark|Key)\(/.test(code);

  /** 구조상 첫 순 완성이 불가하거나, 같은 목적의 다른 게이트가 있는 것 */
  const STRUCTURALLY_SAFE: Record<string, string> = {
    "bluff_pretense.ts": "펑(후로)으로 완성 — CALL_MADE가 goAroundBroken·firstTurn을 내린다",
    "cliff_bloom.ts": "깡 뒤에만(영상패 고르기·만개) — 깡이 서면 첫 바퀴가 깨진다",
    "conjure_draw.ts":
      "자기 순에 선언해 다음 쯔모를 바꾼다 — 버림 1장 뒤라 TILE_DRAWN이 firstTurn을 내린다",
    "giant_god.ts": "국사 13종을 전부 버린 뒤 — 13순 뒤다",
    "haitei_lord.ts": "해저패(패산 마지막 장) 전용",
    "meld_dissolve.ts": "해체할 후로가 있었다 — 첫 바퀴는 이미 깨졌고 되돌아오지 않는다",
    "north_trader.ts": "자체 게이트 — win.blockedYaku로 보유자의 tenhou·chihou를 막는다",
    "off_by_one.ts": "리치 후 쯔모 — 리치 선언 버림 뒤라 firstTurn이 내려간다",
    "red_five_touch.ts": "kind 불변(적도라 attrs만 각인) — 화료형이 바뀌지 않는다",
    "void_kan.ts": "타가의 깡에 창깡(론) — 쯔모가 아니고 깡이 서 있다",
  };
  /**
   * **알려진 미수정** — 첫 순에도 손을 바꿀 수 있는데 표식이 없다(C-2·C-3의 형제).
   * 2026-09-16 묶음 A-4의 수정 범위 밖이라 표로 잡아 두고 보고한다. 고치면(표식을 찍으면)
   * 이 표에서 **지워야** 통과한다 — 표가 낡은 채 남지 않게 아래에서 정확히 대조한다.
   */
  const KNOWN_GAPS: Record<string, string> = {
    // rinshan_preview.ts 는 A-10(2026-09-16)이 교환 리듀서에 handAlteredMark 를 넣어 표에서 뺐다.
    // ura_peek.ts 는 #516(2026-09-16)이 바꿔치기 리듀서에 handAlteredMark 를 넣어 표에서 뺐다.
  };

  it("손패를 갈아 끼우는 파일은 handAltered 표식을 남긴다 (예외는 표로 정확히 고정)", () => {
    const flagged = files.filter((f) => changesHand(stripComments(read(f))));
    // 검사기 자기 검증 — 이번에 고친 두 파일과 형제들이 검사 대상에 실제로 잡힌다
    for (const f of ["seat_swap.ts", "peek_riichi_waits.ts", "full_hand_swap.ts", "hand_swap3.ts"]) {
      expect(flagged, `${f}가 검사 대상에서 빠졌다 — 검사 조건을 확인할 것`).toContain(f);
    }
    const without = flagged.filter((f) => !marksAltered(stripComments(read(f)))).sort();
    const expected = [...Object.keys(STRUCTURALLY_SAFE), ...Object.keys(KNOWN_GAPS)].sort();
    expect(
      without,
      "handAltered 없이 손을 바꾸는 파일 == 예외 표 (이유 없는 추가·낡은 항목 모두 실패)",
    ).toEqual(expected);
  });
});

describe("숨은 리치 인지 계약 — 전수 (docs/55 C-5)", () => {
  /**
   * 위 «손 교환 3종» 검사의 전수판. **타인**의 리치를 원시 `byPlayer[x].riichi`로 읽는 파일은
   * 그 결과가 후보 목록·배너·발동 여부로 밖에 드러나므로 riichiHidden 계열
   * (riichiHidden / riichiBlocksSwap / breakStealthRiichiEvents)을 거쳐야 한다.
   * 리치 봉인·등 떠밀기가 3파일 검사 밖에 있어서 스텔스 리치가 "봉인이 안 선다"·
   * "낙인이 안 터진다"로 샜다(2026-09-16).
   *
   * 자기 자신의 리치를 보는 것은 무해하다(본인은 이미 안다) — 식별자 이름으로 가른다.
   */
  const SELF = new Set(["req.player", "player", "holder", "h", "me", "winner", "ctx.holder"]);
  const HIDDEN_AWARE = /\b(?:riichiHidden|riichiBlocksSwap|breakStealthRiichiEvents)\(/;
  /**
   * 예외: **화료 정산 시점**의 방총자 조회. 국이 끝나는 순간이라 은닉이 지킬 «진행 중»
   * 정보가 없다(stealth_riichi 머리말: 은닉은 '진행 중'에만 걸린다).
   */
  const SETTLEMENT_READS: Record<string, string> = {
    "open_riichi_reveal.ts": "addWinHanBonus의 info.from — 화료 정산",
    "soul_hunt.ts": "scoring.uraWithoutRiichi의 방총자 — 론 채점",
  };

  it("타인의 리치를 읽는 파일은 riichiHidden 계열을 거친다", () => {
    const offenders: string[] = [];
    const settlementSeen: string[] = [];
    for (const f of files) {
      const code = stripComments(read(f));
      const others = [...code.matchAll(/byPlayer\[([^\]]+)\]\??\.riichi\b/g)]
        .map((m) => (m[1] as string).trim())
        .filter((idx) => !SELF.has(idx));
      if (others.length === 0) continue;
      if (f in SETTLEMENT_READS) {
        settlementSeen.push(f);
        continue;
      }
      if (HIDDEN_AWARE.test(code)) continue;
      offenders.push(`${f}: byPlayer[${[...new Set(others)].join(", ")}]`);
    }
    expect(offenders, "타인 리치를 원시 조회하면서 riichiHidden 계열이 없는 파일").toEqual([]);
    // 예외 표가 낡지 않게 — 표의 파일은 실제로 타인 조회가 있어야 한다
    expect(settlementSeen.sort()).toEqual(Object.keys(SETTLEMENT_READS).sort());
  });
});
