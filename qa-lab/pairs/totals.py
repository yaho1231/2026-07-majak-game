import re, glob, os
tot_g = tot_r = tot_h = 0
rows = []
for f in sorted(glob.glob('qa-lab/pairs/shard*.log') + glob.glob('qa-lab/pairs/out/*.log')):
    txt = open(f).read()
    done = re.findall(r'DONE games=(\d+) rounds=(\d+) hits=(\d+)', txt)
    if done:
        g, r, h = map(int, done[-1])
    else:
        m = re.findall(r'(\d+)/\d+ rounds=(\d+) hits=(\d+)', txt)
        if not m: continue
        g, r, h = map(int, m[-1])
    rows.append((os.path.basename(f), g, r, h, 'DONE' if done else 'partial'))
    tot_g += g; tot_r += r; tot_h += h
for x in rows: print(f'{x[0]:<34} games={x[1]:<4} rounds={x[2]:<5} hits={x[3]:<3} {x[4]}')
print(f'\n합계: 게임 {tot_g}판, 국 {tot_r}국, 이상신호 {tot_h}건')
