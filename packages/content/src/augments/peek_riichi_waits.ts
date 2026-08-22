/**
 * 선언 간파 (peek_riichi_waits) — 리치 중인 상대의 오름패(대기)를 비용 없이
 * 확인하고, 간파한 그 국에 한해 그 오름패를 내 손에서 만들어낸다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b C (52차 버프)
 *
 * 구현 지점:
 * - 커스텀 액션 "peek_waits" {target}: 자기 턴에 리치 중인 상대를 지정.
 * - 커스텀 이벤트 PeekWaitsPerformed {holder, target, waits}: Reducer가
 *   보유자 전용 뷰 데이터와 사용 플래그를 기록한다 (점수 이동 없음).
 *   waits는 표시용 kindKey 문자열 배열 (클라이언트가 바로 그린다).
 * - 커스텀 액션 "peek_forge" {tileId, kind}: **국당 1회**, 간파해 둔 대기패 중
 *   하나를 골라 내 손패 1장을 그 패로 바꿔 만든다(tileKindChanged, conjured).
 *   상대의 오름패를 내가 쥐어 안전패로 삼거나, 역으로 그 패로 화료를 노린다.
 *   kind는 kindKey 문자열("man5")로 주고받는다 — FlowController.submit이
 *   payload JSON 완전일치를 요구하므로 구조체보다 문자열이 안전하다.
 * - holderTurnOptions: (아직 간파를 안 썼다면) 리치 중인 상대마다 간파 후보 +
 *   (손패 × 간파한 대기) 조합의 위조 후보를 노출한다 (validate가 최종으로 거른다).
 * - 간파는 **국당 1회**(2026-07-26 밸런스, 예전엔 상대별 1회).
 */

import {
  defineAugment,
  handIdsOf,
  winHandIdsOf,
  kindKey,
  kindOf,
  meldCountOf,
  playerAtSeat,
  tileKindChanged,
  winningKinds,
  scoringOptionsOf,
  augmentDataSet,
  ROUND_STARTED,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";
import { copiesLeftUndrawn, flagOf, publishUsesLeft, riichiHidden, viewKey } from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const AUGMENT_ID = "peek_riichi_waits";
/** 증강 id에서 파생한 이벤트 타입 (다른 증강과 충돌 방지) */
const PEEK_WAITS_PERFORMED = "PeekWaitsPerformed";
/** 지난 국에서 간파한 오름패 뷰를 새 국 시작 시 지우는 이벤트 */
const PEEK_WAITS_CLEARED = "PeekWaitsCleared";
/** 간파한 대기패를 손패에 만들어내는 액션 */
const ACTION_FORGE = "peek_forge";
/** viewKey(holder, "waits:{target}")의 공통 접두 — 이 접두의 뷰 키를 국마다 정리 */
const waitsViewPrefix = (holder: PlayerId): string => viewKey(holder, "waits:");

interface PeekWaitsPerformedPayload {
  holder: PlayerId;
  target: PlayerId;
  /** 대상의 오름패 kindKey 목록 (표시용) */
  waits: string[];
}

interface PeekWaitsClearedPayload {
  holder: PlayerId;
}

/**
 * 국 단위 사용 플래그 키 (roundKey를 섞어 국마다 자동 만료).
 * ⚠ 밸런스(2026-07-26): 예전엔 `:{target}`까지 붙은 **상대별 1회**라 리치가 셋이면
 * 한 국에 세 번 볼 수 있었다. 이제 **국당 1회** — 누구를 볼지가 선택이 된다.
 */
const usedKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(AUGMENT_ID, "used", state, holder);

/** 국 단위 위조 사용 플래그 키 (roundKey를 섞어 국마다 자동 만료) */
const forgedKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(AUGMENT_ID, "forged", state, holder);

/**
 * 이번 국에 이 보유자가 간파해 둔 대기패 전부 (kindKey 문자열, 중복 제거·정렬).
 * 간파 결과는 view:{holder}:waits:{target} 채널에 쌓이고 새 국에 지워지므로,
 * 이 목록이 비어 있으면 "이번 국에 간파한 적이 없다"는 뜻이다.
 */
function peekedWaits(state: GameState, holder: PlayerId): string[] {
  const prefix = waitsViewPrefix(holder);
  const out = new Set<string>();
  for (const [k, v] of Object.entries(state.augmentData)) {
    if (!k.startsWith(prefix) || !Array.isArray(v)) continue;
    for (const kind of v) if (typeof kind === "string") out.add(kind);
  }
  return [...out].sort();
}

/** kindKey("man5") → TileKind. 형식이 어긋나면 null */
function parseKindKey(key: string): TileKind | null {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return null;
  const suit = m[1] as string;
  const rank = Number(m[2]);
  if (!Number.isInteger(rank) || rank <= 0) return null;
  return { suit, rank };
}

const peekWaitsAction: ActionDef<{ target: PlayerId }> = {
  type: "peek_waits",
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(AUGMENT_ID)) {
      return "no peek_riichi_waits augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (req.payload.target === req.player) return "cannot peek yourself";
    if (state.round.byPlayer[req.payload.target]?.riichi == null) {
      return "target is not in riichi";
    }
    // 스텔스 리치는 **아무에게도 보이지 않는다** — 간파 대상으로도 잡히지 않는다.
    // 여기를 열어 두면 후보 목록만으로 "저 사람이 리치다"가 새어 나간다.
    if (riichiHidden(rules, state, req.payload.target)) {
      return "target is not in riichi";
    }
    if (flagOf(state, usedKey(state, req.player))) {
      return "already peeked this round";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const target = req.payload.target;
    /*
     * 대상의 대기 계산 — 채점 변형(scoring.*)과 **화료 판정용 손패**를 함께 반영한다.
     *
     * ⚠ `handIdsOf`(물리 손패)로 세면 안 된다. 자유 선언(free_riichi_discard)처럼
     * `hand.winTileIds`로 화료 손패를 스냅샷으로 고정하는 증강이 있으면, 그 사람이
     * **실제로 화료하는 패**와 여기 보여 주는 대기가 갈린다(docs/25 리치 #7).
     * 정확한 정보가 존재 이유인 증강이 틀린 정보를 확신 있게 주게 된다.
     */
    const waits = winningKinds(
      winHandIdsOf(state, rules, target).map((id) => kindOf(state, id)),
      meldCountOf(state, target),
      undefined,
      scoringOptionsOf(state, rules, target),
    ).map(kindKey);
    const payload: PeekWaitsPerformedPayload = {
      holder: req.player,
      target,
      waits,
    };
    return [{ type: PEEK_WAITS_PERFORMED, payload }];
  },
};

const peekForgeAction: ActionDef<{ tileId: TileId; kind: string }> = {
  type: ACTION_FORGE,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(AUGMENT_ID)) {
      return "no peek_riichi_waits augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, forgedKey(state, req.player))) {
      return "already forged this round";
    }
    // 리치 중에는 손패가 동결된다 — 위조는 손패 한 장의 종류를 바꿔 대기를 갈아엎으므로
    // 리치 후에 허용하면 "리치하면 손이 고정된다"는 규칙이 깨진다(2026-07-29 감사).
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    if (!peekedWaits(state, req.player).includes(req.payload.kind)) {
      return "kind not among peeked waits";
    }
    const forged = parseKindKey(req.payload.kind);
    if (forged === null) return "bad kind";
    /*
     * **세상에 없는 5번째 장은 만들지 않는다** (QA 2차 aug-3 확정 1).
     *
     * 형제 증강 `off_by_one`이 같은 함정을 이미 막아 뒀는데(죽은 대기로는 밀지
     * 않는다) 이쪽 위조에는 그 검사가 없었다. 그래서 이미 4장이 다 나와 있는
     * 종류로도 위조가 됐고, 그 순간 테이블 위에 그 종류가 5장 섰다. 대기 잔량을
     * 세는 쪽(봇의 `waitTilesLeft`, 클라이언트의 남은 장수 표시)은 0이라고
     * 말하는데 그 패로 화료가 난다 — 장수를 세고 던진 안전패에 맞는 것이라
     * 대응 자체가 불가능하다.
     *
     * 카드 문구도 "간파한 오름패 중 하나로 바꿔 만들 수 있다"까지이지 물리
     * 법칙(한 종류 4장)을 깨겠다고는 하지 않는다.
     */
    if (copiesLeftUndrawn(state, forged) <= 0) return "no copies left";
    return null;
  },
  toEvents: (req, { state }) => [
    tileKindChanged([
      {
        tileId: req.payload.tileId,
        kind: parseKindKey(req.payload.kind) as TileKind,
        attrs: { conjured: true },
      },
    ]),
    augmentDataSet(forgedKey(state, req.player), true),
  ],
};

export const peekRiichiWaits: AugmentDef = defineAugment({
  id: AUGMENT_ID,
  tier: "gold",
  category: "info",
  complexity: 2,
  name: "선언 간파",
  description:
    "(매 국 1회 + 위조 1회) 자기 순에 리치 중인 상대 하나를 골라 그 오름패를 공짜로 확인한다. 간파한 국에 한해 1회, 내 손패 1장을 간파한 오름패로 바꿔 만들 수 있다.",
  detail:
    "(매 국 1회 + 위조 1회) 확인 결과는 나만 보며, 알아낸 대기는 그 국에만 유효하다. 위조는 간파한 국에만 되고 **내가 리치를 걸기 전에만** 된다 — 리치를 걸면 손이 잠긴다.",
  // 봇: 리치를 건 상대가 있으면(옵션은 그런 상대별로만 제시된다) 항상 간파한다.
  //     48차 무페널티로 비용이 사라져 점수 게이트를 뒀을 이유가 없다 — 공짜 정보는 늘 이득.
  //     텐파이 여부와 무관 — 방총을 피하려는 정보라 오히려 손이 덜 됐을 때 더 값지다.
  //     (위조 peek_forge는 어느 패를 버릴지 판단이 필요해 봇에게 맡기지 않는다.)
  bot: plan({
    intent: "defend",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === "peek_waits") ?? null,
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

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(PEEK_WAITS_PERFORMED)) {
      engine.reducers.register(PEEK_WAITS_PERFORMED, (state, event) => {
        const p = event.payload as PeekWaitsPerformedPayload;
        // 48차 무페널티: 간파는 공짜다 (예전엔 대상에게 1000점을 지불해 상대를 살찌웠다)
        return {
          ...state,
          augmentData: {
            ...state.augmentData,
            // 보유자 화면에만 대기 노출 + 국 단위 사용 플래그
            [viewKey(p.holder, `waits:${p.target}`)]: p.waits,
            [usedKey(state, p.holder)]: true,
          },
        };
      });
    }
    if (!engine.actions.has("peek_waits")) {
      engine.actions.register(peekWaitsAction);
    }
    if (!engine.actions.has(ACTION_FORGE)) {
      engine.actions.register(peekForgeAction);
    }

    // 간파한 오름패는 그 국의 리치에 한한 정보 — 새 국이 시작되면 지운다.
    // (예전엔 view:{holder}:waits:{target} 키가 계속 남아 국이 지나도 표시됐다.)
    if (!engine.reducers.has(PEEK_WAITS_CLEARED)) {
      engine.reducers.register(PEEK_WAITS_CLEARED, (state, event) => {
        const p = event.payload as PeekWaitsClearedPayload;
        const prefix = waitsViewPrefix(p.holder);
        const augmentData: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(state.augmentData)) {
          if (!k.startsWith(prefix)) augmentData[k] = v;
        }
        return { ...state, augmentData };
      });
    }

    // 새 국 시작 시(배패 완료) 지난 국의 간파 결과를 정리 — 남은 게 있을 때만 이벤트 발행
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const prefix = waitsViewPrefix(holder);
      const hasStale = Object.keys(rc.state.augmentData).some((k) =>
        k.startsWith(prefix),
      );
      if (!hasStale) return;
      rc.emit({
        type: PEEK_WAITS_CLEARED,
        payload: { holder } satisfies PeekWaitsClearedPayload,
      });
    });

    // 리치 중인 각 상대에 대해 간파 후보 + 간파해 둔 대기가 있으면 위조 후보를 노출
    // (사용 여부·합법성은 validate가 판정). 후보 수 = 손패(≤14) × 간파한 대기 종류.
    ctx.holderTurnOptions((state) => {
      const options: { type: string; payload: unknown }[] = flagOf(
        state,
        usedKey(state, holder),
      )
        ? [] // 이번 국엔 이미 간파했다 (국당 1회)
        : state.players
            .filter(
              (p) =>
                p.id !== holder &&
                state.round.byPlayer[p.id]?.riichi != null &&
                // 숨은 리치(스텔스)는 후보에 올리지 않는다 — 후보가 뜨는 것 자체가 누설
                !riichiHidden(engine.rules, state, p.id),
            )
            .map((p) => ({ type: "peek_waits", payload: { target: p.id } }));

      if (!flagOf(state, forgedKey(state, holder))) {
        // 이미 4장이 다 나온 종류는 후보에서도 뺀다 — validate가 어차피 반려하지만,
        // 누를 수 없는 단추를 보여 주면 그 자체가 틀린 정보다.
        const kinds = peekedWaits(state, holder).filter((k) => {
          const kind = parseKindKey(k);
          return kind !== null && copiesLeftUndrawn(state, kind) > 0;
        });
        if (kinds.length > 0) {
          for (const tileId of handIdsOf(state, holder)) {
            for (const kind of kinds) {
              options.push({ type: ACTION_FORGE, payload: { tileId, kind } });
            }
          }
        }
      }
      return options;
    });
  },
});
