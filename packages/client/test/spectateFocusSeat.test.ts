/**
 * 관전 시점 이동 — 초점 좌석의 «화면»을 같이 본다 (2026-09-04 사용자 보고).
 *
 * 「관전에서 시점을 이동했는데 그 좌석이 보고 있는 증강 정보(삼세 예지의 다음 쯔모
 * 3장)가 안 보인다. 그 시점에서는 실제 플레이어가 보고 있는 화면을 같이 본다는 느낌이
 * 되어야 하고, 추가 탭이 뜨고 그걸 선택하는 과정까지 관전에서 볼 수 있어야 한다.」
 *
 * 못 박는 것:
 *  1. 초점 좌석의 전용 채널은 core의 좌석별 맵(`augmentViewBySeat`)에서 조립한다
 *     (`focusAv`) — 평평한 키는 마지막 사람 것만 남아 어느 좌석의 것도 아니다.
 *  2. 관전이라고 정보를 끄던 가드(삼세 예지·지뢰 탐지·밑장빼기·자유 선언·뱃지 줄)가
 *     사라지고 초점 좌석 것을 읽는다. 단, 관전 뷰에서 통째로 열린 패산·왕패는
 *     **그 증강을 든 좌석**에서만 그 사람이 보는 만큼 자른다.
 *  3. 선택창은 초점 좌석이면 «그 사람 화면»(spec-choice-focus)으로, 버림과 섞인
 *     프롬프트(mixed)는 단추 자리의 읽기 전용 띠로, 고른 것은 잠깐 보여 준 뒤 걷는다.
 *
 * 이 패키지에는 jsdom이 없어 정적 소스 스캔으로 확인한다(broadcastSpectator.test.ts와 같다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const APP1 = APP.replace(/\s+/g, " ");

describe("관전 시점 이동 — 초점 좌석의 증강 정보", () => {
  it("초점 좌석의 augmentView를 좌석별 맵에서 조립한다 (전용 채널은 걷어 내고 그 좌석 몫을 덮는다)", () => {
    expect(APP).toContain("const focusAv = useMemo<Record<string, unknown>>");
    expect(APP).toContain("const bySeat = view.augmentViewBySeat;");
    expect(APP).toContain("if (!privateChannels.has(k)) out[k] = v;");
    expect(APP).toContain("Object.assign(out, bySeat[me.id] ?? {});");
    // 관전이 아니면 뷰 그대로 — 대국자 화면에는 영향이 없다
    expect(APP).toContain("if (!isSpectator || bySeat === undefined) return view.augmentView;");
  });

  it("삼세 예지·지뢰 탐지·밑장빼기 예약·자유 선언은 관전 가드 없이 초점 좌석 것을 읽는다", () => {
    expect(APP).toContain('const v = focusAv["triple_peek"];');
    expect(APP).not.toContain('if (isSpectator) return [];\n    const v = view.augmentView["triple_peek"]');
    expect(APP).toContain('readScanSnapshot(focusAv["danger_sense"], "kinds")');
    expect(APP1).toContain("focusAv[`bottom_deal:armed:${me.id}`] === true");
    expect(APP1).toContain("freeDeclareWaits(focusView, me.id)");
    expect(APP1).not.toContain("isSpectator ? [] : freeDeclareWaits(view, me.id)");
  });

  it("관전에서 통째로 열린 패산·왕패는 그 증강을 든 좌석에서만 그 사람이 보는 만큼 자른다", () => {
    expect(APP1).toContain(
      'return me.augments.includes("bottom_deal") ? wall.slice(-BOTTOM_DEAL_PEEK) : [];',
    );
    expect(APP).toContain("const BOTTOM_DEAL_PEEK = 3;");
    expect(APP1).toContain('spectator && !me.augments.includes("rinshan_preview") ? []');
    // 뱃지 줄은 관전에서도 초점 좌석의 사본으로 선다
    expect(APP1).toContain("<ActiveInfoBadges view={focusView} me={me} spectator={isSpectator} />");
    expect(APP1).not.toContain("{!isSpectator ? <ActiveInfoBadges");
  });
});

describe("관전 시점 이동 — 선택창은 그 사람 화면처럼", () => {
  it("초점 좌석의 선택창은 focus로 크게, 다른 좌석은 중계 카드로 그린다", () => {
    expect(APP1).toContain("focus={props.spectateChoice.seat === me.id}");
    expect(APP1).toContain('className={`spec-choice${focus ? " spec-choice-focus" : ""}`}');
    expect(CSS).toContain(".spec-choice-focus .spec-choice-panel {");
  });

  it("버림과 섞인 프롬프트(mixed)는 선택창이 아니라 단추 자리의 읽기 전용 띠다", () => {
    expect(APP1).toContain("props.spectateChoice.mixed === true && props.spectateChoice.seat === me.id");
    expect(APP).toContain("function SpectateUsableStrip(");
    expect(APP1).toContain("props.spectateChoice.mixed !== true ? ( <SpectateChoicePanel");
    expect(CSS).toContain(".spec-usable {");
  });

  it("고른 것은 잠깐 보여 준 뒤 걷는다 — 선택 «과정»의 마지막 장면", () => {
    expect(APP).toContain("const SPECTATE_PICK_HOLD_MS = 1600;");
    expect(APP1).toContain("cur === null || cur.seat !== msg.seat ? cur : { ...cur, picked }");
    expect(APP).toContain("}, SPECTATE_PICK_HOLD_MS);");
    // 새 선택창이 열리면 앞 픽의 타이머는 걷는다 — 뒤늦게 새 창을 닫아 버리지 않게
    expect(APP1).toContain(
      'if (msg.type === "spectateChoice") { // 관전 중계 — 어느 좌석의 선택창이 열렸다(스냅샷이라 그대로 갈아 끼운다). if (spectateChoiceHold.current !== null) { clearTimeout(spectateChoiceHold.current);',
    );
    expect(APP1).toContain('o.label === picked ? " spec-choice-opt-picked" : " spec-choice-opt-dim"');
    expect(CSS).toContain(".spec-choice-opt-picked {");
  });

  it("되감기 중에는 선택창을 붙이지 않는다", () => {
    expect(APP).toContain("isSpectator && spectateChoice !== null && rewindAt === null ? { spectateChoice } : {}");
  });
});
