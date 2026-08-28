#!/usr/bin/env python3
"""
qa-lab/launch/balance/analyze.py

2차 갱신용 분석 스크립트. aggregate.py가 만든 CSV 두 장(반장 병합·동풍)을 읽어:
  1. 표본 플래그 재계산(문턱 games>=60 OK / 15~59 LOW / <15 TOO_SMALL)
  2. 파워 티어(docs/20 컷) 대비 실측 avgPlacement 순위 이탈 목록
  3. 반장 vs 동풍 — 같은 증강의 avgPlacement 순위 차이(모드 의존 이상치)
  4. 지정한 관심 증강(1차 이상치)의 표본 확대 후 수치 재확인
을 stdout에 사람이 읽는 표로 찍는다. 파일을 새로 만들지 않는다(입력 CSV가 이미 원자료).
"""
import csv, sys

def tier_of(power, aid):
    if aid in ("genesis", "suit_unify"):
        return "SS+"
    if power in (None, ""):
        return "?"
    p = float(power)
    if p >= 38: return "S+"
    if p >= 34: return "S"
    if p >= 32: return "A"
    if p >= 29: return "B"
    if p >= 25: return "C"
    return "D"

def load(path):
    rows = list(csv.DictReader(open(path)))
    for r in rows:
        r["games"] = int(r["games"])
        r["offered"] = int(r["offered"])
        r["picked"] = int(r["picked"])
        r["avgPlacement"] = float(r["avgPlacement"])
        r["pickRate"] = float(r["pickRate"])
        r["winRate"] = float(r["winRate"])
        r["tier"] = tier_of(r["power"], r["id"])
    return {r["id"]: r for r in rows}

def flag(games):
    if games < 15: return "TOO_SMALL"
    if games < 60: return "LOW"
    return "OK"

def mismatch_report(rows, label, min_games=60):
    ok = [r for r in rows.values() if r["games"] >= min_games]
    ranked = sorted(ok, key=lambda r: r["avgPlacement"])
    n = len(ranked)
    rank_of = {r["id"]: i for i, r in enumerate(ranked)}
    print(f"\n=== {label}: 파워 티어 vs 실측 순위 이탈 (games>={min_games}, n={n}) ===")
    over, under = [], []
    for r in ranked:
        idx = rank_of[r["id"]]
        pct = idx / n
        if r["tier"] in ("SS+", "S+", "S") and pct > 0.55:
            over.append((r["id"], r["tier"], r["avgPlacement"], r["winRate"], r["games"], idx, n))
        if r["tier"] in ("D", "C") and pct < 0.20:
            under.append((r["id"], r["tier"], r["avgPlacement"], r["winRate"], r["games"], idx, n))
    print("-- 과대평가(파워 상위인데 실측 하위 45%) --")
    for x in sorted(over, key=lambda x: -x[2]):
        print(f"  {x[0]:20} tier={x[1]:3} avgPl={x[2]:.3f} winRate={x[3]:.3f} games={x[4]:4} rank={x[5]+1}/{x[6]}")
    print("-- 과소평가(파워 하위인데 실측 상위 20%) --")
    for x in sorted(under, key=lambda x: x[2]):
        print(f"  {x[0]:20} tier={x[1]:3} avgPl={x[2]:.3f} winRate={x[3]:.3f} games={x[4]:4} rank={x[5]+1}/{x[6]}")

def sample_flags(rows, label):
    from collections import Counter
    c = Counter(flag(r["games"]) for r in rows.values())
    print(f"\n=== {label}: 표본 플래그 분포 === {dict(c)}")
    too_small = [r["id"] for r in rows.values() if flag(r["games"]) == "TOO_SMALL"]
    print("  TOO_SMALL:", too_small)

def mode_divergence(hanchan, tonpuu, min_games=40):
    print(f"\n=== 반장(hanchan) vs 동풍(tonpuu) — 같은 증강의 순위차 (양쪽 games>={min_games}) ===")
    common = set(hanchan) & set(tonpuu)
    rows = []
    for aid in common:
        h, t = hanchan[aid], tonpuu[aid]
        if h["games"] < min_games or t["games"] < min_games:
            continue
        diff = h["avgPlacement"] - t["avgPlacement"]  # 양수 = 동풍에서 더 좋다(순위 낮다=좋음이므로 반장이 더 나쁘다는 뜻)
        rows.append((aid, h["avgPlacement"], t["avgPlacement"], diff, h["games"], t["games"], h["power"]))
    rows.sort(key=lambda r: r[3])
    print("-- 동풍에서 훨씬 좋다(반장에서 상대적으로 약하다), diff = 반장avgPl - 동풍avgPl, 음수=동풍이 더 나쁨 --")
    print("id                     hanchanAvgPl  tonpuuAvgPl   diff  hGames tGames power")
    for r in rows[:12]:
        print(f"{r[0]:22} {r[1]:>11.3f}  {r[2]:>10.3f}  {r[3]:>+5.3f}  {r[4]:>6} {r[5]:>6}  {r[6]}")
    print("-- 반장에서 훨씬 좋다(동풍에서 상대적으로 약하다) --")
    for r in rows[-12:][::-1]:
        print(f"{r[0]:22} {r[1]:>11.3f}  {r[2]:>10.3f}  {r[3]:>+5.3f}  {r[4]:>6} {r[5]:>6}  {r[6]}")

def watchlist(hanchan, tonpuu, ids):
    print("\n=== 1차 관심 증강 재확인 (반장 1500판 병합 vs 반장 600판 1차) ===")
    print(f"{'id':20} {'games':>6} {'avgPl':>7} {'winRate':>8}  {'tonpuu games':>13} {'tonpuu avgPl':>13}")
    for aid in ids:
        h = hanchan.get(aid)
        t = tonpuu.get(aid)
        hs = f"{h['games']:>6} {h['avgPlacement']:>7.3f} {h['winRate']:>8.3f}" if h else "  n/a"
        ts = f"{t['games']:>13} {t['avgPlacement']:>13.3f}" if t else "n/a"
        print(f"{aid:20} {hs}  {ts}")

if __name__ == "__main__":
    hanchan_path, tonpuu_path = sys.argv[1], sys.argv[2]
    hanchan = load(hanchan_path)
    tonpuu = load(tonpuu_path)
    sample_flags(hanchan, "반장 병합(1500판)")
    sample_flags(tonpuu, "동풍(1800판)")
    mismatch_report(hanchan, "반장 병합(1500판)")
    mismatch_report(tonpuu, "동풍(1800판)")
    mode_divergence(hanchan, tonpuu)
    watchlist(hanchan, tonpuu, [
        "silent_pact", "joker", "genesis", "parasite", "hand_swap3", "frame_up",
        "let_it_ride", "tile_split", "async_chiitoi", "broken_border", "mixed_triplet",
        "grave_rob", "mirror_dora", "bottom_deal", "silent_swap", "cornucopia",
    ])
