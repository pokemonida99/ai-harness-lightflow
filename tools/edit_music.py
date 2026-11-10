# 把 SUNO 原曲剪成約 96 秒：每個剪接點都在段落起點，用 25ms 等功率交叉淡化
import subprocess, numpy as np, json
SR = 48000
x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', 'music/chase_quantized.m4a', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout, np.float32).reshape(-1, 2)
EDL = [(4.24, 34.19), (49.17, 79.13), (92.23, 116.57), (197.07, 208.8)]
xf = int(.025 * SR); out = None; marks = []
for a, b in EDL:
    seg = x[int(a * SR) - (xf if out is not None else 0): int(b * SR)].copy()
    if out is None:
        fi = int(.6 * SR); seg[:fi] *= np.linspace(0, 1, fi)[:, None] ** 2; out = seg
    else:
        t = np.linspace(0, np.pi / 2, xf)[:, None]
        mid = out[-xf:] * np.cos(t) + seg[:xf] * np.sin(t)
        out = np.concatenate([out[:-xf], mid, seg[xf:]])
    marks.append(round(len(out) / SR, 3))
fo = int(1.5 * SR); out[-fo:] *= np.linspace(1, 0, fo)[:, None]
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', 'work/music_edit.wav'], input=out.astype(np.float32).tobytes(), check=True)
print('length', len(out) / SR, 'cut ends', marks)
