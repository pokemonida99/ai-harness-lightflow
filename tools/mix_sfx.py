# 配樂＋音效混成一條音軌：python3 work/mix_sfx.py（在專案根目錄執行）
# 音效來自 ElevenLabs；時間點寫故事時間 N，用 tA() 換成配樂實際時間，和 main.js / timing.js 一致。
import subprocess, numpy as np
SR = 44100; DUR = 95.98; N = int(SR * DUR)
NOM = [0, 12, 24, 36, 52, 64, 80, 90]; ACT = [0, 14.98, 29.95, 44.93, 59.91, 69.27, 84.25, 95.98]
def tA(n):
    for i in range(1, len(NOM)):
        if n <= NOM[i]: return ACT[i-1] + (ACT[i]-ACT[i-1]) * (n-NOM[i-1]) / (NOM[i]-NOM[i-1])
    return ACT[-1] + n - NOM[-1]
rng = np.random.default_rng(11)

def dec(p, extra=()):
    raw = subprocess.run(['ffmpeg', '-v', 'error', *extra, '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()

music = dec('work/music_edit.wav')[:N]
music = np.pad(music, ((0, N - len(music)), (0, 0)))
t = np.arange(N) / SR
fx = np.zeros((N, 2), np.float32)

cache = {}
def clip(name):
    if name not in cache:
        x = dec(f'sfx/{name}.mp3'); cache[name] = x / max(np.abs(x).max(), 1e-6)
    return cache[name]
def env(x, w): m = np.abs(x).max(1); k = max(1, int(w * SR)); return np.convolve(m, np.ones(k) / k, 'same')
def onset(x): e = env(x, .004); return int(np.argmax(e > .12 * e.max()))
def peak(x): return int(np.argmax(env(x, .05)))
def pitch(x, r):
    if abs(r - 1) < 1e-3: return x
    idx = np.arange(0, len(x) - 1, r); i = idx.astype(int); f = (idx - i)[:, None]
    return (x[i] * (1 - f) + x[i + 1] * f).astype(np.float32)
def put(x, at, g, pan=0., maxlen=None):
    if maxlen: x = x[:int(maxlen * SR)]
    x = x.copy(); fl = min(int(.03 * SR), len(x) // 2); x[-fl:] *= np.linspace(1, 0, fl)[:, None]
    i = int(round(at * SR))
    if i < 0: x = x[-i:]; i = 0
    n = min(len(x), N - i)
    if n <= 0: return
    fx[i:i + n, 0] += x[:n, 0] * g * (1 - max(pan, 0)); fx[i:i + n, 1] += x[:n, 1] * g * (1 + min(pan, 0))
def on(name, at, g, pan=0., r=1., maxlen=None):   # 起音對在 at
    x = pitch(clip(name), r); put(x[max(onset(x) - 60, 0):], at, g, pan, maxlen)
def pk(name, at, g, pan=0., r=1.):                # 峰值對在 at
    x = pitch(clip(name), r); put(x, at - peak(x) / SR, g, pan)
def end(name, at, g):                              # 結尾對在 at（上升音）
    x = clip(name); e = env(x, .02); last = len(e) - int(np.argmax(e[::-1] > .1 * e.max()))
    put(x[:last], at - last / SR, g)
J = lambda a: 1 + rng.uniform(-a, a)

# 以下時間都是故事時間 N
def On(name, n, g, pan=0., r=1., maxlen=None): on(name, tA(n), g, pan, r, maxlen)
def Pk(name, n, g, pan=0., r=1.): pk(name, tA(n), g, pan, r)
# INPUT：數據雨落下、漏斗成形、光河流入
Pk('whoosh', 1.2, .3, -.4, .55); On('energy_pulse', 4.4, .45, -.5, .8)
# 結界逐邊點亮
for i in range(4): On('chime', 7.1 + i * .75, .14, -.45 + i * .3, 1.5 + i * .12, 1.2)
On('lock_on', 10.2 - .64, .22)
# 假設核心組裝
Pk('glass_assemble', 13.2, .5); On('impact', 13.2, .3)
# 金絲雀（兩輪）
for l0, l1, okT, gg in ((15.6, 17.6, 19.8, 1.), (52.2, 53.3, 54.8, .8)):
    On('energy_pulse', l0, .45 * gg, -.3, 1.2); Pk('whoosh', l0 + .5, .2 * gg, -.2, 1.15)
    On('lock_on', l1 - .64, .3 * gg, .2); On('chime', okT, .32 * gg, .2, 1.26, 1.6)
# A/B 分流（兩輪）
for n0, gg in ((22, 1.), (55, .8)):
    On('energy_pulse', n0, .35 * gg, 0, 1.0)
    Pk('whoosh', n0 + 2.8, .26 * gg, -.5, .9); Pk('whoosh', n0 + 2.9, .26 * gg, .5, 1.05)
On('chime', 29.6, .16, 0, .84, 1.4)
# 預測目標達成？→ 否
Pk('whoosh', 36.4, .3, 0, .8)
On('impact', 37.0, .55); On('slam', 37.0, .4, 0, .8)
On('energy_pulse', 37.6, .35, .3, .75)
# Loop 迭代：脈衝越來越密
for i, n in enumerate((39.6, 40.9, 41.9, 42.7, 43.3, 43.8)): On('energy_pulse', n, .45 + i * .06, -.4 + i * .16, .9 + i * .08, 1.0)
Pk('whoosh', 44.4, .26, -.3, .9)
# 修正假設：拆解、重組
On('glass_shatter', 46.4, .3, 0, 1.15); Pk('glass_assemble', 50.2, .55); On('chime', 50.2, .3, 0, 1.12, 1.6)
# 是 → 離開結界
On('impact', 64.0, .55); On('chime', 64.0, .3, 0, 1.5, 1.6); Pk('whoosh', 65.0, .4, .2, 1.0)
On('notes_flutter', 66.2, .25, .3, 1.3)
# 實測回饋：沿大光弧回到 INPUT
On('energy_pulse', 72.6, .4, .5, .7); end('riser', tA(76.2), .25); On('chime', 76.2, .3, -.5, 1.0, 1.6)
On('lock_on', 78.0 - .64, .25)
# OUTPUT 點燃
On('resolve', 80.0, .75); On('impact', 80.0, .45)
# 片尾
On('chime', 84.8, .2, 0, .75)
# 字幕：每句一記輕打字聲
CAPN = [0.9, 6.4, 12.2, 15.7, 24.4, 29.4, 43.1, 48.5, 52.3, 57.8, 67.9, 71.9, 75.9]
for c in CAPN: On('typewriter_key', c + .02, .16 * J(.15), rng.uniform(-.2, .2), J(.05), .35)

# 音效整體推高；大音效出現時配樂自動閃避（sidechain ducking），最後交給 ffmpeg 限幅
fx *= 1.5
e = np.abs(fx).max(1); k = int(.03 * SR); e = np.convolve(e, np.ones(k) / k, 'same')
duck = np.zeros(N, np.float32); g = 0.; rel = np.exp(-1 / (.45 * SR))
tgt = np.clip((e - .15) / .6, 0, 1) * .5                    # 最多閃避約 −6 dB
for i in range(N):
    g = tgt[i] if tgt[i] > g else g * rel + tgt[i] * (1 - rel); duck[i] = g
mix = (music * 1.0 * (1 - duck)[:, None] + fx).astype(np.float32)
mix *= 1.05 / np.percentile(np.abs(mix), 99.95)            # 極少數瞬間峰值交給限幅器
for name, data in (('work/sfx_only.wav', fx), ('work/soundtrack.wav', mix)):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', name], input=data.astype(np.float32).tobytes(), check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'work/soundtrack.wav', '-af', 'alimiter=limit=0.84:attack=3:release=60:level=false', '-c:a', 'libmp3lame', '-b:a', '192k', 'music/soundtrack.mp3'], check=True)
print('peak', float(np.abs(mix).max()), 'sfx used', len(cache))
