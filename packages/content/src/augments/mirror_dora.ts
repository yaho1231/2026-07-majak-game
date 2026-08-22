/**
 * 거울의 도라 (mirror_dora, prism) — "표시패를 거꾸로도 읽는다".
 *
 * (상시) 도라 표시패의 **앞 패**도 나에게만 도라가 된다. 표시패가 5통이면 표준 도라
 * 6통에 더해 **4통**도 내 도라다. 순환은 표준 도라의 정확한 역방향이다 —
 * 1→9, 동→북, 백→중. 깡도라 표시패에도, 뒷도라 표시패에도 똑같이 적용된다
 * (뒷도라 쪽은 평소처럼 뒷도라를 세는 손, 즉 리치한 손에만 얹힌다).
 *
 * 도라 판 폭이 통째로 두 배가 되므로, 표시패 한 장이 뒤집힐 때마다 나만 두 종류를
 * 본다 — 전원 공개라 상대는 내 도라가 무엇인지 알고 흘리지 않을 수 있다(Rule #4).
 *
 * 구현: 코어 규칙 `scoring.extraDoraKinds`·`scoring.extraUraDoraKinds`에 보유자 전용
 * Modifier를 건다. 정상 도라 계산 경로(`buildWinContext` → `countDora`)를 그대로 타므로
 * **화료패·후로·손패가 전부 포함**되고, 표시패가 겹쳐 도라가 중첩되는 것도 그대로다.
 * (`score.extraHan`으로 흉내 내면 손패 Zone에 없는 론 화료패 한 장이 조용히 샌다.)
 */

import {
  augmentDataSet,
  defineAugment,
  frontDoraKindFor,
  kindKey,
  kindOf,
  uraIndicatorIds,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  ProposedEvent,
  TileKind,
} from "@majak/core";
import { roundViewKey } from "../util.js";

const ID = "mirror_dora";

/** 전원 공개 채널 — 값 = 내 앞도라 종류(kindKey) 목록 */
const publicKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);

/**
 * 좌석 전용 채널 — 도라 표시패가 **가려진** 국에서만 쓴다(아래 announce 주석).
 * 채널 이름의 뒷부분은 공개 채널과 같아서 클라이언트는 구분 없이 읽는다.
 */
const seatKey = (viewer: PlayerId, h: PlayerId): string =>
  roundViewKey(viewer, `${ID}:${h}`);

/** 표도라·깡도라 표시패의 앞 패 종류 */
function frontKinds(state: GameState): TileKind[] {
  return state.round.doraIndicators.map((t) => frontDoraKindFor(kindOf(state, t)));
}

/**
 * **뒷도라** 표시패의 앞 패 종류.
 *
 * 예전에는 뒷도라 쪽에도 `frontKinds`(표도라 표시패)를 그대로 넣었다. 그래서
 * 표시패가 4통이면 표도라로 3통이 붙고, 뒷도라에도 **같은 3통**이 또 붙어
 * 한 장을 두 번 셌다 — 정작 진짜 뒷도라 표시패의 앞 패는 영영 안 붙었다.
 * 설명("뒷도라 표시패에도 똑같이 적용된다")이 약속한 것과 다른 동작이었다
 * (2026-08-08 QA 2-9).
 */
function uraFrontKinds(state: GameState): TileKind[] {
  return uraIndicatorIds(state).map((t) => frontDoraKindFor(kindOf(state, t)));
}

export const mirrorDora: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 2,
  name: "거울",
  description:
    "(상시) 도라 표시패의 앞 패도 나에게만 도라가 된다 — 표시패가 5통이면 6통과 함께 4통도 내 도라다. 깡도라·뒷도라 표시패에도 똑같이 적용된다.",
  detail:
    "(상시) 앞은 표준 도라의 역방향으로, 1의 앞은 9, 동의 앞은 북, 백의 앞은 중이다.\n\n뒷도라 표시패에도 적용되어 뒷도라를 세는 손에만 얹힌다. 다른 사람에게는 적용되지 않고, 무엇이 도라가 됐는지는 전원에게 공개된다.",
  install(ctx) {
    const { holder } = ctx;

    const addKinds = (rule: string, pick: (s: GameState) => TileKind[]): void => {
      ctx.engine.rules.addModifier<readonly TileKind[]>(rule, {
        source: ctx.instanceId,
        layer: ctx.layer,
        apply: (cur, rctx) => {
          if (rctx.playerId !== holder) return cur;
          const state = rctx.state as GameState | undefined;
          if (state === undefined) return cur;
          return [...cur, ...pick(state)];
        },
      });
    };
    // 표도라·깡도라는 표시패의 앞 패, 뒷도라는 **뒷도라 표시패**의 앞 패.
    // 둘은 서로 다른 왕패이므로 각자 읽어야 한다 — 예전에는 양쪽 모두 표도라
    // 표시패를 봐서 같은 패를 두 번 셌다.
    addKinds("scoring.extraDoraKinds", frontKinds);
    addKinds("scoring.extraUraDoraKinds", uraFrontKinds);

    /*
     * 표시패가 **바뀔 때마다** 내 앞도라가 무엇인지 전원에게 알린다.
     * 안 보이면 상대가 대응할 수 없고(Rule #4), 나도 무엇이 내 도라인지 못 센다.
     *
     * ⚠ 예전에는 `ROUND_STARTED`·`DORA_FLIPPED` 두 이벤트에만 걸려 있었다. 표시패
     * **자리를 갈아 끼우는** 증강(왕패의 주인 dead_wall_master의 표시패 ↔ 손패 교환)은
     * 그 둘을 하나도 내지 않아, 채널이 배패 때 값 그대로 굳은 채 **낡은 앞도라를 계속
     * 광고**했다 — 점수는 새 표시패로 정확히 계산되므로 화면만 거짓이 됐다
     * (qa-lab score-b 확정 4). 특정 이벤트를 열거하는 방식은 새 증강이 생길 때마다
     * 같은 구멍이 다시 열리므로, 매 이벤트마다 다시 계산하고 **값이 달라졌을 때만**
     * 발행한다(값이 같으면 아무것도 안 내므로 반응 연쇄는 한 겹에서 멈춘다).
     */
    /** 이 뷰어에게 도라 표시패가 가려져 있는가 (가려진 도라 dora_conceal) */
    const indicatorsHiddenFor = (state: GameState, viewer: PlayerId): boolean =>
      ctx.engine.rules.has("visibility.doraIndicators.hidden") &&
      ctx.engine.rules.resolve<boolean>("visibility.doraIndicators.hidden", {
        playerId: viewer,
        state,
      }) === true;

    /** 값이 이미 같으면 아무것도 내지 않는다(반응 연쇄를 한 겹에서 멈추기 위해) */
    const put = (
      rc: { state: GameState; emit: (e: ProposedEvent) => void },
      key: string,
      kinds: readonly string[] | undefined,
    ): void => {
      const cur = rc.state.augmentData[key];
      if (kinds === undefined) {
        if (cur === undefined) return;
        rc.emit(augmentDataSet(key, undefined));
        return;
      }
      if (
        Array.isArray(cur) &&
        cur.length === kinds.length &&
        (cur as string[]).every((k, i) => k === kinds[i])
      ) {
        return;
      }
      rc.emit(augmentDataSet(key, [...kinds]));
    };

    /*
     * ⚠ 앞도라는 표시패의 **정확한 역함수**다 — `표시패 = 앞도라 + 1`, `도라 = 앞도라 + 2`.
     * 그래서 전원 공개 채널에 앞도라 종류를 실으면, 그것은 곧 **표시패를 공개하는 것**이다.
     * 같은 테이블에 `dora_conceal`(가려진 도라)이 있으면 거울 하나가 그 카드의 유일한
     * 능력을 산수로 되돌려 놓았다 — 은닉자도 거울 보유자도 아닌 **제3자까지** 도라를
     * 알게 됐다(2026-08-23, QA synergy3 kandora 확정 1).
     *
     * 그래서 표시패가 가려진 국에서는 공개 채널을 쓰지 않고, **표시패를 실제로 볼 수 있는
     * 좌석**(+ 보유자 본인)에게만 좌석 전용 채널로 보낸다. 그들은 표시패에서 앞도라를
     * 어차피 스스로 계산할 수 있으니 새로 새는 정보가 없고, 보유자 본인은
     * `dora_conceal`의 면책 문구("다른 증강으로 도라를 들여다보는 것까지 막지는 못한다")
     * 그대로 자기 도라를 안다.
     */
    const announce = (rc: { state: GameState; emit: (e: ProposedEvent) => void }): void => {
      const kinds = frontKinds(rc.state).map(kindKey);
      if (kinds.length === 0) return;
      const seats = rc.state.players.map((p) => p.id);
      const concealed = seats.some((id) => id !== holder && indicatorsHiddenFor(rc.state, id));
      if (!concealed) {
        // 평시 — 전원 공개(관전자 포함). 좌석 채널은 남아 있으면 지운다.
        put(rc, publicKey(holder), kinds);
        for (const id of seats) put(rc, seatKey(id, holder), undefined);
        return;
      }
      put(rc, publicKey(holder), undefined);
      for (const id of seats) {
        const visible = id === holder || !indicatorsHiddenFor(rc.state, id);
        put(rc, seatKey(id, holder), visible ? kinds : undefined);
      }
    };
    ctx.reaction("*", (_event, rc) => announce(rc));
  },
});
