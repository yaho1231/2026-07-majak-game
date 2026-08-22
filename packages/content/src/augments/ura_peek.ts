/**
 * 이면투시 (ura_peek, silver) — 뒷도라를 보고, 마음에 안 들면 바꿔치기한다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b C (52차 버프)
 *
 * ① 확인(기존): 국당 1회, 자기 턴에 뒷도라 표시패를 본인만 확인한다. 한 번 열어 두면
 *    그 국에 깡으로 뒷도라가 늘어날 때마다 새 표시패도 자동으로 보인다.
 * ② 바꿔치기(신규): 이면투시를 이미 발동한 국에 한해 **국당 1회**, 뒷도라 표시패
 *    (첫 번째 것)를 왕패의 **영상패**와 자리째 맞바꾼다 — 알고도 아무것도 못 하던
 *    정보형에서 "내 손에 맞는 뒷도라를 직접 고르는" 능동형이 된다.
 *
 * 구현: peek_riichi_waits 패턴. 커스텀 액션 + 리듀서가 왕패의 뒷도라 표시패 kind를
 * 읽어 viewKey(holder,"ura")에 기록. 국당 1회 플래그. 새 국에 지운다.
 * 바꿔치기 리듀서는 왕패 배열의 두 자리를 그대로 맞바꾸므로 왕패 장수·도라 표시패의
 * 절대 인덱스가 보존되고, 교환 직후 보유자의 뒷도라 뷰를 새 패로 갱신한다.
 */

import {
  DEAD_WALL,
  INDICATOR_BLOCK_SIZE,
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  kindKey,
  kindOf,
  playerAtSeat,
  uraIndicatorIds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import type { VisibilityRule } from "@majak/core";
import { flagOf, publishUsesLeft, roundViewKey, viewKey, widenPeek } from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "ura_peek";
const ACTION = "ura_peek_reveal";
const ACTION_SWAP = "ura_swap";
const EVENT = "UraPeeked";
const EVENT_SWAP = "UraSwapped";
const uraViewKey = (h: PlayerId): string => roundViewKey(h, "ura");
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);
/** 국당 1회 바꿔치기 플래그 */
const swappedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "swapped", state, h);

interface UraPeekedPayload {
  holder: PlayerId;
  kinds: string[];
  usedKey: string;
}

interface UraSwappedPayload {
  holder: PlayerId;
  /** 지금 뒷도라 표시패 자리에 있는 패 */
  uraTileId: TileId;
  /** 그 자리로 밀어 넣을 왕패의 다른 패 */
  otherTileId: TileId;
  viewKey: string;
  swappedKey: string;
}

/**
 * 손대면 안 되는 왕패 자리.
 *
 * ⚠ 예전에는 **이미 뒤집힌** 표시패와 그 +1만 잠갔다. 그래서 2번째(=다음 깡) 도라
 * 표시패 자리도, 그 뒷도라 자리도 전부 교환 후보로 열려 있었고, 왕패 전체가 보이는
 * 이 증강의 홀더가 **다음 깡 도라를 직접 심고** 스스로 깡을 쳐서 여는 조합이 성립했다
 * (2026-08-22 QA aug-4 확정 5). 깡 도라는 테이블 전원의 손에 붙는다.
 * 카드는 "도라 표시패 자리는 건드릴 수 없다"고 못 박았는데 구현이 그 반대였다.
 *
 * 표시패 블록은 늘 왕패의 **마지막 10장**이고(`INDICATOR_BLOCK_SIZE`), 자리는
 * 뒤집혔는지와 무관하게 `doraIndicatorIndex(state, k) = len - 10 + 2k`로 처음부터
 * 정해져 있다(core `GameState.ts`). 규약이 코어에 있으니 그대로 따라 블록 전체를 잠근다.
 *
 * 남는 후보는 앞쪽 **영상패 자리**뿐이다. 왕패는 영상패 4 + 표시패 블록 10이 전부라,
 * 영상패까지 잠그면 교환 상대가 하나도 남지 않아 능력이 통째로 죽는다 — 그래서
 * 여기서는 잠그지 않고, 대신 detail에 "영상패와 맞바꾼다"를 명시했다(같은 감사 의심 4:
 * `deadIndex:0`은 `sys.drawRinshan`이 뽑는 다음 깡의 쯔모다). 이 축을 정말 닫으려면
 * 교환 상대를 왕패가 아니라 패산에서 가져오는 **재설계**가 필요하다.
 */
function lockedIndices(state: GameState): Set<number> {
  const len = state.zones[DEAD_WALL]?.tileIds.length ?? 0;
  const locked = new Set<number>();
  for (let i = Math.max(0, len - INDICATOR_BLOCK_SIZE); i < len; i++) locked.add(i);
  return locked;
}

const uraPeekAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no ura_peek augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    return null;
  },
  toEvents: (req, { state }) => {
    const kinds = uraIndicatorIds(state).map((id) => kindKey(kindOf(state, id)));
    const payload: UraPeekedPayload = {
      holder: req.player,
      kinds,
      usedKey: usedKey(state, req.player),
    };
    return [{ type: EVENT, payload }];
  },
};

const uraSwapAction: ActionDef<{ deadIndex: number }> = {
  type: ACTION_SWAP,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no ura_peek augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 본 적 없는 뒷도라는 바꿀 수 없다 — 이면투시를 발동한 국에만 열린다
    if (!flagOf(state, usedKey(state, req.player))) return "ura not revealed yet";
    if (flagOf(state, swappedKey(state, req.player))) {
      return "already swapped this round";
    }
    if (uraIndicatorIds(state)[0] === undefined) return "no ura indicator";
    const deadWall = state.zones[DEAD_WALL]?.tileIds ?? [];
    const idx = req.payload.deadIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= deadWall.length) {
      return "invalid dead wall index";
    }
    // 표시패 블록 전체(도라·뒷도라 10자리)는 뒤집혔든 아니든 건드리지 않는다
    // — lockedIndices 주석 참고
    if (lockedIndices(state).has(idx)) return "cannot swap with an indicator slot";
    return null;
  },
  toEvents: (req, { state }) => {
    const payload: UraSwappedPayload = {
      holder: req.player,
      uraTileId: uraIndicatorIds(state)[0] as TileId,
      otherTileId: (state.zones[DEAD_WALL]?.tileIds ?? [])[
        req.payload.deadIndex
      ] as TileId,
      viewKey: uraViewKey(req.player),
      swappedKey: swappedKey(state, req.player),
    };
    return [{ type: EVENT_SWAP, payload }];
  },
};

export const uraPeek: AugmentDef = defineAugment({
  id: ID,
  tier: "silver",
  category: "info",
  complexity: 2,
  name: "이면투시",
  description:
    "(매 국 1회 + 바꿔치기 1회) 자기 순에 뒷도라 표시패를 나만 확인한다. 확인한 국에는 1회, 첫 번째 뒷도라 표시패를 왕패의 다른 패와 바꿔치기할 수 있다.",
  detail:
    "(매 국 1회 + 바꿔치기 1회) 한 번 열면 그 국 동안 유지되어, 깡으로 뒷도라가 늘면 새 표시패도 자동으로 보인다. 바꿔치기 상대는 왕패의 **영상패**뿐이다 — 도라·뒷도라 표시패 자리는 뒤집혔든 아니든 건드릴 수 없다.\n\n바꿔치기를 쓰기 전까지 왕패 전체가 자신에게만 보인다. 국이 바뀌면 확인한 정보는 지워진다.",
  // 봇: 텐파이일 때 확인한다 — 리치를 걸지 다마텐으로 갈지 판단할 정보가 가장 필요한 시점.
  //     (바꿔치기는 내 손패와 맞춰 골라야 해서 봇에게 맡기지 않는다.)
  bot: plan({
    intent: "inform",
    oneShot: true,
    pick: ({ options, tenpai }) =>
      tenpai ? (options.find((o) => o.type === ACTION) ?? null) : null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.reducers.has(EVENT)) {
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as UraPeekedPayload;
        return {
          ...state,
          augmentData: {
            ...state.augmentData,
            [uraViewKey(p.holder)]: p.kinds,
            [p.usedKey]: true,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(uraPeekAction);
    }
    if (!engine.actions.has(ACTION_SWAP)) {
      engine.actions.register(uraSwapAction);
      engine.reducers.register(EVENT_SWAP, (state, event) => {
        const p = event.payload as UraSwappedPayload;
        const zone = state.zones[DEAD_WALL];
        if (zone === undefined) throw new Error("UraSwapped: no dead wall");
        const ids = [...zone.tileIds];
        const i = ids.indexOf(p.uraTileId);
        const j = ids.indexOf(p.otherTileId);
        if (i < 0 || j < 0) throw new Error("UraSwapped: tile not in dead wall");
        ids[i] = p.otherTileId;
        ids[j] = p.uraTileId;
        const next: GameState = {
          ...state,
          zones: { ...state.zones, [DEAD_WALL]: { ...zone, tileIds: ids } },
        };
        // 바뀐 뒷도라를 보유자 뷰에 즉시 반영 — 무엇으로 바뀌었는지 그 자리에서 본다
        return {
          ...next,
          augmentData: {
            ...next.augmentData,
            [p.viewKey]: uraIndicatorIds(next).map((id) =>
              kindKey(kindOf(next, id)),
            ),
            [p.swappedKey]: true,
          },
        };
      });
    }

    // 바꿔치기 상대를 고르려면 왕패가 **보여야 한다** — 안 보이면 클라이언트의
    // 교환 모달이 빈 칸만 띄우고(왕패는 기본 hidden) 눈 감고 바꾸는 꼴이 된다
    // (2026-08-01 사용자 보고). 그래서 이면투시를 발동한 국에, 아직 바꿔치기를
    // 쓰지 않은 동안만 보유자에게 왕패 전체를 연다. 바꾸고 나면 다시 닫힌다.
    engine.rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        if (!flagOf(state, usedKey(state, holder))) return cur;
        if (flagOf(state, swappedKey(state, holder))) return cur;
        return widenPeek(cur, {
          mode: "peek",
          count: state.zones[DEAD_WALL]?.tileIds.length ?? 0,
        });
      },
    });

    // 새 국 시작 시 지난 국의 뒷도라 정보를 지운다
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const v = rc.state.augmentData[uraViewKey(holder)];
      if (Array.isArray(v) && v.length > 0) {
        rc.emit(augmentDataSet(uraViewKey(holder), []));
      }
    });

    // 발동한 뒤 깡으로 새 도라 표시패가 뒤집히면 새로 생긴 뒷도라도 함께 보인다.
    // (예전엔 발동 시점의 뒷도라만 기록해, 이후 깡으로 늘어난 뒷도라가 영영 안 보였다.
    //  "이번 국의 뒷도라를 본다"가 능력이므로 국 안에서는 계속 최신이어야 한다.)
    //
    // ⚠ 그 갱신이 `DORA_FLIPPED` **하나**에만 걸려 있었다. 뒷도라 표시패의 **자리를
    // 갈아 끼우는** 증강(왕패의 주인 dead_wall_master의 왕패 ↔ 손패 교환)은 그 이벤트를
    // 내지 않아, 화면이 확인 시점의 값에서 굳은 채 **낡은 뒷도라를 계속 보여 줬다** —
    // 정산은 새 표시패로 정확히 계산되므로 화면만 거짓이 됐고, "리치를 걸지 다마로 갈지"
    // 라는 이 카드의 전부가 거짓 정보 위에 섰다(2026-08-23, QA synergy3 kandora 확정 4).
    // 거울(mirror_dora)이 같은 함정을 먼저 밟고 `reaction("*")` + 값 비교로 고쳤다
    // (qa-lab score-b 확정 4) — 이벤트를 열거하는 방식은 새 증강마다 구멍이 다시 열리므로
    // 같은 방식을 따른다. 값이 같으면 아무것도 안 내므로 반응 연쇄는 한 겹에서 멈춘다.
    ctx.reaction("*", (_event, rc) => {
      if (!flagOf(rc.state, usedKey(rc.state, holder))) return;
      const kinds = uraIndicatorIds(rc.state).map((id) =>
        kindKey(kindOf(rc.state, id)),
      );
      const shown = rc.state.augmentData[uraViewKey(holder)];
      const same =
        Array.isArray(shown) &&
        shown.length === kinds.length &&
        kinds.every((k, i) => shown[i] === k);
      if (same) return;
      rc.emit(augmentDataSet(uraViewKey(holder), kinds));
    });

    ctx.holderTurnOptions((state) => {
      const options: { type: string; payload: unknown }[] = [
        { type: ACTION, payload: {} },
      ];
      // 이미 확인했고 아직 안 바꿨으면 왕패 자리별 교환 후보 (validate가 최종 판정)
      if (
        flagOf(state, usedKey(state, holder)) &&
        !flagOf(state, swappedKey(state, holder))
      ) {
        const locked = lockedIndices(state);
        const size = state.zones[DEAD_WALL]?.tileIds.length ?? 0;
        for (let i = 0; i < size; i++) {
          if (locked.has(i)) continue;
          options.push({ type: ACTION_SWAP, payload: { deadIndex: i } });
        }
      }
      return options;
    });
  },
});
