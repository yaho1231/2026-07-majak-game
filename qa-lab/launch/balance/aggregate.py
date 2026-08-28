#!/usr/bin/env python3
"""
qa-lab/launch/balance/aggregate.py

#414 이후 증강 밸런스 실측 집계 스크립트.
qa-lab/launch/balance/run_arena.ts (runArena() 직접 호출, --augments 상당) 가 뽑은
arena_*.json 원자료를 읽어 증강별 표를 만든다. 여러 파일을 넘기면 offered/picked/
games/placementSum/placements를 그대로 합산한다(동일 스키마이므로 단순 합이 맞다).

사용:
  python3 aggregate.py arena_600_42.json [arena_hanchan_A.json ...] > table.txt
  python3 aggregate.py --csv arena_600_42.json > table.csv

산출 필드:
  id, offered, picked, pickRate, games, avgPlacement, winRate(1위율),
  place1..place4(순위 분포), power(docs/20 파워 점수), sampleFlag
    - sampleFlag: OK(games>=60) / LOW(15<=games<60) / TOO_SMALL(games<15)
      문턱은 4인 게임에서 표준오차가 실용적으로 좁아지는 지점을 경험적으로 잡은 것 —
      games<15는 어떤 결론도 내지 않는다(브리핑 "판단 보류" 규칙).
"""
import json
import sys
import csv as csvmod

def load_and_merge(paths):
    agg = {}
    total_games = 0
    total_rounds = 0
    for p in paths:
        d = json.load(open(p))
        total_games += d["games"]
        total_rounds += d["rounds"]
        for seat in d["bySeat"]:
            for aid, a in seat["stats"].get("augments", {}).items():
                cur = agg.setdefault(aid, {"offered": 0, "picked": 0, "games": 0,
                                            "placementSum": 0, "placements": [0, 0, 0, 0]})
                cur["offered"] += a["offered"]
                cur["picked"] += a["picked"]
                cur["games"] += a["games"]
                cur["placementSum"] += a["placementSum"]
                for i, v in enumerate(a.get("placements", [0, 0, 0, 0])):
                    cur["placements"][i] += v
    return agg, total_games, total_rounds

def power_table():
    """docs/20 / packages/core/src/augment/powerTier.ts 스냅숏에서 옮긴 파워 점수.
    이 스크립트는 문서 대조용이라 코드 값을 직접 import하지 않는다(워크스페이스 링크
    없이도 독립 실행되게) — 값이 바뀌면 docs/20 §3 표와 함께 갱신할 것."""
    # 실행 중인 arena_*.json 자체에 "power" 필드가 실려 있으므로 (arena.ts가
    # AUGMENT_POWER_TIERS를 읽어 붙인다) 이 함수는 쓰지 않는다 — JSON을 그대로 쓴다.
    return {}

def power_from_json(paths):
    """arena.ts가 이미 augmentStats에 붙여 준 power 필드를 첫 파일에서 그대로 가져온다."""
    d = json.load(open(paths[0]))
    return {r["id"]: r.get("power") for r in d.get("augmentStats", [])}

def main():
    argv = sys.argv[1:]
    as_csv = False
    if argv and argv[0] == "--csv":
        as_csv = True
        argv = argv[1:]
    if not argv:
        print("usage: aggregate.py [--csv] arena1.json [arena2.json ...]", file=sys.stderr)
        sys.exit(1)

    agg, total_games, total_rounds = load_and_merge(argv)
    power = power_from_json(argv)

    rows = []
    for aid, a in agg.items():
        games = a["games"]
        pickRate = a["picked"] / a["offered"] if a["offered"] else 0.0
        avgPlacement = a["placementSum"] / games if games else 0.0
        winRate = a["placements"][0] / games if games else 0.0
        if games < 15:
            flag = "TOO_SMALL"
        elif games < 60:
            flag = "LOW"
        else:
            flag = "OK"
        rows.append({
            "id": aid,
            "offered": a["offered"],
            "picked": a["picked"],
            "pickRate": round(pickRate, 4),
            "games": games,
            "avgPlacement": round(avgPlacement, 3),
            "winRate": round(winRate, 4),
            "place1": a["placements"][0],
            "place2": a["placements"][1],
            "place3": a["placements"][2],
            "place4": a["placements"][3],
            "power": power.get(aid, ""),
            "sampleFlag": flag,
        })

    rows.sort(key=lambda r: -r["pickRate"])

    print(f"# total games={total_games} rounds={total_rounds} files={argv}", file=sys.stderr)

    if as_csv:
        w = csvmod.DictWriter(sys.stdout, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in rows:
            w.writerow(r)
    else:
        hdr = f"{'id':22} {'offered':>7} {'picked':>6} {'pickRate':>8} {'games':>6} {'avgPl':>6} {'winRate':>7} {'power':>5} {'flag':>9}"
        print(hdr)
        for r in rows:
            print(f"{r['id']:22} {r['offered']:>7} {r['picked']:>6} {r['pickRate']:>8} "
                  f"{r['games']:>6} {r['avgPlacement']:>6} {r['winRate']:>7} {str(r['power']):>5} {r['sampleFlag']:>9}")

if __name__ == "__main__":
    main()
