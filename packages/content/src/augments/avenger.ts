/**
 * 복수자 (avenger, silver).
 * 직전에 자신을 론으로 잡았던 상대에게 론으로 되갚아 화료하면 +2판.
 */

import {
  ROUND_SETTLED,
  WIN_DECLARED,
  augmentDataSet,
  defineAugment,
} from "@majak/core";
import type {
  AugmentDef,
  PlayerId,
  RoundSettledPayload,
  WinDeclaredPayload,
} from "@majak/core";
import { addHanBonus, flagOf, stringOf } from "../util.js";

const nemKey = (h: PlayerId): string => `avenger:nemesis:${h}`;
const hitKey = (h: PlayerId): string => `avenger:hit:${h}`;

export const avenger: AugmentDef = defineAugment({
  id: "avenger",
  tier: "silver",
  name: "복수자",
  description:
    "직전에 자신을 론으로 잡았던 그 상대에게 론으로 되갚아 화료하면 +2판. 복수에 성공하면 원한이 풀리고, 다시 론당하면 원한 대상이 갱신된다.",
  install(ctx) {
    const { holder } = ctx;
    addHanBonus(ctx, (state) => (flagOf(state, hitKey(holder)) ? 2 : 0));

    // 원수에게 론으로 화료하는 순간 이번 화료 +2판 플래그
    ctx.reaction(WIN_DECLARED, (event, rc) => {
      const p = event.payload as WinDeclaredPayload;
      if (p.winner !== holder || p.winType !== "ron") return;
      const nemesis = stringOf(rc.state, nemKey(holder));
      if (nemesis !== null && p.from === nemesis) {
        rc.emit(augmentDataSet(hitKey(holder), true));
      }
    });

    // 국 정산: 원수 갱신(론당했으면) / 복수 성공 시 해제 + 플래그 리셋
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const ronnedBy = (p.winInfos ?? []).find(
        (w) => w.winType === "ron" && w.from === holder,
      )?.winner;
      const avenged = flagOf(rc.state, hitKey(holder));
      if (ronnedBy !== undefined) {
        rc.emit(augmentDataSet(nemKey(holder), ronnedBy));
      } else if (avenged) {
        rc.emit(augmentDataSet(nemKey(holder), ""));
      }
      if (avenged) rc.emit(augmentDataSet(hitKey(holder), false));
    });
  },
});
