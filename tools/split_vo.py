# 把整段旁白依「最長的 N-1 段靜音」切成 N 句：python3 work/split_vo.py <音檔> <句數> <輸出 json>
import subprocess, numpy as np, json, sys
SR = 32000; n_lines = int(sys.argv[2])
x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', sys.argv[1], '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout, np.float32)
hop = 320; e = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
on = e > 10 ** (-45 / 20); first = int(np.argmax(on)); last = len(on) - int(np.argmax(on[::-1]))
gaps = []; i = first
while i < last:
    if not on[i]:
        j = i
        while j < last and not on[j]: j += 1
        gaps.append((j - i, i, j)); i = j
    else: i += 1
cuts = sorted(sorted(gaps, reverse=True)[:n_lines - 1], key=lambda g: g[1])
bounds = [first] + [c for g in cuts for c in (g[1], g[2])] + [last]
segs = [[bounds[k] * hop / SR, bounds[k + 1] * hop / SR] for k in range(0, len(bounds), 2)]
json.dump(segs, open(sys.argv[3], 'w')); print(len(segs), [round(b - a, 2) for a, b in segs])
