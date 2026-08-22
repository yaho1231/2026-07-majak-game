import sys, io
BASE = "packages/content/src/augments/"
def ed(f, pairs, base=BASE):
    p = base + f
    s = open(p, encoding="utf8").read()
    for old, new, n in pairs:
        c = s.count(old)
        if c != n:
            print(f"!! {f}: expected {n} got {c} for {old[:50]!r}"); sys.exit(1)
        s = s.replace(old, new)
    open(p, "w", encoding="utf8").write(s)
    print("ok", f)
