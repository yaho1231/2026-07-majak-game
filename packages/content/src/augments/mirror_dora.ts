/**
 * 거울의 도라 (mirror_dora, prism) — "표시패를 거꾸로도 읽는다".
 *
 * (상시) 도라 표시패의 **앞 패**도 나에게만 도라가 된다. 표시패가 5통이면 표준 도라
 * 6통에 더해 **4통**도 내 도라다. 순환은 표준 도라의 정확한 역방향이다 —
 * 1→9, 동→북, 백→중. 깡도라 표시패에도 똑같이 적용된다.
 *
 * ⚠ 밸런스 2026-08-27: **뒷도라는 제외한다.** 예전에는 뒷도라 표시패의 앞 패까지
 * 개인 도라로 줘서, 리치를 건 손에서만 값이 한 겹 더 붙었다 — 리치+거울 조합이
 * 표도라·깡도라·뒷도라 세 갈래를 전부 두 배로 만들어 하네만/배만이 예사로 났다.
 * 이제 표도라·깡도라만 두 배가 된다. 리치를 걸지 않는 손에는 원래 뒷도라가
 * 없었으므로 **리치 손만** 값이 줄어든다.
 *
 * 구현: 코어 규칙 `scoring.extraDoraKinds`에 보유자 전용
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

export const mirrorDora: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 2,
  name: "거울",
  description:
    "(상시) 도라 표시패의 앞 패도 나에게만 도라가 된다 — 표시패가 5통이면 6통과 함께 4통도 내 도라다. 깡도라 표시패에도 똑같이 적용된다.",
  detail:
    "도라 표시패의 앞 패도 나에게만 도라다 — 표시패가 5통이면 6통과 4통 둘 다(1의 앞은 9, 동의 앞은 북, 백의 앞은 중).\n\n깡도라에도 적용되지만 뒷도라에는 적용되지 않는다.",
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
    /*
     * 표도라·깡도라의 앞 패만 준다. **뒷도라 쪽(`scoring.extraUraDoraKinds`)은
     * 일부러 걸지 않는다** — 2026-08-27 밸런스로 제외했다(파일 상단 참고).
     * 되살릴 일이 생기면 `uraIndicatorIds`를 읽어 같은 모양으로 한 줄 더 걸면 된다.
     */
    addKinds("scoring.extraDoraKinds", frontKinds);

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
     * 좌석에만** 좌석 전용 채널로 보낸다. 그들은 표시패에서 앞도라를 어차피 스스로
     * 계산할 수 있으니 새로 새는 정보가 없다.
     *
     * ⚠ **거울 보유자 본인도 예외가 아니다**(2026-08-31). 예전에는 `id === holder`로
     * 보유자를 면제했고, 그 근거로 `dora_conceal`의 «면책 문구»를 인용했다 —
     * **그런 문구는 실제 카드에 없다.** 가려진 도라의 텍스트는 "도라는 나만 알 수 있다"
     * 뿐이고, 앞도라는 표시패의 정확한 역함수라 이 채널 하나가 그 카드의 유일한 능력을
     * 산수로 되돌려 놓았다(QA synergy4 info 확정 3). 사용자 결정으로 **구현을 고쳤다** —
     * 은폐 중에는 거울 보유자도 앞도라 목록을 받지 못한다.
     *
     * 점수는 그대로다 — `scoring.extraDoraKinds`는 상태에서 계산하므로 앞도라는
     * 정확히 붙는다. 가려지는 것은 «무엇이 내 앞도라인지»라는 **정보**뿐이다.
     */
    const announce = (rc: { state: GameState; emit: (e: ProposedEvent) => void }): void => {
      const kinds = frontKinds(rc.state).map(kindKey);
      if (kinds.length === 0) return;
      const seats = rc.state.players.map((p) => p.id);
      // 한 좌석이라도 가려져 있으면 공개 채널을 끈다 — **보유자 자신이 그 한 좌석일
      // 때도** 마찬가지다(예전에는 `id !== holder`로 자기 자신을 세지 않아, 남들이 전부
      // 은폐를 들고 거울 보유자만 가려진 판에서 공개 채널이 그대로 켜졌다).
      const concealed = seats.some((id) => indicatorsHiddenFor(rc.state, id));
      if (!concealed) {
        // 평시 — 전원 공개(관전자 포함). 좌석 채널은 남아 있으면 지운다.
        put(rc, publicKey(holder), kinds);
        for (const id of seats) put(rc, seatKey(id, holder), undefined);
        return;
      }
      put(rc, publicKey(holder), undefined);
      for (const id of seats) {
        const visible = !indicatorsHiddenFor(rc.state, id);
        put(rc, seatKey(id, holder), visible ? kinds : undefined);
      }
    };
    ctx.reaction("*", (_event, rc) => announce(rc));
  },
});
