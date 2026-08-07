/**
 * 카탈로그 ↔ 소스 대조용 공용 도구 (테스트 전용).
 *
 * 2026-08-07 감사에서 나온 결함은 전부 **카탈로그의 말과 모듈의 코드가 갈라진 것**이었다
 * (설명이 약속한 수치를 코드가 안 지킴 · 표시명 중복 · 발동이 안 보임). 그걸 손으로
 * 찾았으므로 다음에 또 갈라지면 또 손으로 찾아야 한다. 여기 모아 둔 조회기 위에
 * 네 개의 가드가 서 있다.
 *
 * 증강 id ↔ 모듈 파일은 **파일명 관례**로 잇는다(`<id>.ts`). 표준 증강 4종만 코어의
 * `standardAugments.ts` 한 파일에 모여 있어 그 파일 전체를 소스로 본다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { standardAugments } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { contentAugments } from "../src/index.js";

const AUG_DIR = fileURLToPath(new URL("../src/augments/", import.meta.url));
const STANDARD_FILE = fileURLToPath(
  new URL("../../core/src/augment/standardAugments.ts", import.meta.url),
);

/** 표준 4종 + 콘텐츠 팩 전체 */
export const ALL_AUGMENTS: readonly AugmentDef[] = [
  ...standardAugments,
  ...contentAugments,
];

const STANDARD_IDS = new Set(standardAugments.map((a) => a.id));
const cache = new Map<string, string>();

/** 이 증강의 구현 모듈 소스 (표준 증강은 standardAugments.ts 전체) */
export function sourceOf(id: string): string {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const path = STANDARD_IDS.has(id) ? STANDARD_FILE : `${AUG_DIR}${id}.ts`;
  const src = readFileSync(path, "utf8");
  cache.set(id, src);
  return src;
}

/** 플레이어에게 보이는 글 전체 (한 줄 요약 + 도감 상세) */
export function playerFacingText(def: AugmentDef): string {
  return `${def.description}\n${def.detail ?? ""}`;
}
