/**
 * 스파이 (spy, prism).
 *
 * 매 국 1회, 자기 턴에 손패의 패 1종을 **비밀리에** 지정한다. 그 뒤로 상대가 그 종류를
 * 오름패로 화료하는 순간, 그 화료로 오가는 점수가 **전부 나에게 온다**.
 * 승리는 그대로 두고 지갑만 바꿔친다 — "화료한 자가 돈을 받는다"는 대전제 파괴.
 *
 * 설계 결정:
 * - **지정 내용은 비밀**(`view:{holder}:` 전용 채널). 증강 보유 사실과 "지정을 썼다"는
 *   것은 공개되지만(액션 발동은 actionFx로 브로드캐스트) 무엇을 지정했는지는 홀더만 안다.
 *   상대는 "무언가 찍혔다"는 사실만 알고 한 게임을 친다.
 * - **적발되는 순간은 전원 공개** — 정산에서 점수가 엉뚱한 곳으로 흘러가는 그 장면이
 *   이 증강의 전부다.
 * - 내 화료에는 발동하지 않는다(이미 내가 받는다). 지정은 게임이 끝날 때까지 유효하다.
 * - 리미트는 **국당 1회**라는 횟수뿐이다(무페널티 원칙) — 헛다리를 짚어도 잃는 것은 없다.
 *
 * # 버프 (2026-07-31 사용자 지시)
 *
 * 예전엔 지정이 **게임당 딱 한 번**이었다. 상대가 하필 그 한 종류로 화료해야 터지니
 * 대부분의 게임에서 아무 일도 일어나지 않고 끝났다 — 발동을 본 적이 없는 증강이었다.
 * 이제 **매 국 한 번씩 다시 찍을 수 있다.** 지정은 여전히 한 종류뿐이고 비밀이며,
 * 새로 찍으면 이전 지정을 덮어쓴다. 그 국의 흐름(누가 무엇을 모으는지)을 보고
 * 표적을 갱신하는 것이 이 증강의 플레이가 된다.
 *
 * 구현: ROUND_SETTLED 인터셉터에서 `payload.deltas`를 재작성한다(덤터기 scapegoat의
 * 지불 재배선과 같은 계열). 화료자의 이득(+delta)을 통째로 홀더에게 옮기므로 총액은
 * 불변이고, 지불자들이 내는 액수도 그대로다 — 돈의 도착지만 바뀐다.
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindKey,
  kindOf,
  playerAtSeat,
  ROUND_SETTLED,
  SETTLE_STAGE,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import {
  flagOf,
  roundKey,
  roundViewKey,
  settleInterceptor,
  stringOf,
  viewKey,
} from "../util.js";

const ID = "spy";
const ACTION = "spy_mark";

/** 지정한 패 종류 (게임 내내 유지 — 새로 찍으면 덮어쓴다) */
const markKey = (h: PlayerId): string => `${ID}:mark:${h}`;
/** 이번 국에 이미 찍었는가 (국이 바뀌면 키가 달라져 다시 한 번 찍을 수 있다) */
const markedThisRoundKey = (state: GameState, h: PlayerId): string =>
  `${ID}:marked:${roundKey(state)}:${h}`;

const markAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no spy augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, markedThisRoundKey(state, req.player))) {
      return "already marked this round";
    }
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const key = kindKey(kindOf(state, req.payload.tileId));
    return [
      augmentDataSet(markKey(req.player), key),
      augmentDataSet(markedThisRoundKey(state, req.player), true),
      // 본인 전용 — 무엇을 찍었는지는 홀더만 안다
      augmentDataSet(viewKey(req.player, `${ID}:mark`), key),
    ];
  },
};

export const spy: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  name: "스파이",
  description:
    "(매 국 1회) 자기 순에 손패의 패 1종을 비밀리에 지정한다. 이후 상대가 그 종류를 오름패로 화료하면 그 화료의 점수가 전부 나에게 온다.",
  detail:
    "(매 국 1회) 자기 순에 손패의 패 1종을 비밀리에 지정한다. 이후 상대 누구든 그 종류를 오름패로 화료하면 화료 자체는 성립하되 그가 받을 점수가 전부 나에게 오고, 지불자들이 내는 액수는 그대로다 — 돈의 도착지만 바뀐다. 지정은 국이 바뀔 때마다 다시 한 번 찍어 갱신할 수 있고, 새로 찍기 전까지는 계속 유효하다. 무엇을 찍었는지는 나만 알고 상대에게는 지정 사실만 공개된다. 내 화료에는 발동하지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(markAction);
    }

    // 이번 국에 아직 안 찍었으면 손패 아무 패나 후보 (합법성 최종 판정은 validate)
    ctx.holderTurnOptions((state) => {
      if (flagOf(state, markedThisRoundKey(state, holder))) return [];
      if (state.round.phase !== "turn.act") return [];
      if (playerAtSeat(state, state.round.turnSeat).id !== holder) return [];
      // 같은 종류를 여러 번 제시하지 않는다
      const seen = new Set<string>();
      const out: { type: string; payload: { tileId: TileId } }[] = [];
      for (const tileId of handIdsOf(state, holder)) {
        const key = kindKey(kindOf(state, tileId));
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type: ACTION, payload: { tileId } });
      }
      return out;
    });

    // 정산 재배선 — 찍힌 패로 상대가 화료하면 그 이득이 통째로 홀더에게 온다
    // 정산 단계: Transfer — 남의 획득을 통째로 가로챈다 — 배수·가산이 끝난 최종 획득을 가져간다.
    settleInterceptor(ctx, SETTLE_STAGE.Transfer, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      const marked = stringOf(ic.state, markKey(holder));
      if (marked === null) return event;

      const hit = (p.winInfos ?? []).find(
        (w) =>
          w.winner !== holder &&
          kindKey(kindOf(ic.state as GameState, w.winningTileId)) === marked,
      );
      if (hit === undefined) return event;

      const gain = p.deltas[hit.winner] ?? 0;
      if (gain <= 0) return event; // 받을 것이 없으면 훔칠 것도 없다

      const deltas = { ...p.deltas };
      deltas[hit.winner] = 0;
      deltas[holder] = (deltas[holder] ?? 0) + gain;
      return { type: event.type, payload: { ...p, deltas } };
    });

    // 적발 순간은 전원 공개 — 정산 화면에서 점수가 엉뚱한 곳으로 흘러가는 장면이 본체다
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return;
      const marked = stringOf(rc.state, markKey(holder));
      if (marked === null) return;
      const hit = (p.winInfos ?? []).find((w) => w.winner !== holder);
      if (hit === undefined) return;
      if (kindKey(kindOf(rc.state, hit.winningTileId)) !== marked) return;
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:caught:${holder}`), marked));
    });
  },
  // 봇: 텐파이 여부와 무관하게, 지정 기회가 열려 있으면 첫 후보로 찍어 둔다
  //     (빗나가도 잃는 것이 없으므로 쓰지 않는 것이 언제나 손해)
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
});
