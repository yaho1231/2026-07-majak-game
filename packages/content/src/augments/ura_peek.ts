/**
 * 이면투시 (ura_peek, silver) — 뒷도라를 보고, 마음에 안 들면 바꿔치기한다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b C (52차 버프)
 *
 * ① 확인(기존): 국당 1회, 자기 턴에 뒷도라 표시패를 본인만 확인한다. 한 번 열어 두면
 *    그 국에 깡으로 뒷도라가 늘어날 때마다 새 표시패도 자동으로 보인다.
 * ② 바꿔치기: 이면투시를 이미 발동한 국에 한해 **국당 1회**, 뒷도라 표시패(첫 번째 것)를
 *    **내 손패 1장**과 자리째 맞바꾼다 — 표시패 자리에 내가 고른 패가 들어가고 원래
 *    표시패는 내 손으로 온다. 알고도 아무것도 못 하던 정보형에서 "내 손에 맞는 뒷도라를
 *    직접 심는" 능동형이 된다 (2026-09-04. 그전에는 왕패의 영상패와 맞바꿨다).
 *
 * 구현: peek_riichi_waits 패턴. 커스텀 액션 + 리듀서가 왕패의 뒷도라 표시패 kind를
 * 읽어 viewKey(holder,"ura")에 기록. 국당 1회 플래그. 새 국에 지운다.
 * 바꿔치기 리듀서는 왕패의 뒷도라 표시패 자리에 손패를 그대로 밀어 넣으므로(왕패의 주인과
 * 같은 `moveTiles` 2단) 왕패 장수·표시패의 절대 인덱스가 보존되고, 교환 직후 보유자의
 * 뒷도라 뷰를 새 패로 갱신한다. 손패 장수도 1:1이라 그대로다.
 *
 * 쯔모패를 내보내면 들어온 표시패가 새 쯔모패다(`replaceDrawnTile`) — 안 하면
 * `lastDrawnTile`이 왕패로 간 실물을 가리켜 쯔모 화료·깡 판정이 손에 없는 패를 본다.
 * 리치 중에는 바꿔치기 자체가 닫힌다(#516) — 2026-09-16 운영 크래시(리치 중 쯔모패
 * 바꿔치기 → 버릴 패 0장 → 판 사망)의 두 겹 방어. 회귀: ura_peek_riichi · ura_peek_swap_crash_0916.
 */

import {
  DEAD_WALL,
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  kindKey,
  kindOf,
  moveTiles,
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
import {
  flagOf,
  publishUsesLeft,
  replaceDrawnTile,
  roundViewKey,
  widenPeek,
} from "../util.js";
import { plan } from "./botPlan.js";
import { handAlteredMark } from "./handAltered.js";
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
  /** 지금 뒷도라 표시패 자리에 있는 패 — 내 손으로 온다 */
  uraTileId: TileId;
  /** 그 자리로 밀어 넣을 내 손패 */
  handTileId: TileId;
  /** 뒷도라 표시패의 왕패 자리 (손패를 여기로 밀어 넣는다) */
  uraIndex: number;
  viewKey: string;
  swappedKey: string;
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

const uraSwapAction: ActionDef<{ handTileId: TileId }> = {
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
    // 리치 중에는 손이 동결된다 — 손패를 갈아 끼우는 계열(hand_swap3·full_hand_swap·
    // dead_wall_master)과 같은 규약. 리치 손의 한 장을 뒷도라 표시패와 바꾸면 리치
    // 선언 시점의 텐파이가 깨진 채 강제 쯔모기리로 흘러 게임이 터졌다(2026-09-16 사용자 보고).
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    // 본 적 없는 뒷도라는 바꿀 수 없다 — 이면투시를 발동한 국에만 열린다
    if (!flagOf(state, usedKey(state, req.player))) return "ura not revealed yet";
    if (flagOf(state, swappedKey(state, req.player))) {
      return "already swapped this round";
    }
    const uraId = uraIndicatorIds(state)[0];
    if (uraId === undefined) return "no ura indicator";
    if ((state.zones[DEAD_WALL]?.tileIds ?? []).indexOf(uraId) < 0) {
      return "ura indicator not in dead wall";
    }
    if (!handIdsOf(state, req.player).includes(req.payload.handTileId)) {
      return "tile not in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const uraId = uraIndicatorIds(state)[0] as TileId;
    const payload: UraSwappedPayload = {
      holder: req.player,
      uraTileId: uraId,
      handTileId: req.payload.handTileId,
      uraIndex: (state.zones[DEAD_WALL]?.tileIds ?? []).indexOf(uraId),
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
    "(매 국 1회) 뒷도라 표시패를 나만 확인하고, 그 국에 한 번은 내 손패 1장을 골라 뒷도라 표시패와 바꾼다.",
  detail:
    "뒷도라 표시패를 나만 확인한다. 확인한 표시패는 그 국 동안 계속 보이고, 깡으로 늘어난 표시패도 보인다. 그 국에 한 번은 내 손패 1장을 뒷도라 표시패와 바꿀 수 있다.\n\n바꿔 넣은 패의 다음 패가 뒷도라가 된다(예: 5통을 넣으면 6통). 확인한 뒤에는 바꾸기 전까지 왕패 전체가 나에게 보인다.",
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
        if (state.zones[DEAD_WALL] === undefined) {
          throw new Error("UraSwapped: no dead wall");
        }
        // 뒷도라 표시패 → 내 손 / 비워진 그 자리에 내 손패를 밀어 넣는다
        // (왕패 장수와 표시패의 절대 인덱스가 보존된다 — 왕패의 주인과 같은 2단 이동)
        let zones = moveTiles(state.zones, DEAD_WALL, handZone(p.holder), [
          p.uraTileId,
        ]);
        zones = moveTiles(
          zones,
          handZone(p.holder),
          DEAD_WALL,
          [p.handTileId],
          p.uraIndex,
        );
        /*
         * 쯔모패를 내보냈다면 **들어온 표시패가 새 쯔모패다** (왕패의 주인과 같은 규약,
         * `replaceDrawnTile`이 lastDrawRinshan도 함께 내린다).
         *
         * 이걸 안 하면 `lastDrawnTile`이 왕패로 가 버린 실물을 계속 가리킨다. 리치 중
         * 버림은 «쯔모패만»이라(standardActions discard validate) 손에 없는 패 =
         * 버릴 패 0장 — 확인·바꿔치기도 이미 써서 다른 선택지가 없으면 turnPrompt가
         * 「Turn player pN has no legal actions」로 던지고, HanchanController의 discard
         * 폴백은 pending이 비워진 뒤라 «No pending decision»으로 판 전체가 죽었다
         * (2026-09-15 room X25Z4Q p2 · 2026-09-06 room FERBGU p0, 둘 다 리치 중 쯔모패
         * 바꿔치기). 리치가 아니어도 쯔모 화료·깡 판정이 손에 없는 패를 봤다.
         */
        const round =
          state.round.lastDrawnTile === p.handTileId
            ? replaceDrawnTile(state.round, p.uraTileId)
            : state.round;
        const next: GameState = { ...state, zones, round };
        // 바뀐 뒷도라를 보유자 뷰에 즉시 반영 — 무엇으로 바뀌었는지 그 자리에서 본다
        return {
          ...next,
          augmentData: {
            ...next.augmentData,
            [p.viewKey]: uraIndicatorIds(next).map((id) =>
              kindKey(kindOf(next, id)),
            ),
            [p.swappedKey]: true,
            // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고)
            ...handAlteredMark(state, p.holder),
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
      // 이미 확인했고 아직 안 바꿨으면 손패 한 장을 표시패 자리로 보낼 수 있다
      // (리치 중에는 후보 자체를 내지 않는다 — validate와 같은 기준. 후보가 남아 있으면
      //  `FlowController`의 리치 강제 쯔모기리 자동 진행이 사라진다.)
      if (
        state.round.byPlayer[holder]?.riichi == null &&
        flagOf(state, usedKey(state, holder)) &&
        !flagOf(state, swappedKey(state, holder)) &&
        uraIndicatorIds(state)[0] !== undefined
      ) {
        for (const handTileId of handIdsOf(state, holder)) {
          options.push({ type: ACTION_SWAP, payload: { handTileId } });
        }
      }
      return options;
    });
  },
});
