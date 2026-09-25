/**
 * 귀환 (honor_return, prism) — "그거 아까 버린 거잖아?!"
 *
 * 동풍전 1·반장전 2회, 자기 턴에 발동하면 **이번 국에 내가 버린 자패**(바람·삼원)를
 * 최대 4장까지 기억해 두었다가, **다음 국 배패에 그대로 되받는다**(보랏빛 conjured).
 * 다음 국이 시작되면 역패 커쯔가 반쯤 완성된 채로 출발한다.
 *
 * 구현: 순수 콘텐츠(코어 무변경) — 미련(`regret`)과 같은 크로스국 주입 패턴.
 * - 발동 시 홀더 바닥의 자패 kind를 최대 4개(가장 최근에 버린 것부터) 게임 단위 augmentData에
 *   기록하고 전원 공개한다.
 * - 다음 `ROUND_STARTED`(setupRound가 배패를 새로 돌린 뒤) 리액션이 갓 받은 배패의 앞 N장을
 *   기록된 kind로 `tileKindChanged`(conjured) 덮어쓰고 기록을 비운다.
 * - **손패 장수 불변식 준수**: 배패 13장 "안에서 교체"한다(장수를 늘리지 않는다).
 *   스펙의 "패산에서 빠진다"는 개념적 서술이며, 실제 구현은 배패 내 교체가 유일하게 안전한 길이다
 *   (docs/16 §2b 구현 노트와 일치).
 * - setupRound가 매 국 tiles를 원본 재생성하므로 능력을 안 쓴 국엔 변형이 새지 않는다.
 */

import {
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  handZone,
  kindKey,
  ownDiscardKindsOf,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";
import { counterOf, matchUses, publishUsesLeft, roundViewKey, viewKey } from "../util.js";
import { clearViewOnDisarm, isDisarmEcho } from "./disarmBanner.js";
import { handAlteredKey } from "./handAltered.js";
import { plan } from "./botPlan.js";

const ID = "honor_return";
const ACTION = "honor_recall";
/** 되받을 수 있는 최대 장수 */
const MAX_RETURN = 4;

/** 매치당 사용 횟수 (동풍1/반장2) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);
/** 다음 국 배패에 주입할 자패 kind (게임 단위 — 국을 넘어 유지) */
const keepKey = (h: PlayerId): string => `${ID}:keep:${h}`;
/** 전원 공개 채널 */
const noticeKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);
/**
 * 발동 전 미리보기 — **보유자 전용**, 지금 누르면 다음 국 배패로 돌아올 자패 kindKey 목록.
 *
 * 되받는 패는 버림 **이력**(`ownDiscards`)으로 정해진다. 남이 울어 간 자패도 들어가고
 * 누명으로 남의 바닥에 놓인 패는 내 이력으로 따지므로, 바닥만 보는 화면은 다시 셀 수 없다 —
 * 그래서 서버가 실어 준다(2026-09-25, docs/59 U42). 쓸 수 없는 때(횟수 소진·이미 발동해
 * 대기 중·리치 중)는 비운다. 상대에게는 가지 않는다 — 전원에게 보이면 «귀환을 쓸 것»이라는
 * 의도가 드러난다(발동하면 그때 `noticeKey`로 전원 공개된다). 이력이 국마다 새로 시작하므로
 * 국 스코프 키다. 채널 이름에 보유자를 붙여 관전 뷰(주인을 떼고 평평하게 담는다)에서
 * 두 보유자가 서로 덮어쓰지 않게 한다.
 */
const previewKey = (h: PlayerId): string => roundViewKey(h, `${ID}:preview:${h}`);

/** 자패(바람·삼원)인가 */
function isHonor(kind: TileKind): boolean {
  return kind.suit === "wind" || kind.suit === "dragon";
}

/**
 * 버림 이력의 kindKey("wind3"·"dragon1")를 TileKind로 되돌린다.
 * 이력은 문자열 스냅샷이라 tileId가 없다 — 되받는 것은 종류뿐이라 그것으로 충분하다.
 * (같은 일을 하는 `nagashi_yakuman.kindFromKey`와 같은 꼴.)
 */
function kindFromKey(key: string): TileKind | null {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return null;
  return { suit: m[1] as TileKind["suit"], rank: Number(m[2]) };
}

/**
 * 이번 국에 **내가 버린** 자패 kind — 가장 최근에 버린 것부터 최대 4개.
 * (늦게 버린 자패일수록 의도적으로 흘린 것이라 되받는 값이 크다. 결정적.)
 *
 * ⚠ 바닥 존(실물)이 아니라 **버림 이력**(`ownDiscards`)을 읽는다. 존은 남이 울어
 * 가면 그 패가 빠지므로, 東·南·白·白을 버렸는데 白 하나가 퐁당하면 세 장만 기억됐다
 * (2026-08-20 QA text 확정 17). description의 기준은 '내가 버렸는가'지
 * '아직 내 바닥에 남아 있는가'가 아니다 — 자패를 흘려 두는 것이 이 카드의 플레이인데
 * 그 자패를 상대가 울어 가면 손해가 두 번 났다. 같은 이유로 유국역만도 이력을 본다
 * (`nagashi_yakuman.nagashiValid`).
 */
function recallableHonors(state: GameState, holder: PlayerId): TileKind[] {
  /*
   * ⚠ 후리텐 이력이 아니라 **실제로 내가 버린 패**를 읽는다 — 누명(frame_up)은
   * `creditTo` 로 후리텐 이력만 남에게 돌리기 때문이다. 예전에는 누명으로 흘린 東을
   * 보유자가 기억하지 못하고, 대신 **피해자**가 버리지도 않은 東을 다음 국 배패로
   * 되받았다 (QA synergy3 handedit 확정 4, 2026-08-23).
   * description 의 기준은 '내가 버렸는가'다.
   */
  const history = ownDiscardKindsOf(state, holder);
  const out: TileKind[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < MAX_RETURN; i--) {
    const kind = kindFromKey(history[i] as string);
    if (kind !== null && isHonor(kind)) out.push(kind);
  }
  return out;
}

/** augmentData에 보존된 주입 대상 kind 목록 */
function keptKinds(state: GameState, holder: PlayerId): TileKind[] {
  const v = state.augmentData[keepKey(holder)];
  return Array.isArray(v) ? (v as TileKind[]) : [];
}

const recallAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no honor_return augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    // 같은 계열(giant_god·tile_split·genesis·even_world)과 같은 규약 — 리치 중에는
    // 손패를 건드리는 액티브를 막는다(docs/21 D-2). 이 증강은 다음 국 배패에만
    // 영향을 주지만, "리치 중엔 손 관련 액티브 정지"라는 일관된 규약을 지킨다.
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    if (keptKinds(state, req.player).length > 0) return "already recalled, pending next round";
    if (recallableHonors(state, req.player).length === 0) {
      return "no honor tiles in your discards";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const kinds = recallableHonors(state, req.player);
    return [
      augmentDataSet(keepKey(req.player), kinds),
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      // 전원 공개 — 다음 국에 무엇이 부활하는지 상대도 안다
      augmentDataSet(noticeKey(req.player), kinds),
    ];
  },
};

export const honorReturn: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 2,
  name: "귀환",
  description:
    "(동풍전 1회 · 반장전 2회) 발동 시점까지 이번 국에 내가 버린 자패 중 가장 최근 것부터 최대 4장을 다음 국 배패로 돌려받는다.",
  detail:
    "발동하면 이번 국에 내가 버린 자패 중 최근 것부터 최대 4장을 다음 국 배패로 돌려받는다.\n\n버튼을 누른 순간 확정되며, 그 뒤에 버린 자패는 포함되지 않는다. 어떤 패가 돌아오는지는 모두에게 공개된다. 자패를 버리지 않았거나 리치 중이면 사용할 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(recallAction);
    }

    // 다음 국 시작(딜 완료 후) → 기록된 자패를 배패 앞자리에 주입하고 기록을 비운다
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const kinds = keptKinds(rc.state, holder);
      if (kinds.length === 0) return;
      const hand: readonly TileId[] = rc.state.zones[handZone(holder)]?.tileIds ?? [];
      const n = Math.min(hand.length, kinds.length);
      const changes = [];
      for (let i = 0; i < n; i++) {
        changes.push({
          tileId: hand[i] as TileId,
          kind: kinds[i] as TileKind,
          // red를 반드시 끈다 — attrs는 병합이라, 덮어쓴 자리가 하필 적5(또는 붉은
          // 손길로 물든 패)였으면 그 표식이 자패에 그대로 따라붙었다. 화면에서는
          // 되받은 자패 한 장만 보랏빛(conjured)이 아니라 붉은빛(tile-red)으로 떠
          // "왜 얘만 이펙트가 다르냐"가 됐고(2026-08-02 사용자 보고), 채점에서도
          // 자패가 적도라 1판을 몰래 얹었다. 자패는 적도라가 될 수 없다.
          attrs: { conjured: true, red: false },
        });
      }
      // 배패 13장 안에서 교체 — 장수 불변, 결정적(prng 불필요)
      if (changes.length > 0) {
        rc.emit(tileKindChanged(changes));
        // 배패 자체를 다시 쓴 것이므로 천화·지화 게이트를 닫는다 — 이 주입은
        // `ROUND_STARTED`(=setupRound) **뒤**, 오야의 첫 쯔모보다 **앞**이라 천화 창
        // 한복판에서 일어난다. 되받는 자패는 역패 커쯔를 통째로 채워 주므로 순수
        // 배패보다 완성 확률이 오히려 높다(2026-08-22 QA aug-2 확정 5).
        rc.emit(augmentDataSet(handAlteredKey(rc.state, holder), true));
      }
      rc.emit(augmentDataSet(keepKey(holder), []));
      rc.emit(augmentDataSet(noticeKey(holder), []));
    });

    // 발동 전 미리보기(previewKey 주석). 도라의 잔상이 «되살릴 도라»를 미리 보여 주는 것과
    // 같은 목적이다. 버림·울기·누명·리치 어느 이벤트로든 값이 바뀔 수 있어 이벤트를 열거하지
    // 않고 `reaction("*")` + 값 비교로 따라간다(ura_peek·three_dragons_will과 같은 방식) —
    // 값이 같으면 아무것도 내지 않으므로 리플레이 이벤트가 늘지 않고 반응 연쇄는 한 겹에서 멈춘다.
    ctx.reaction("*", (event, rc) => {
      // 무장해제 연쇄 안에서 방금 비운 채널을 도로 채우지 않는다(isDisarmEcho 주석)
      if (isDisarmEcho(ctx, event, [previewKey(holder)])) return;
      const state = rc.state;
      const usable =
        hasUsesLeft(state, holder) &&
        keptKinds(state, holder).length === 0 &&
        state.round.byPlayer[holder]?.riichi == null;
      const next = usable ? recallableHonors(state, holder).map(kindKey) : [];
      const cur = state.augmentData[previewKey(holder)];
      const shown = Array.isArray(cur) ? (cur as unknown[]) : [];
      if (shown.length === next.length && next.every((k, i) => shown[i] === k)) return;
      rc.emit(augmentDataSet(previewKey(holder), next));
    });
    // 무장해제되면 위 반응이 멈춰 값이 얼어붙는다 — 쓸 수 없는 능력의 미리보기를 내린다.
    // 위 반응의 isDisarmEcho 가드가 있어야 실제로 내려간 채로 남는다.
    clearViewOnDisarm(ctx, () => [previewKey(holder)]);

    // 사용 횟수가 남았고 되받을 자패가 있으면 보유자 턴에 발동 후보를 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (keptKinds(state, holder).length > 0) return [];
      if (recallableHonors(state, holder).length === 0) return [];
      return [{ type: ACTION, payload: {} }];
    });
  },
  // 봇: 되받을 자패가 있으면 발동한다 — 자해 위험이 없는 순수 이득이다.
  bot: plan({
    intent: "setup",
    fleeting: true,
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
