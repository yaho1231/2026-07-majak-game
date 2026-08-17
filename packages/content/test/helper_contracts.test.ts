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
