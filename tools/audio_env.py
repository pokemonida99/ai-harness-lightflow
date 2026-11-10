# 每格（30fps）的音量、低頻與節拍強度，給影片與網頁共用
import subprocess, numpy as np
SR, FPS = 22050, 30
x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', 'work/music_edit.wav', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout, np.float32)
X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
lo = np.fft.irfft(X * ((f > 30) & (f < 140)), len(x))
hop = SR // FPS; n = len(x) // hop
rms = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2)) for i in range(n)])
lor = np.array([np.sqrt(np.mean(lo[i * hop:(i + 1) * hop] ** 2)) for i in range(n)])
nz = lambda v: np.clip(v / np.percentile(v, 98), 0, 1)
r, l = nz(rms), nz(lor)
on = np.maximum(l - np.r_[l[:1], l[:-1]], 0); on = np.clip(on / np.percentile(on[on > 0], 95), 0, 1)
q = lambda v: ','.join(f'{a:.2f}'.rstrip('0').rstrip('.') for a in v)
open('audio_env.js', 'w').write(f'window.AUDIO_ENV={{fps:{FPS},rms:[{q(r)}],lo:[{q(l)}],on:[{q(on)}]}};\n')
print('frames', n)
