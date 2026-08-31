/**
 * kan — 깡을 칠 것인가.
 *
 * 깡은 **턴을 소비하지 않는 추가 행동**이다(영상패를 뽑고 다시 프롬프트가 온다).
 * 그래서 버림·리치와 경쟁하지 않는다 — 물어야 할 것은 "안 치는 것보다 이득인가"
 * 하나뿐이고, 그 이득은 점수로 잴 수 있다.
 *
 *   버는 것 — 새 도라 한 장(내 손에도 붙는다) · 영상패(쯔모 한 번 더) · 부수
 *   내는 것 — 새 도라는 **남에게도 붙는다** · 손 모양 하나가 굳는다
 *
 * 예전에는 이 둘을 "남이 리치 중이면 치지 않는다" 같은 규칙으로 갈랐다. 규칙은
 * 오야 리치와 값싼 후로를 구분하지 못하고, 내 손이 만관인지 1000점인지도 보지 않는다.
 * 지금은 양쪽을 점수로 재서 뺀다.
 *
 * 서로 다른 패로 이루어지는 깡(장사진·동남서북)은 이득 계산이 손패 가치에 달려 있어
 * 여기서 판단하지 않는다 — 그 증강의 `bot` 정책이 직접 고른다.
 */

import { isTenpai, shantenOf, ukeireOf, winningKinds } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import type { TileId, TileKind } from "@majak/core";
import { kindKey } from "@majak/core";
import { meldKindsOf, removeKinds } from "./read.js";
import type { BotRead, HandPlan } from "./read.js";
import type { KnownDrawEffect } from "./value.js";
import type { BotProfile } from "./profile.js";
import { riskSight, skillOf } from "./skill.js";
import { waitTilesOf } from "./value.js";
import type { ActionBid } from "./decide.js";

const isNumber = (k: TileKind): boolean =>
  k.suit === "man" || k.suit === "pin" || k.suit === "sou";

/**
 * 깡 하나가 손 값어치를 올리는 몫.
 *
 * 새 도라 표시패가 뒤집히면 내 14장 중 평균 0.5장 남짓이 도라가 된다(리치 중이면
 * 우라도 한 장 더 열린다). 판수로는 0.5~1판, 점수로는 대략 4분의 1 정도가 오른다.
 */
const KAN_VALUE_GAIN = 0.26;

/**
 * 새 도라는 **남에게도 붙는다.** 상대가 이겼을 때 그 손이 비싸지는 몫에, 그 상대가
 * 실제로 이길 확률과 내가 물게 될 몫을 곱한 것이 내 손해다.
 */
const KAN_OPPONENT_WIN_RATE = 0.3;
const KAN_MY_SHARE = 0.45;

/**
 * 깡의 순이득을 점수로 잰다 (안 쳤을 때 대비). 칠 수 없거나 손을 망치면 null.
 */
export function bidKan(
  read: BotRead,
  options: readonly ActionOption[],
  profile: BotProfile,
  plan: HandPlan = null,
): ActionBid | null {
  const candidates: { option: ActionOption; rest: TileKind[]; addedMelds: number }[] = [];

  // 가깡 — 이미 펑한 묶음의 4번째. 손패에서 1장이 빠질 뿐이라 모양이 거의 안 변한다.
  for (const o of options) {
    if (o.type !== "shouminkan") continue;
    const tileId = (o.payload as { tileId?: TileId }).tileId;
    const kind = tileId !== undefined ? read.view.tiles[tileId]?.kind : undefined;
    if (kind === undefined) continue;
    const rest = removeKinds(read.hand, [kind]);
    // 텐파이를 깨는 가깡은 치지 않는다 (모양이 실제로 상한다)
    if (read.tenpai && !isTenpai(rest, read.meldCount, undefined, read.opts)) continue;
    candidates.push({ option: o, rest, addedMelds: 0 });
  }

  // 안깡 — 같은 종류 4장만 여기서 판단한다.
  for (const o of options) {
    if (o.type !== "ankan") continue;
    const ids = (o.payload as { tileIds?: TileId[] }).tileIds ?? [];
    const kinds: TileKind[] = [];
    for (const id of ids) {
      const k = read.view.tiles[id]?.kind;
      if (k !== undefined) kinds.push(k);
    }
    if (kinds.length !== 4) continue;
    const head = kinds[0];
    if (head === undefined) continue;
    if (!kinds.every((k) => k.suit === head.suit && k.rank === head.rank)) continue;

    const rest = removeKinds(read.hand, kinds);
    if (read.tenpai) {
      // 깡 뒤에도 텐파이여야 하고, 그 대기가 **깡친 패 자체만**이어서는 안 된다
      // (4장을 다 눕혔으니 그 패는 한 장도 안 남는다 = 죽은 대기).
      const waits = winningKinds(rest, read.meldCount + 1, undefined, read.opts);
      if (waits.length === 0) continue;
      if (!waits.some((w) => !(w.suit === head.suit && w.rank === head.rank))) continue;
    } else if (isNumber(head)) {
      // 그 4장이 슌쯔 재료로 쓰여 깡이 손을 뒤로 미는 형태라면 참는다.
      // (자패는 슌쯔로 쓸 일이 없어 언제나 커쯔 하나로 굳는 게 맞다.)
      const before = shantenOf(read.hand, read.meldCount, read.opts);
      if (shantenOf(rest, read.meldCount + 1, read.opts) > before) continue;
    }
    candidates.push({ option: o, rest, addedMelds: 1 });
  }

  let best: ActionBid | null = null;
  for (const c of candidates) {
    const value = gainOfKan(read, c.rest, c.addedMelds, plan, profile);
    if (best === null || value > best.value) {
      best = { option: c.option, value, reason: `깡 순이득 ${Math.round(value)}점` };
    }
  }
  return best;
}

/** 이 깡을 쳤을 때의 순이득 (점수) */
function gainOfKan(
  read: BotRead,
  rest: readonly TileKind[],
  addedMelds: number,
  plan: HandPlan,
  profile: BotProfile,
): number {
  const meldCount = read.meldCount + addedMelds;
  const shanten = shantenOf(rest, meldCount, read.opts);
  const waitTiles =
    shanten <= 0
      ? waitTilesOf(winningKinds(rest, meldCount, undefined, read.opts), read.remainingOf)
      : 0;
  const u = ukeireOf(rest, meldCount, read.remainingOf, read.opts);
  const ukeire = u.tiles;
  const waits =
    shanten <= 0 ? winningKinds(rest, meldCount, undefined, read.opts) : [];
  const shape = { shanten, waitTiles, ukeireTiles: ukeire };

  // 안깡·가깡은 멘젠을 깨지 않는다 — 값어치 계산의 meldCount는 그대로 둔다
  const value = read.valueOf({ plan });

  /**
   * **왕패가 보이면 깡의 두 몫을 어림하지 않고 그대로 읽는다** (왕패의 주인·영상 정찰).
   *
   *  - 영상패: 그 한 장이 오름패면 이 깡은 **그 자리에서 화료**다(영상개화). 헛패면
   *    "쯔모 한 번 더"의 값이 0이다 — 어림값 `extraDraws: 1`이 거짓이 되는 자리다.
   *  - 새 도라: 평균 0.26배(`KAN_VALUE_GAIN`) 대신 **내 손에 실제로 몇 장 붙는지**를 센다.
   *
   * 안 보이면 둘 다 null이라 종전 어림으로 떨어진다.
   */
  const seen = read.intel.deadWall;
  const known = knownAfterKan(read, seen.rinshan, waits, u.kinds);
  const newDora =
    seen.nextDora === null
      ? null
      : [...rest, ...meldKindsOf(read)].filter(
          (k) => kindKey(k) === kindKey(seen.nextDora as TileKind),
        ).length;
  const afterKanPoints =
    newDora === null
      ? value.points * (1 + KAN_VALUE_GAIN)
      : read.valueOf({ plan, doraDelta: newDora }).points;

  // 깡을 친 판 − 안 친 판. 깡은 값어치(새 도라)와 **기회(영상패 = 쯔모 한 번)를
  // 동시에 준다 — 둘 다 세야 "도라가 안 붙어도 깡이 이득"이 설명된다.
  const mine =
    read.winChanceOf({ ...shape, extraDraws: 1, known }) * afterKanPoints -
    read.winChanceOf(shape) * value.points;

  // 남에게도 도라가 붙는다 — 위협이 실재할수록 비싸진다
  let theirs = 0;
  for (const t of read.threats) {
    theirs += t.level * KAN_OPPONENT_WIN_RATE * t.value * KAN_VALUE_GAIN * KAN_MY_SHARE;
  }

  // 저돌적인 봇은 자기 손이 커지는 쪽을 더 크게 본다 (같은 계산, 다른 저울)
  const bias = (profile.aggression - 0.5) * 0.6;
  // 난이도 — 초보는 **남에게 붙는 도라**를 잘 안 센다(`bot/skill.ts`). 그래서 깡이
  // 자기 손을 키우는 면만 보이고, 판을 키워 놓고 자기가 맞는 일이 잦아진다.
  return mine * (1 + bias) - theirs * (1 - bias) * riskSight(skillOf(profile));
}

/**
 * 깡 뒤의 확정 쯔모 — **영상패가 맨 앞에 끼어든다**.
 *
 * 패산 쪽 확정 쯔모(삼세 예지·예지)는 그대로 뒤로 밀린다. 영상패는 왕패에서 오므로
 * 패산 순서를 소모하지 않는다 — 그래서 뒤 장들의 순번은 하나씩 늘어날 뿐 내용은 같다.
 */
function knownAfterKan(
  read: BotRead,
  rinshan: TileKind | null,
  waits: readonly TileKind[],
  ukeireKinds: readonly TileKind[],
): KnownDrawEffect | undefined {
  const wall = read.knownDrawsFor(waits, ukeireKinds);
  if (rinshan === null) return wall;
  const key = kindKey(rinshan);
  const isWait = waits.some((k) => kindKey(k) === key);
  const isUp = ukeireKinds.some((k) => kindKey(k) === key);
  const shifted = wall?.hitAt == null ? null : wall.hitAt + 1;
  return {
    hitAt: isWait ? 1 : shifted,
    advances: (wall?.advances ?? 0) + (isUp && !isWait ? 1 : 0),
    misses: (wall?.misses ?? 0) + (!isUp && !isWait ? 1 : 0),
  };
}

/** 깡을 칠 것인가 (예전 진입점 — 입찰의 얇은 껍데기) */
export function chooseKan(
  read: BotRead,
  options: readonly ActionOption[],
  profile: BotProfile,
  plan: HandPlan = null,
): ActionOption | null {
  const bid = bidKan(read, options, profile, plan);
  return bid !== null && bid.value > 0 ? bid.option : null;
}
