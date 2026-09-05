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
  roundViewKey,
  settleInterceptor,
  stringOf,
  viewKey,
  withAugNoteFor,
} from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "spy";
const ACTION = "spy_mark";

/** 지정한 패 종류 (게임 내내 유지 — 새로 찍으면 덮어쓴다) */
const markKey = (h: PlayerId): string => `${ID}:mark:${h}`;
/** 이번 국에 이미 찍었는가 (국이 바뀌면 키가 달라져 다시 한 번 찍을 수 있다) */
const markedThisRoundKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "marked", state, h);

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
  complexity: 2,
  name: "스파이",
  description:
    "(매 국 1회) 자기 순에 손패의 패 1종을 비밀리에 지정한다. 이후 상대가 그 종류를 오름패로 화료하면 그 점수가 전부 나에게 온다.",
  detail:
    "손패의 패 1종을 비밀리에 찍어 두면, 상대가 그 종류로 화료했을 때 그 점수가 전부 나에게 온다.\n\n지불자가 내는 액수는 그대로고 도착지만 바뀐다. 무엇을 찍었는지는 나만 안다. 국이 바뀌어도 새로 찍기 전까지 유효하다.",
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

      // 더블 론 등으로 지정 패 일치 화료자가 둘 이상일 수 있다 — 전원의 몫을 훔친다
      // (.find로 첫 명만 훔치면 나머지 일치 승자의 몫이 그대로 남는 버그가 있었다).
      const hits = (p.winInfos ?? []).filter(
        (w) =>
          w.winner !== holder &&
          kindKey(kindOf(ic.state as GameState, w.winningTileId)) === marked,
      );
      if (hits.length === 0) return event;

      const deltas = { ...p.deltas };
      let notes = p.augPoints ?? [];
      let stolen = 0;
      for (const hit of hits) {
        /*
         * 훔치는 것은 **그 화료 자체의 값**까지다 — 카드가 그렇게 적혀 있다:
         * "지불자들이 내는 액수도 그대로다 — 돈의 **도착지**만 바뀐다".
         *
         * 예전에는 `deltas[winner]`를 통째로 가져갔는데, 거기에는 **뱅크가 화료자에게
         * 따로 발행한 몫**(큰손의 만관 하한 · 모 아니면 도의 판돈 …)까지 섞여 있다.
         * 그래서 3,900짜리 손 하나가 테이블에 20,100점을 찍어 내고(큰손이 하한을
         * 두 번 발행한다), 판돈 12,000이 통째로 스파이에게 갔다 — 스파이가 쏜
         * 사람이면 **방총자가 흑자**가 됐다(2026-08-23 QA synergy3 score 확정 2·5).
         * 화료의 값(손 점수 + 본장 + 회수한 공탁)으로 자르면 그 경로가 닫히고,
         * 그때 스파이가 얻는 것은 정확히 "지불자들이 낸 액수"가 된다.
         */
        const worth =
          hit.points + (hit.honbaBonus ?? 0) + (hit.riichiPotGain ?? 0);
        const gain = Math.min(deltas[hit.winner] ?? 0, Math.max(0, worth));
        if (gain <= 0) continue; // 받을 것이 없으면 훔칠 것도 없다
        deltas[hit.winner] = (deltas[hit.winner] ?? 0) - gain;
        stolen += gain;
        // 화료자의 큰 숫자는 그대로 굴러가는데 증감표에는 0이 뜬다 — 그 줄에 이유를 남긴다.
        notes = withAugNoteFor({ ...p, augPoints: notes }, ID, hit.winner, -gain);
      }
      if (stolen === 0) return event;
      deltas[holder] = (deltas[holder] ?? 0) + stolen;
      notes = withAugNoteFor({ ...p, augPoints: notes }, ID, holder, stolen);
      return { type: event.type, payload: { ...p, deltas, augPoints: notes } };
    });

    // 적발 순간은 전원 공개 — 정산 화면에서 점수가 엉뚱한 곳으로 흘러가는 장면이 본체다
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return;
      const marked = stringOf(rc.state, markKey(holder));
      if (marked === null) return;
      // 인터셉터는 지정 패와 일치하는 **모든** 화료자의 몫을 훔친다. 공개도 같은
      // 기준이어야 한다 — 예전에는 첫 비보유자 화료자 하나만 보고 kind가 다르면
      // 그냥 빠져나가, 더블론에서 두 번째 화료자를 훔쳤을 때 **점수만 옮겨가고
      // 적발 컷인이 안 떴다**(docs/25 정보 #9). "적발되는 순간이 이 증강의 전부"인데
      // 결과 화면에 이유 없는 점수 이동만 남았다.
      const hits = (p.winInfos ?? []).filter(
        (w) =>
          w.winner !== holder &&
          kindKey(kindOf(rc.state, w.winningTileId)) === marked,
      );
      if (hits.length === 0) return;
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:caught:${holder}`), marked));
    });
  },
  // 봇: 텐파이 여부와 무관하게, 지정 기회가 열려 있으면 첫 후보로 찍어 둔다
  //     (빗나가도 잃는 것이 없으므로 쓰지 않는 것이 언제나 손해)
  bot: plan({
    intent: "setup",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
