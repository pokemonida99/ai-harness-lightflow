// AI Harness 模擬測試架構：把流程圖改編成一座霓虹光流實驗場
// 畫面全部由故事時間 N 決定；N 由配樂實際時間 T 經 timing.js 換算，影片逐格錄製與網頁播放共用。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

// ===== 工具 =====
const REC = /[?&]rec=1/.test(location.search);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const sstep = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const eio = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eout = x => 1 - Math.pow(1 - clamp(x), 3);
const win = (t, a, b, f = .4) => clamp(Math.min((t - a) / f, (b - t) / f));
const lerp = (a, b, t) => a + (b - a) * t;
const decay = (t, t0, k) => t < t0 ? 0 : Math.exp(-(t - t0) * k);
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HDR = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

// 故事時間 ↔ 配樂時間
const TM = window.TIMING || { nom: [0, 90], act: [0, 90] };
const DUR = TM.act[TM.act.length - 1];
function mapT(t, from, to) {
  if (t <= from[0]) return to[0];
  for (let i = 1; i < from.length; i++) if (t <= from[i]) return to[i - 1] + (to[i] - to[i - 1]) * (t - from[i - 1]) / (from[i] - from[i - 1]);
  return to[to.length - 1] + (t - from[from.length - 1]);
}
const toN = t => mapT(t, TM.act, TM.nom), toT = n => mapT(n, TM.nom, TM.act);

// ===== 色彩 =====
const CY = 0x35e6ff, OR = 0xff8424, RED = 0xff2c46, GOLD = 0xffd49a, GREEN = 0x4dffb0, WHITE = 0xe8fbff;

// ===== 場景座標 =====
const P = {
  IN: V(-38, 0, 0), H: V(-13, 6, 0), MKT: V(-2, 11, -9.5), PROBE: V(-4.2, 10.4, -5.6),
  SPLIT: V(-7, .7, 0), GATE: V(15, 5, 0), LOOP: V(1, 11.4, -8), EXIT: V(20, 4, 0),
  LAND: V(29.5, .35, 0), CITY: V(36, 0, 0), OUT: V(60, 0, 0),
  MA: V(8.6, 0, -6), MB: V(8.6, 0, 6),
};
const CUBE = { x0: -20, x1: 20, y0: 0, y1: 15, z0: -12, z1: 12 };

// ===== 敘事資料（故事時間）=====
const STEPS = [[0, '真實數據'], [12, '假設 H(n)'], [15.5, '金絲雀測試'], [24, 'A/B 測試'], [36, 'Loop 迭代'], [64, '真實用戶閉環'], [80, '落地決策']];
const CAPS = [  // [起, 迄, 中文, 色, 英文旁白]
  [0.84, 3.25, '真實數據，進場。', '', "Real data enters. The mission begins."],
  [6.34, 10.08, '先模擬，再驗證。', '', "Inside the AI Harness sandbox. Simulate first. Then validate."],
  [12.14, 14.54, '建立假設 H(1)。', '', "Build the first hypothesis. H(1)."],
  [15.65, 18.58, '金絲雀，先探路。', '', "Canary test. AI probes the new version's potential."],
  [19.85, 22.89, '方向可行，進入測試。', 'green', "Direction looks viable. Advance to the A/B test."],
  [24.34, 26.98, '隨機分組，同時展示。', '', "Split users randomly. Show both versions at the same time."],
  [29.34, 33.27, '比較兩版成效。', '', "Control A. Variant B. Compare results. Which version performs better?"],
  [36.22, 37.88, '預測目標達成？', '', "Prediction target met?"],
  [38.83, 40.62, '否——進入迭代。', 'red', "No. Enter the loop."],
  [43.03, 46.26, '用模擬結果，修正假設。', '', "Use simulation results to refine the hypothesis."],
  [48.42, 51.01, 'H(2)，再跑一次。', '', "H(2). Run it again."],
  [52.21, 56.69, '再探路，再比較。', '', "Another canary test. Another A/B comparison."],
  [57.71, 61.01, '讓假設更接近真實。', '', "Bring the hypothesis closer to reality."],
  [64.22, 66.63, '是，預測達標。', 'gold', "Yes. Prediction target met."],
  [67.82, 71.1, '小規模上線驗證。', '', "Start small. Validate with real users."],
  [71.83, 74.57, '實測回饋，校正模擬。', '', "Real feedback calibrates the simulation."],
  [75.82, 78.43, '預測與實測，一致。', 'gold', "Predictions match real behavior."],
  [78.48, 83.45, '驗證通過，落地決策。', 'gold', "Validation complete. Launch fully. Scale. Lock strategy."],
  [83.48, 89.76, '真實數據，模擬 A/B，真實用戶，閉環驗證。', 'gold', "AI Harness. Real data. Simulated A/B. Real users. Closed loop."],
];
const CARDS = {
  in: { at: V(-38, 17.5, 0), c: '#e8fbff', t: 'INPUT 真實數據', b: '用戶行為・交易紀錄・市場資料<br>模擬從真實出發' },
  h: { at: V(-13, 10, 0), c: '#35e6ff', t: '假設 H(n)', b: '可被測試的暫時答案<br>每迭代一次，n + 1' },
  can: { at: V(-2, 15.2, -9.5), c: '#ffd49a', t: '03 金絲雀測試', b: 'AI 先行虛擬測試新版本／目標市場<br>評估方向是否可行' },
  ab: { at: V(2, 3.2, 0), c: '#35e6ff', t: '01 A/B 測試', b: '受眾隨機分成兩組以上<br>同一時間展示不同版本<br>用數據對照成效差異' },
  gate: { at: V(15, 10, 0), c: '#e8fbff', t: '預測目標達成？', b: '否 → 進入 Loop 迭代<br>是 → 離開模擬環境' },
  loop: { at: V(1, 16.6, -8), c: '#ff8424', t: '02 Loop 迭代', b: '運用模擬結果<br>推測更正確的假設<br>持續到預測目標達成' },
  city: { at: V(36, 6.5, 6), c: '#ffd49a', t: '真實用戶閉環測試', b: '小規模上線 → 收集實際回饋 → 校正模擬<br>驗證預測與真實行為是否一致' },
  out: { at: V(60, 17, 0), c: '#ffd49a', t: 'OUTPUT 落地決策', b: '正式上線・擴大投放・策略定版' },
};

// ===== 渲染器 =====
const stage = document.getElementById('stage');
let W = REC ? 1920 : innerWidth, H = REC ? 1080 : innerHeight;
let PR = REC ? 1 : Math.min(devicePixelRatio, 1.5);
const PR_MAX = PR;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: REC });
renderer.setPixelRatio(PR); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
stage.appendChild(renderer.domElement);
const labelR = new CSS2DRenderer(); labelR.setSize(W, H); labelR.domElement.className = 'labels'; stage.appendChild(labelR.domElement);

const scene = new THREE.Scene();
const BG = new THREE.Color('#010308');
scene.background = BG;
const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 900);

// 環境貼圖：黑底＋青、橘光條，讓黑鉻材質反射出霓虹
const pmrem = new THREE.PMREMGenerator(renderer);
{
  const es = new THREE.Scene(); es.background = new THREE.Color(0);
  const strip = (w, h, x, y, z, c, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: HDR(c, k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; strip(7, .25, Math.cos(a) * 10, 1 + (i % 3) * 2, Math.sin(a) * 10, i % 4 === 1 ? OR : CY, 5); }
  strip(40, .2, 0, -1.5, -12, CY, 6); strip(40, .2, 0, -1.5, 12, CY, 3); strip(14, 14, 0, 14, 0, 0x0a1828, 1);
  scene.environment = pmrem.fromScene(es, 0.02).texture;
}
scene.add(new THREE.AmbientLight(0x0b1830, .5));
const coreLight = new THREE.PointLight(CY, 0, 26, 1.6); coreLight.position.copy(P.H); scene.add(coreLight);
const gateLight = new THREE.PointLight(CY, 0, 24, 1.6); gateLight.position.copy(P.GATE); scene.add(gateLight);
const mouseLight = new THREE.PointLight(CY, 0, 16, 1.8); scene.add(mouseLight);

// ===== 後製：泛光＋橫向光芒＋色差＋顆粒＋暗角 =====
const rt = new THREE.WebGLRenderTarget(W * PR, H * PR, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(PR); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .55, .38, .9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const fin = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 1 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) }, uStreak: { value: 1 }, uZoom: { value: 0 }, uGlitch: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uCA,uFlash,uFade,uStreak,uZoom,uGlitch; uniform vec3 uFlashC; uniform vec2 uRes; varying vec2 vUv;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){ vec2 uv=vUv;
    float band=floor(uv.y*36.)+floor(uTime*24.); float gh=h(vec2(band,3.1)); uv.x+=(gh-.5)*.08*uGlitch*step(.62,gh);
    vec2 c=uv-.5; float r=length(c); vec2 off=c*uCA*r*.010+vec2(.012*uGlitch,0.);
    vec3 col=vec3(texture2D(tDiffuse,uv+off).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-off).b);
    if(uZoom>.002){ vec3 zb=vec3(0.); for(int i=1;i<=12;i++){ float k=float(i)/12.; zb+=texture2D(tDiffuse,.5+c*(1.-uZoom*k*.35)).rgb; } col=mix(col,zb/12.*1.15,clamp(uZoom*2.2,0.,.85)); }
    vec3 st=vec3(0.); float px=3./uRes.x;
    for(int i=-14;i<=14;i++){ float o=float(i)*px*uStreak; vec3 s=texture2D(tDiffuse,vUv+vec2(o*1.6,0.)).rgb; st+=max(s-vec3(.78),0.)*exp(-abs(float(i))*.16); }
    col+=st*vec3(.35,.75,1.)*.05;
    col*=mix(1.,smoothstep(1.05,.3,r),.8);
    col+=uFlash*uFlashC*(1.-r*.9);
    col+=(h(vUv*uRes+fract(uTime*7.31)*91.)-.5)*.035;
    col*=1.-uFade;
    gl_FragColor=vec4(col,1.);}`,
});
composer.addPass(fin);

// ===== GLSL 共用 =====
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*snoise(p);p*=2.03;a*=.5;}return s;}
`;
// 平方一律用 sq()：Metal 對 pow(負數, 2.) 會回傳 NaN，泛光會把它擴散成黑框
const SQ_DEF = '#define sq(x) ((x)*(x))\n';
THREE.Material.prototype.onBeforeCompile = function (sh) { sh.vertexShader = SQ_DEF + sh.vertexShader; sh.fragmentShader = SQ_DEF + sh.fragmentShader; };
const GRID = `float gridL(vec2 p,float s,float w){vec2 g=abs(fract(p/s-.5)-.5)*s;vec2 fw=max(fwidth(p)*w,vec2(1e-4));vec2 l=1.-smoothstep(vec2(0.),fw,g);return max(l.x,l.y);}`;
const U = { time: { value: 0 }, beat: { value: 0 }, lo: { value: 0 } };

// ===== 天空：地平線光、遠山稜線、低雲 =====
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: { uTime: U.time, uLo: U.lo },
  vertexShader: `varying vec3 vD; void main(){vD=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww;}`,
  fragmentShader: `uniform float uTime,uLo; varying vec3 vD; ${NOISE}
    void main(){ float el=vD.y; float az=atan(vD.z,vD.x);
      vec3 c=mix(vec3(.004,.012,.024),vec3(.0,.002,.006),smoothstep(0.,.45,el));
      c+=vec3(.02,.09,.14)*exp(-abs(el)*22.)*(1.+uLo*.25);
      float cl=fbm(vec3(cos(az)*2.2,el*9.,sin(az)*2.2+uTime*.006));
      c+=vec3(.015,.05,.08)*smoothstep(.0,.8,cl)*smoothstep(.32,.03,el)*smoothstep(-.01,.04,el);
      float ridge=.012+.035*(fbm(vec3(cos(az)*3.,sin(az)*3.,1.7))*.5+.5)+.02*pow(abs(sin(az*2.3+1.)),4.);
      if(el<ridge){ c=vec3(.002,.005,.01)+vec3(.0,.01,.02)*smoothstep(-.02,ridge,el); c+=vec3(.06,.3,.45)*exp(-(ridge-el)*600.)*.5; }
      gl_FragColor=vec4(c,1.);}`,
}));
sky.renderOrder = -10; scene.add(sky);

// ===== 地板：鏡面反射＋霓虹網格＋光池＋漣漪 =====
const POOLS = 8;
const floorU = { uTime: U.time, uBeat: U.beat, uRip: { value: new THREE.Vector4(0, 0, -99, 0) }, uBg: { value: BG }, uPool: { value: Array.from({ length: POOLS }, () => new THREE.Vector4(0, 0, 1, 0)) }, uPoolC: { value: Array.from({ length: POOLS }, () => new THREE.Color()) }, uGrid: { value: 0 }, uScan: { value: -99 } };
const floor = new Reflector(new THREE.PlaneGeometry(700, 700), {
  textureWidth: W * PR * .5, textureHeight: H * PR * .5, clipBias: 0.003,
  shader: {
    name: 'FloorShader',
    uniforms: Object.assign({ color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } }, floorU),
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
      void main(){vUv=textureMatrix*vec4(position,1.);vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uBeat,uGrid,uScan; uniform vec4 uRip; uniform vec3 uBg; uniform vec4 uPool[${POOLS}]; uniform vec3 uPoolC[${POOLS}]; varying vec4 vUv; varying vec3 vW; ${GRID}
      void main(){ vec4 uv=vUv; float b=.006*uv.w; vec3 r=texture2DProj(tDiffuse,uv).rgb*.4;
        r+=texture2DProj(tDiffuse,uv+vec4(b,0.,0.,0.)).rgb*.15; r+=texture2DProj(tDiffuse,uv-vec4(b,0.,0.,0.)).rgb*.15;
        r+=texture2DProj(tDiffuse,uv+vec4(0.,b*2.,0.,0.)).rgb*.15; r+=texture2DProj(tDiffuse,uv-vec4(0.,b*2.,0.,0.)).rgb*.15;
        float d=length(vW.xz-vec2(10.,0.)); float fade=exp(-d*.012);
        float g1=gridL(vW.xz,2.,1.1), g8=gridL(vW.xz,8.,1.4);
        float sc=exp(-sq((vW.x-uScan)*.35));
        vec3 gc=vec3(.12,.75,1.)*(g1*.05+g8*.22)*(1.+uBeat*.9+sc*3.)*uGrid;
        vec3 pool=vec3(0.); for(int i=0;i<${POOLS};i++){ vec2 q=vW.xz-uPool[i].xy; float k=exp(-dot(q,q)/(uPool[i].z*uPool[i].z)); pool+=uPoolC[i]*k*uPool[i].w; }
        float rt=uTime-uRip.z; float rd=length(vW.xz-uRip.xy);
        float rip=exp(-sq((rd-rt*12.)*.9))*exp(-rt*.8)*step(0.,rt)*uRip.w;
        vec3 col=r*.55+gc*(1.+pool*2.)+pool*.05+vec3(.3,.9,1.4)*rip*(g1*1.4+.15);
        gl_FragColor=vec4(uBg+col*fade,1.);}`,
  },
});
floor.rotation.x = -Math.PI / 2; floor.position.x = 10; scene.add(floor);
function pool(i, p, rad, c, k) { floorU.uPool.value[i].set(p.x, p.z, rad, k); floorU.uPoolC.value[i].set(c); }

// 遠方的地平線光柱
{
  const n = 420, pos = new Float32Array(n * 6), col = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const a = hash(i * 3.1) * Math.PI * 2, r = 190 + hash(i * 7.7) * 120, h = 1 + Math.pow(hash(i * 5.3), 4) * 26;
    const x = Math.cos(a) * r + 10, z = Math.sin(a) * r; pos.set([x, 0, z, x, h, z], i * 6);
    const c = hash(i * 9.1) < .7 ? new THREE.Color(CY) : new THREE.Color(GOLD), k = .25 + hash(i * 2.3) * .5;
    col.set([c.r * k, c.g * k, c.b * k, 0, 0, 0], i * 6);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
}

// ===== 曲線 → 資料貼圖（讓 GPU 粒子沿路徑跑）=====
const PN = 256;
function pathTex(curve) {
  const d = new Float32Array(PN * 4);
  for (let i = 0; i < PN; i++) { const p = curve.getPointAt(i / (PN - 1)); d.set([p.x, p.y, p.z, 1], i * 4); }
  const t = new THREE.DataTexture(d, PN, 1, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t;
}
const PATH_GLSL = `uniform sampler2D uPath; vec3 PP(float s){ s=clamp(s,0.,1.)*${PN - 1}.; float i=floor(s); float f=s-i;
  vec3 a=texture2D(uPath,vec2((i+.5)/${PN}.,.5)).xyz; vec3 b=texture2D(uPath,vec2((min(i+1.,${PN - 1}.)+.5)/${PN}.,.5)).xyz; return mix(a,b,f);}`;
const curve = pts => new THREE.CatmullRomCurve3(pts.map(p => p.clone ? p.clone() : V(...p)), false, 'centripetal');

// ===== GPU 粒子（種子決定位置，確定性）=====
const PT_FS = `varying float vA; varying vec3 vC; void main(){vec2 p=gl_PointCoord-.5; float d=length(p); float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vC*(a*a+smoothstep(.12,0.,d)*1.5),1.)*vA;}`;
const pts = [];
function makePoints(n, body, o = {}) {
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) seed[i] = hash(i * 1.37 + (o.salt || 0) * 91.7);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = {
    uTime: U.time, uBeat: U.beat, uScale: { value: 1000 }, uSize: { value: o.size || .06 }, uAmt: { value: 0 }, uProg: { value: 0 },
    uHead: { value: 0 }, uTail: { value: 0 }, uSpeed: { value: o.speed || .3 }, uRad: { value: o.rad || .15 },
    uColor: { value: o.color || HDR(CY, 2) }, uColor2: { value: o.color2 || HDR(OR, 2) }, uA: { value: (o.A || V()).clone() }, uMouse: { value: V(0, -99, 0) }, uPhase: { value: 0 },
    uPath: { value: o.path ? pathTex(o.path) : null },
  };
  const vs = `attribute vec4 aSeed; uniform float uTime,uBeat,uScale,uSize,uAmt,uProg,uHead,uTail,uSpeed,uRad,uPhase; uniform vec3 uColor,uColor2,uA,uMouse; varying float vA; varying vec3 vC;
    ${o.path ? PATH_GLSL : ''}
    void main(){ vec3 pos=vec3(0.); float a=1.; float sz=1.; vec3 col=uColor; ${body}
      vec4 mv=modelViewMatrix*vec4(pos,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(uSize*sz*uScale/max(-mv.z,.1),1.,48.); vA=a*uAmt*smoothstep(.8,3.5,-mv.z); vC=col; }`;  // 太靠近鏡頭的粒子淡出，避免糊成大光斑
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); pts.push(p); return p;
}
// 沿路徑流動的光點：在 [uTail, uHead] 區間內循環
const FLOW = `
  float sp=.55+.9*aSeed.y; float u=fract(aSeed.x+uTime*uSpeed*sp);
  float s=mix(uTail,uHead,u); vec3 p=PP(s); vec3 t=normalize(PP(s+.006)-PP(s-.006)+1e-5);
  vec3 n1=normalize(cross(t,vec3(0.,1.,0.))+vec3(1e-4)); vec3 n2=cross(t,n1);
  float an=aSeed.z*6.283+uTime*(1.5+aSeed.w*2.5); float rr=uRad*(.15+.85*aSeed.w*aSeed.w);
  pos=p+(n1*cos(an)+n2*sin(an))*rr;
  a=smoothstep(0.,.06,u)*smoothstep(1.,.94,u)*step(.0005,uHead-uTail)*(.85+.15*sin(uTime*2.+aSeed.x*50.));
  sz=.5+aSeed.w*1.4+step(.93,aSeed.y)*1.4; col=uColor*(1.+step(.93,aSeed.y)*1.5);`;
function makeFlow(cv, n, color, o = {}) { return makePoints(n, FLOW, Object.assign({ path: cv, color, size: .07, speed: .25, rad: .22 }, o)); }

// ===== 光軌（雙層管：白熱核心＋色暈）=====
const TRACK_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv;}`;
const TRACK_FS = `uniform vec3 uColor; uniform float uI,uHead,uTail,uTime,uCore,uLen,uDash,uFlow; uniform vec4 uPulses; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ float s=vUv.x; if(s>uHead||s<uTail) discard;
    float f=clamp(abs(dot(vN,vV)),0.,1.); float core=pow(f,uCore);
    float flow=1.-uFlow*.3+uFlow*.3*sin(s*uLen*1.3-uTime*12.);
    float dash=mix(1.,step(.45,fract(s*uLen*.7-uTime*1.4)),uDash);
    float pulse=0.; for(int i=0;i<4;i++){pulse+=exp(-sq((s-uPulses[i])*uLen/1.1));}
    float tip=exp(-sq((s-uHead)*uLen/.8))*step(uHead,.999);
    gl_FragColor=vec4(uColor*core*(flow*dash*uI+pulse*3.5+tip*3.*uI),1.);}`;
function makeTrack(cv, r, color, o = {}) {
  const len = cv.getLength(), segs = Math.max(24, Math.min(600, Math.round(len * 8)));
  const grp = new THREE.Group(); scene.add(grp);
  const layers = [[r, .6, color.clone().lerp(new THREE.Color(1, 1, 1).multiplyScalar(color.r + color.g + color.b), .45).multiplyScalar(.55)], [r * 3, 2.8, color.clone().multiplyScalar(.1)]].map(([rr, core, c]) => {
    const u = { uColor: { value: c }, uI: { value: 0 }, uHead: { value: 0 }, uTail: { value: 0 }, uTime: U.time, uCore: { value: core }, uLen: { value: len }, uDash: { value: o.dash ? 1 : 0 }, uFlow: { value: o.flow ?? 1 }, uPulses: { value: new THREE.Vector4(-9, -9, -9, -9) } };
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: TRACK_VS, fragmentShader: TRACK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(cv, segs, rr, 10, false), m)); return u;
  });
  return {
    grp, cv, len, layers,
    set(head, I, tail = 0, pulses) { grp.visible = I > .002 && head > tail + .0005; for (const u of layers) { u.uHead.value = head; u.uTail.value = tail; u.uI.value = I; if (pulses) u.uPulses.value.set(...pulses); } },
    color(c) { layers[0].uColor.value.copy(c.clone().lerp(new THREE.Color(1, 1, 1).multiplyScalar(c.r + c.g + c.b), .45).multiplyScalar(.55)); layers[1].uColor.value.copy(c).multiplyScalar(.1); },
  };
}
const pulses = (N, starts, dur) => { const o = [-9, -9, -9, -9]; starts.forEach((s, i) => { const p = (N - s) / dur; if (i < 4 && p >= 0 && p <= 1.05) o[i] = p; }); return o; };

// 光牆：沿路徑立起的半透明光帶（底邊最亮）
function makeWall(cv, h, color) {
  const n = 220, pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) { const s = i / (n - 1), p = cv.getPointAt(s); pos.push(p.x, p.y, p.z, p.x, p.y + h, p.z); uv.push(s, 0, s, 1); if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const u = { uColor: { value: color }, uI: { value: 0 }, uHead: { value: 0 }, uTime: U.time, uLen: { value: cv.getLength() } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 uColor; uniform float uI,uHead,uTime,uLen; varying vec2 vUv;
      void main(){ if(vUv.x>uHead) discard; float v=vUv.y;
        float k=exp(-v*18.)*2.2+pow(1.-v,3.)*.22+exp(-(1.-v)*40.)*.35;
        float streak=.75+.25*sin(vUv.x*uLen*3.-uTime*6.);
        float tip=exp(-sq((vUv.x-uHead)*uLen/1.2))*step(uHead,.999);
        gl_FragColor=vec4(uColor*(k*streak*uI+tip*2.*(1.-v)*uI)*.5,1.);}`,
  });
  const mesh = new THREE.Mesh(g, m); scene.add(mesh);
  return { set(head, I) { mesh.visible = I > .002 && head > .001; u.uHead.value = head; u.uI.value = I; } };
}

// ===== 公告板（光暈、衝擊波）=====
const BILL_VS = `uniform float uS; varying vec2 vUv; void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.); mv.xy+=position.xy*uS; gl_Position=projectionMatrix*mv;}`;
const BILL_FS = {
  glow: `uniform vec3 uColor; uniform float uI; varying vec2 vUv; void main(){float d=length(vUv-.5)*2.; float g=pow(max(1.-d,0.),2.8)*.5; gl_FragColor=vec4(uColor*g*uI,1.);}`,
  ring: `uniform vec3 uColor; uniform float uI,uProg; varying vec2 vUv;
    void main(){float d=length(vUv-.5)*2.; float r=exp(-sq((d-uProg)/(.02+.05*uProg))); gl_FragColor=vec4(uColor*r*uI*(1.-uProg),1.);}`,
  star: `uniform vec3 uColor; uniform float uI; varying vec2 vUv; void main(){vec2 p=(vUv-.5)*2.; float d=length(p);
    float g=pow(max(1.-d,0.),3.)*.8+exp(-abs(p.y)*60.)*sq(max(1.-abs(p.x),0.))*1.2+exp(-abs(p.x)*60.)*sq(max(1.-abs(p.y),0.))*.5; gl_FragColor=vec4(uColor*g*uI*.55,1.);}`,
};
function makeBill(kind, color, s, pos) {
  const u = { uS: { value: s }, uColor: { value: color }, uI: { value: 0 }, uProg: { value: 0 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: BILL_VS, fragmentShader: BILL_FS[kind], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); mesh.frustumCulled = false; if (pos) mesh.position.copy(pos); scene.add(mesh);
  mesh.set = (I, prog) => { mesh.visible = I > .002; u.uI.value = I; if (prog !== undefined) u.uProg.value = prog; };
  return mesh;
}
// 地面衝擊環（平躺）
function makeFloorRing(color, pos, s) {
  const u = { uColor: { value: color }, uI: { value: 0 }, uProg: { value: 0 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: BILL_FS.ring });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s), m); mesh.rotation.x = -Math.PI / 2; mesh.position.copy(pos); scene.add(mesh);
  mesh.set = (I, prog) => { mesh.visible = I > .002; u.uI.value = I; u.uProg.value = prog; };
  return mesh;
}

// ===== 標籤 =====
function label(html, cls, pos, parent = scene) {
  const d = document.createElement('div'); d.className = 'lab ' + (cls || ''); d.innerHTML = html;
  const o = new CSS2DObject(d); o.position.copy(pos); parent.add(o); setO(o, 0); return o;
}
function setO(o, a) { a = clamp(a); o.visible = a > .01; if (o._a !== a) { o.element.style.opacity = a.toFixed(3); o._a = a; } }

// ===== 浮塵 =====
const dust = makePoints(2600, `
  pos=vec3(aSeed.x*140.-55.,aSeed.y*34.,aSeed.z*80.-45.);
  pos.y=mod(pos.y+uTime*(.08+.3*aSeed.w),34.);
  pos.x+=sin(uTime*.13+aSeed.w*40.)*1.2; pos.z+=cos(uTime*.11+aSeed.x*30.)*1.2;
  vec3 d=pos-uMouse; float k=exp(-dot(d,d)/10.); pos+=normalize(d+1e-4)*k*2.8;
  a=(.2+.8*pow(clamp(.5+.5*sin(uTime*(.8+aSeed.w*3.)+aSeed.x*60.),0.,1.),3.))*smoothstep(34.,26.,pos.y)*smoothstep(0.,1.5,pos.y)*(1.+uBeat*.8);
  sz=.4+aSeed.w*1.3; col=mix(uColor,vec3(1.8,1.1,.5),step(.93,aSeed.y))*(1.+k*4.);`, { size: .05, color: HDR(0x6fd8ff, .9), salt: 1 });

// ===== INPUT：數據雨＋集流漏斗 =====
const rainN = 1400;
const rain = (() => {
  const pos = new Float32Array(rainN * 6), sd = new Float32Array(rainN * 8);
  for (let i = 0; i < rainN; i++) { const s = [hash(i * 1.1), hash(i * 2.3), hash(i * 3.7), hash(i * 4.9)]; sd.set([...s, ...s], i * 8); }
  const end = new Float32Array(rainN * 2); for (let i = 0; i < rainN; i++) { end[i * 2] = 0; end[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const u = { uTime: U.time, uAmt: { value: 0 }, uC: { value: P.IN.clone() } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aSeed; attribute float aEnd; uniform float uTime,uAmt; uniform vec3 uC; varying float vA; varying vec3 vC;
      vec3 at(float u){ float y=mix(46.,2.2,u); float r=(1.-pow(1.-clamp((y-2.2)/40.,0.,1.),1.))*14.*(.25+.75*aSeed.z);
        float rr=mix(r, .5+aSeed.z*.6, smoothstep(17.,2.,y)); float an=aSeed.y*6.283+u*1.3;
        return uC+vec3(cos(an)*rr,y,sin(an)*rr); }
      void main(){ float u=fract(aSeed.x+uTime*(.22+.25*aSeed.w)); float uu=u-aEnd*(.02+.05*aSeed.w);
        vec3 p=at(clamp(uu,0.,1.)); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        vA=(1.-aEnd)*uAmt*smoothstep(0.,.05,u)*(.5+.5*aSeed.w)*smoothstep(1.,5.,-(modelViewMatrix*vec4(p,1.)).z);
        vC=aSeed.y<.33?vec3(.7,2.2,2.6):aSeed.y<.66?vec3(2.4,1.6,.7):vec3(2.,2.3,2.5); }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){gl_FragColor=vec4(vC*vA,1.);}`,
  });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; scene.add(l); return u;
})();
const funnel = (() => {
  const g = new THREE.Group(); g.position.copy(P.IN); scene.add(g);
  const mat = new THREE.MeshBasicMaterial({ color: HDR(WHITE, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const rings = [];
  for (let i = 0; i < 7; i++) { const t = i / 6, y = lerp(14, 2.4, t), r = lerp(8, .9, Math.pow(t, .7)); const m = new THREE.Mesh(new THREE.TorusGeometry(r, .025 + .02 * (i === 0), 6, 120), mat.clone()); m.rotation.x = Math.PI / 2; m.position.y = y; g.add(m); rings.push(m); }
  const ribs = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const cv = curve([0, 1, 2, 3, 4, 5, 6].map(k => { const t = k / 6; return V(Math.cos(a) * lerp(8, .9, Math.pow(t, .7)), lerp(14, 2.4, t), Math.sin(a) * lerp(8, .9, Math.pow(t, .7))); })); const m = new THREE.Mesh(new THREE.TubeGeometry(cv, 40, .012, 4), mat.clone()); g.add(m); ribs.push(m); }
  return { g, rings, ribs };
})();
const funnelGlow = makeBill('glow', HDR(WHITE, 1.2), 10, P.IN.clone().add(V(0, 2.5, 0)));
const labIn = label('<small>INPUT</small>真實數據', 'big', P.IN.clone().add(V(0, 16, 0)));
const labInSub = ['用戶行為', '交易紀錄', '市場資料'].map((t, i) => label(t, 'tag', P.IN.clone().add(V(-7 + i * 7, 18.3 - (i === 1) * .0, 0)), scene));

// 數據光河：漏斗底 → 地面 → 升入假設核心
const cvRiver = curve([[-38, 2.2, 0], [-36.5, .35, .6], [-31, .35, 2.2], [-25, .35, .8], [-20.5, .35, 0], [-16.5, 1.2, 0], [-14, 3.2, 0], [-13, 4.2, 0]]);
const cvRiverFloor = curve([[-36.5, 0, .6], [-31, 0, 2.2], [-25, 0, .8], [-20.5, 0, 0], [-17, 0, 0]]);
const river = makeTrack(cvRiver, .07, HDR(WHITE, 2.4));
const riverWall = makeWall(cvRiverFloor, 1.4, HDR(CY, 1.1));
const riverFlow = makeFlow(cvRiver, 700, HDR(0xbff6ff, 2.4), { speed: .18, rad: .3, salt: 3 });

// ===== AI HARNESS 結界：線框立方體＋全息牆 =====
const cubeEdges = (() => {
  const { x0, x1, y0, y1, z0, z1 } = CUBE;
  const E = [[[x0, y0, z1], [x1, y0, z1]], [[x0, y0, z0], [x1, y0, z0]], [[x0, y0, z0], [x0, y0, z1]], [[x1, y0, z0], [x1, y0, z1]],
    [[x0, y0, z1], [x0, y1, z1]], [[x1, y0, z1], [x1, y1, z1]], [[x0, y0, z0], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0]],
    [[x0, y1, z1], [x1, y1, z1]], [[x0, y1, z0], [x1, y1, z0]], [[x0, y1, z0], [x0, y1, z1]], [[x1, y1, z0], [x1, y1, z1]]];
  return E.map(([a, b]) => makeTrack(new THREE.LineCurve3(V(...a), V(...b)), .028, HDR(CY, 2), { flow: .4 }));
})();
const cornerGlows = [];
for (const x of [CUBE.x0, CUBE.x1]) for (const y of [CUBE.y0, CUBE.y1]) for (const z of [CUBE.z0, CUBE.z1]) cornerGlows.push(makeBill('star', HDR(CY, 1.4), 3.2, V(x, y, z)));
const holoMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.time, uA: { value: 0 }, uScan: { value: 0 }, uFlash: { value: 0 }, uFC: { value: new THREE.Color(CY) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){vUv=uv; vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform float uTime,uA,uScan,uFlash; uniform vec3 uFC; varying vec3 vW; varying vec2 vUv; ${GRID}
    void main(){ vec2 e=min(vUv,1.-vUv); float edge=exp(-min(e.x,e.y)*40.);
      float g=gridL(vW.xy+vW.zz,2.,1.)*.25+gridL(vW.zy+vW.xx,2.,1.)*.25;
      float sc=exp(-sq((vW.y-mod(uTime*3.,30.)+8.)*1.2))*.6;
      vec3 c=vec3(.15,.8,1.)*(g*.06+edge*.12+sc*.08)*uA+uFC*uFlash*.18*(.3+edge);
      gl_FragColor=vec4(c,1.);}`,
});
const holo = new THREE.Group(); scene.add(holo);
{
  const { x0, x1, y0, y1, z0, z1 } = CUBE, w = x1 - x0, h = y1 - y0, d = z1 - z0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const add = (pw, ph, x, y, z, rx, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), holoMat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); holo.add(m); };
  add(w, h, cx, cy, z0, 0, 0); add(d, h, x0, cy, 0, 0, Math.PI / 2); add(d, h, x1, cy, 0, 0, Math.PI / 2); add(w, d, cx, y1, 0, Math.PI / 2, 0);
}
const labHarness = label('<small>AI HARNESS</small>可控模擬環境', 'big tagc', V(CUBE.x0 + 6.5, CUBE.y1 + 1.6, CUBE.z1));

// ===== 假設 H(n)：黑鉻多面體，接縫發光，可拆解重組 =====
const core = (() => {
  const grp = new THREE.Group(); grp.position.copy(P.H); scene.add(grp);
  const base = new THREE.IcosahedronGeometry(2.2, 0).toNonIndexed(); const pa = base.attributes.position;
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0x0a0f16, metalness: 1, roughness: .16, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 2.2, side: THREE.DoubleSide, emissive: new THREE.Color(CY), emissiveIntensity: 0 });
  const seamMat = new THREE.LineBasicMaterial({ color: HDR(CY, 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const shards = [];
  for (let f = 0; f < pa.count / 3; f++) {
    const a = V().fromBufferAttribute(pa, f * 3), b = V().fromBufferAttribute(pa, f * 3 + 1), c = V().fromBufferAttribute(pa, f * 3 + 2);
    const cen = a.clone().add(b).add(c).divideScalar(3);
    const g = new THREE.BufferGeometry().setFromPoints([a.clone().sub(cen), b.clone().sub(cen), c.clone().sub(cen)]); g.computeVertexNormals();
    const pivot = new THREE.Group(); grp.add(pivot);
    const m = new THREE.Mesh(g, chrome); pivot.add(m);
    const lg = new THREE.BufferGeometry().setFromPoints([a, b, b, c, c, a].map(p => p.clone().sub(cen).multiplyScalar(1.002)));
    const l = new THREE.LineSegments(lg, seamMat); pivot.add(l);
    shards.push({ pivot, cen, ax: V(hash(f * 3.1) - .5, hash(f * 5.7) - .5, hash(f * 7.3) - .5).normalize(), h: hash(f * 9.9) });
  }
  const inner = makeBill('glow', HDR(CY, 1.6), 9, P.H);
  const rings = [0, 1].map(i => { const m = new THREE.Mesh(new THREE.TorusGeometry(3.4 + i * .6, .02, 6, 160), new THREE.MeshBasicMaterial({ color: HDR(CY, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.copy(P.H); scene.add(m); return m; });
  shards.slice().sort((a, b) => a.h - b.h).forEach((sh, k) => sh.ord = k / (shards.length - 1));
  // 高速移動時的光痕（每片一條，長度跟速度成正比）
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(shards.length * 6), 3));
  const trails = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: HDR(CY, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  trails.frustumCulled = false; scene.add(trails);
  return { grp, shards, chrome, seamMat, inner, rings, trails };
})();
// 合體瞬間的塵爆
const dustBurst = makePoints(600, `vec3 dir=normalize(vec3(aSeed.x-.5,(aSeed.y-.5)*.7,aSeed.z-.5)+1e-3); float u=uProg;
  pos=uA+dir*(1.-exp(-u*5.))*(2.5+aSeed.w*7.)+vec3(0.,-.5*u*u,0.); a=step(0.,u)*exp(-u*1.6)*(.5+.5*aSeed.w); sz=.4+aSeed.w*1.3; col=mix(uColor,vec3(2.4,2.6,2.8),aSeed.y*.5);`,
  { A: P.H, size: .06, color: HDR(CY, 2.2), salt: 41 });
const labH = label('<small>HYPOTHESIS</small>假設 <b id="hn">H(1)</b>', 'big', P.H.clone().add(V(0, -3.8, 0)));

// ===== 03 金絲雀測試：探測光球＋市場切片 =====
const cvCanary = curve([P.H.clone().add(V(.5, 1.6, 0)), V(-11, 10.2, -2.2), V(-7.5, 11.4, -4.6), P.PROBE]);
const canaryTrack = makeTrack(cvCanary, .03, HDR(GOLD, 2.2), { flow: .6 });
const canaryTrail = makeFlow(cvCanary, 220, HDR(GOLD, 2.6), { speed: .5, rad: .12, salt: 5, size: .06 });
const probe = new THREE.Mesh(new THREE.SphereGeometry(.2, 24, 16), new THREE.MeshBasicMaterial({ color: HDR(GOLD, 1.5) })); scene.add(probe);
const probeGlow = makeBill('star', HDR(GOLD, .9), 1.4);
const market = (() => {
  const grp = new THREE.Group(); grp.position.copy(P.MKT); grp.rotation.y = .32; scene.add(grp);
  const u = { uTime: U.time, uA: { value: 0 }, uScan: { value: -1 }, uOk: { value: 0 }, uBars: { value: 0 }, uFail: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.6), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime,uA,uScan,uOk,uBars,uFail; varying vec2 vUv; ${GRID}
      float hs(float n){return fract(sin(n*91.7)*43758.5);}
      void main(){ vec2 p=vUv*vec2(9.,5.6); vec2 e=min(vUv,1.-vUv); float frame=exp(-min(e.x*9.,e.y*5.6)*14.);
        float g=gridL(p,.7,1.)*.18;
        float bi=floor((vUv.x-.08)/.84*12.); float inb=step(.08,vUv.x)*step(vUv.x,.92)*step(.25,fract((vUv.x-.08)/.84*12.));
        float bh=(.25+.6*hs(bi+3.))*uBars; float bar=inb*step(.1,vUv.y)*step(vUv.y,.1+bh*.75);
        float sc=exp(-sq((vUv.y-uScan)*40.))*step(0.,uScan);
        vec3 base=vec3(.2,.85,1.); vec3 ok=vec3(.3,1.6,.9); vec3 bad=vec3(1.6,.2,.3);
        vec3 c=mix(base,ok,uOk); c=mix(c,bad,uFail);
        vec3 col=c*(g*.4+frame*.9+bar*.55)+vec3(2.,1.6,.9)*sc*.9;
        gl_FragColor=vec4(col*uA,1.);}`,
  }));
  grp.add(m);
  return { grp, u };
})();
const scanCone = (() => {
  const g = new THREE.ConeGeometry(3.4, 1, 48, 1, true); g.translate(0, -.5, 0); g.rotateX(-Math.PI / 2);
  const u = { uI: { value: 0 }, uTime: U.time };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uI,uTime; varying vec2 vUv; void main(){ float k=pow(1.-vUv.y,.6)*.4+exp(-sq(fract(vUv.x*6.-uTime*.6)-.5)*80.)*.4; gl_FragColor=vec4(vec3(1.6,1.2,.6)*k*uI*(1.-vUv.y*.5)*.3,1.);}` }));
  m.position.copy(P.PROBE); m.lookAt(P.MKT); m.scale.set(1, 1, P.PROBE.distanceTo(P.MKT)); scene.add(m);
  return { m, u };
})();
const okRing = makeBill('ring', HDR(GREEN, 3), 12, P.MKT);
const labCan = label('<small>03 · CANARY TEST</small>金絲雀測試', 'big gold', P.MKT.clone().add(V(0, 3.9, 0)));
const labOk = label('✓ 方向可行', 'tag green', P.MKT.clone().add(V(4.6, -3.4, 0)));
const cvNoGo = curve([P.MKT.clone().add(V(4.6, .3, .6)), V(1.5, 12.4, -8.8), P.LOOP.clone().add(V(-3.6, 0, 0))]);
const noGo = makeTrack(cvNoGo, .025, HDR(RED, 2), { dash: true, flow: 0 });
const labNoGo = label('不可行 → Loop', 'sm red', V(2.4, 13.6, -9));

// ===== 01 A/B 測試：雙軌＋成效柱 =====
const cvToSplit = curve([P.H.clone().add(V(0, -2.4, 0)), V(-11.5, 2.6, 0), V(-9, 1, 0), P.SPLIT]);
const toSplit = makeTrack(cvToSplit, .06, HDR(WHITE, 2.2));
const toSplitFlow = makeFlow(cvToSplit, 260, HDR(0xcff8ff, 2.4), { speed: .35, rad: .2, salt: 7 });
const mkAB = z => curve([P.SPLIT, V(-5, .7, z * .8), V(-2.6, .7, z), V(8, .7, z), V(11.4, 1.8, z * .72), V(13.7, 4, z * .25), P.GATE]);
const cvA = mkAB(-3.4), cvB = mkAB(3.4);
const trA = makeTrack(cvA, .065, HDR(CY, 2.4)), trB = makeTrack(cvB, .065, HDR(OR, 2.4));
const flA = makeFlow(cvA, 520, HDR(CY, 2.6), { speed: .22, rad: .32, salt: 11 }), flB = makeFlow(cvB, 520, HDR(OR, 2.6), { speed: .22, rad: .32, salt: 13 });
const wallA = makeWall(curve([V(-2.6, 0, -3.4), V(8, 0, -3.4)]), 1.1, HDR(CY, 1)), wallB = makeWall(curve([V(-2.6, 0, 3.4), V(8, 0, 3.4)]), 1.1, HDR(OR, 1));
const AB_END = .66; // 雙軌到成效柱為止的比例
function makeMeter(pos, color) {
  const u = { uFill: { value: 0 }, uA: { value: 0 }, uColor: { value: color }, uTime: U.time, uTarget: { value: .8 } };
  const g = new THREE.BoxGeometry(1.3, 7, 1.3); g.translate(0, 3.5, 0);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uFill,uA,uTime,uTarget; uniform vec3 uColor; varying vec3 vP;
      void main(){ vec3 q=abs(vec3(vP.x/.65,(vP.y-3.5)/3.5,vP.z/.65)); float e2=(step(.94,q.x)+step(.94,q.y)+step(.94,q.z));
        float edge=step(1.5,e2); float y=vP.y/7.; float fill=step(y,uFill); float top=exp(-sq((y-uFill)*7.*6.));
        float lines=step(.92,fract(y*20.))*.2;
        vec3 c=uColor*(edge*.9+fill*(.16+lines+.12*sin(y*30.-uTime*4.))+top*2.5);
        gl_FragColor=vec4(c*uA,1.);}` }));
  m.position.copy(pos); scene.add(m); return u;
}
const mA = makeMeter(P.MA, HDR(CY, 2)), mB = makeMeter(P.MB, HDR(OR, 2));
const cvTarget = new THREE.LineCurve3(V(8.6, 5.6, -7.2), V(8.6, 5.6, 7.2));
const target = makeTrack(cvTarget, .02, HDR(WHITE, 2), { dash: true, flow: 0 });
const labA = label('<b>A</b> 控制組', 'ab cy', V(-1, .9, -5.4)), labB = label('<b>B</b> 變異組', 'ab or', V(-1, .9, 5.4));
const labMA = label('A <span id="va">0</span>%', 'meter cy', P.MA.clone().add(V(0, 8, 0))), labMB = label('B <span id="vb">0</span>%', 'meter or', P.MB.clone().add(V(0, 8, 0)));
const labTarget = label('預測目標 80%', 'sm', V(8.6, 6.3, 0));
const labAB = label('<small>01 · A/B TEST</small>A/B 測試', 'big', V(2.6, 2.4, 0));
const vaEl = labMA.element.querySelector('#va'), vbEl = labMB.element.querySelector('#vb');

// ===== 預測目標達成？菱形閘門 =====
const gate = (() => {
  const grp = new THREE.Group(); grp.position.copy(P.GATE); scene.add(grp);
  const halves = [1, -1].map(sg => {
    const h = new THREE.Group(); grp.add(h);
    const ptsV = [V(0, 3.6 * sg, 0), V(2.4, 0, 0), V(0, 0, 2.4), V(-2.4, 0, 0), V(0, 0, -2.4)];
    const tubes = [];
    for (let i = 1; i <= 4; i++) {
      tubes.push([ptsV[0], ptsV[i]]); tubes.push([ptsV[i], ptsV[i % 4 + 1]]);
    }
    const mat = new THREE.MeshBasicMaterial({ color: HDR(CY, 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    tubes.forEach(([a, b]) => h.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, .05, 6), mat)));
    const glass = new THREE.Mesh(new THREE.ConeGeometry(2.4 * Math.SQRT2 * .98, 3.6, 4, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x050a10, metalness: .6, roughness: .08, transparent: true, opacity: .55, envMapIntensity: 1.8, side: THREE.DoubleSide }));
    glass.position.y = 1.8 * sg; glass.rotation.y = Math.PI / 4; if (sg < 0) glass.rotation.x = Math.PI; h.add(glass);
    return { h, mat };
  });
  const glow = makeBill('glow', HDR(CY, 1.2), 8, P.GATE);
  const shock = makeBill('ring', HDR(RED, 2), 16, P.GATE);
  return { grp, halves, glow, shock };
})();
const gateFloorRing = makeFloorRing(HDR(CY, 2.5), V(P.GATE.x, .05, 0), 96);  // 重拍時從閘門向外擴散的地面衝擊波
const coreFloorRing = makeFloorRing(HDR(CY, 2.5), V(P.H.x, .05, 0), 50);
const labGate = label('預測目標達成？', 'big', P.GATE.clone().add(V(0, -4.9, 0)));
const labNo = label('否 → 迭代', 'tag red', P.GATE.clone().add(V(3.4, 4.4, 0)));
const labYes = label('是・預測達標', 'tag gold', P.GATE.clone().add(V(4.4, -1.6, 1)));

// ===== 02 Loop 迭代：偏心雙環 =====
const loopRings = (() => {
  const grp = new THREE.Group(); grp.position.copy(P.LOOP); grp.rotation.set(.12, .28, 0); scene.add(grp);
  const mk = (r, off, c) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, .05, 8, 220), new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.x = off; grp.add(m); return m; };
  return { grp, r1: mk(3.6, 0, HDR(OR, 3)), r2: mk(3.0, .55, HDR(OR, 1.6)) };
})();
const loopPts = makePoints(900, `
  float lag=floor(aSeed.w*8.)/8.; float an=aSeed.x*6.283+uPhase-lag*.5;
  float r=mix(3.0,3.6,aSeed.y)+sin(an*3.+aSeed.z*9.)*.08; vec3 off=vec3(mix(.55,0.,aSeed.y),0.,0.);
  vec3 lp=vec3(cos(an)*r,sin(an)*r,(aSeed.z-.5)*.35)+off;
  float cx=cos(.28),sx=sin(.28),cr=cos(.12),sr=sin(.12);
  lp=vec3(lp.x,lp.y*cr-lp.z*sr,lp.y*sr+lp.z*cr); lp=vec3(lp.x*cx+lp.z*sx,lp.y,-lp.x*sx+lp.z*cx);
  pos=uA+lp; a=(1.-lag)*(.5+.5*aSeed.z); sz=(1.-lag*.7)*(.6+aSeed.z); col=mix(uColor,vec3(2.6,2.2,1.6),step(.9,aSeed.z));`, { A: P.LOOP, size: .09, color: HDR(OR, 2.4), salt: 17 });
const loopGlow = makeBill('glow', HDR(OR, .6), 10, P.LOOP);
const labLoop = label('<small>02 · ITERATION</small>Loop 迭代', 'big orange', P.LOOP.clone().add(V(0, 5, 0)));
const cvNo = curve([P.GATE.clone().add(V(0, 3.6, 0)), V(16.4, 10, -2.6), V(11, 13.6, -6.8), V(5, 12.4, -7.2), P.LOOP.clone().add(V(3.5, .4, -.9))]);
const cvBack = curve([P.LOOP.clone().add(V(-3.5, -.4, .9)), V(-4.2, 13.6, -5.4), V(-9.6, 11.4, -1.8), P.H.clone().add(V(0, 2.4, 0))]);
const noTrack = makeTrack(cvNo, .06, HDR(RED, 2.4)), backTrack = makeTrack(cvBack, .06, HDR(OR, 2.4));
const noFlow = makeFlow(cvNo, 300, HDR(RED, 2.4), { speed: .3, rad: .2, salt: 19 }), backFlow = makeFlow(cvBack, 300, HDR(OR, 2.4), { speed: .3, rad: .2, salt: 23 });
const labRevise = label('修正假設 ↺', 'tag orange', V(-7.2, 13.4, -3.6));

// ===== 是 → 離開結界 =====
const cvYes = curve([P.GATE.clone().add(V(0, -.6, 0)), V(17.6, 4.4, 0), P.EXIT, V(24, 2.4, 0), V(27.4, .8, 0), P.LAND]);
const yesTrack = makeTrack(cvYes, .08, HDR(GOLD, 2.6));
const yesFlow = makeFlow(cvYes, 400, HDR(GOLD, 1.8), { speed: .3, rad: .2, salt: 29, size: .055 });
const exitRing = makeBill('ring', HDR(GOLD, 3), 18, P.EXIT);
const pilot = new THREE.Mesh(new THREE.SphereGeometry(.18, 20, 14), new THREE.MeshBasicMaterial({ color: HDR(0xfff2d8, 1.8) })); scene.add(pilot);
const pilotGlow = makeBill('star', HDR(GOLD, 1), 1.6);

// ===== 真實用戶：白金城市點陣 =====
const city = (() => {
  const list = [];
  for (let x = 25; x <= 48; x += 1.15) for (let z = -12; z <= 12; z += 1.15) {
    const jx = x + (hash(x * 3 + z) - .5) * .4, jz = z + (hash(x + z * 7) - .5) * .4;
    if (Math.abs(jz) < 1.6 || hash(x * 1.7 + z * 2.9) < .28) continue;
    const dc = Math.hypot(jx - 36, jz) / 14; const h = .3 + Math.pow(hash(x * 5.1 + z * 1.3), 3) * 4 * (1.2 - dc * .6);
    list.push([jx, jz, Math.max(.25, h), hash(x * 9.3 + z * 4.1)]);
  }
  const n = list.length;
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, .5, 0);
  const seed = new Float32Array(n * 4);
  const u = { uTime: U.time, uLit: { value: 0 }, uAll: { value: 0 }, uBase: { value: 0 }, uC: { value: new THREE.Vector2(P.LAND.x, 0) } };
  const m = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aSeed; varying vec3 vP; varying vec4 vS; varying vec3 vW; void main(){vP=position; vS=aSeed; vec4 w=modelMatrix*instanceMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float uTime,uLit,uAll,uBase; uniform vec2 uC; varying vec3 vP; varying vec4 vS; varying vec3 vW;
      void main(){ vec3 q=abs(vec3(vP.x*2.,vP.y*2.-1.,vP.z*2.)); float e2=step(.88,q.x)+step(.88,q.y)+step(.88,q.z); float edge=step(1.5,e2);
        float top=step(.97,vP.y); float win=step(.6,fract(vP.y*vS.z*8.+vS.w*3.))*step(.5,fract(vP.x*3.+vS.w*7.))*.3;
        float d=length(vW.xz-uC); float lit=max(smoothstep(uLit,uLit-2.,d),uAll*smoothstep(0.,.3,uAll-vS.w*.6));
        float tw=.75+.25*sin(uTime*3.+vS.w*40.);
        vec3 c=vec3(1.,.8,.5)*(edge*(.12*uBase+lit*1.4)+top*lit*1.2+win*lit*tw);
        gl_FragColor=vec4(c,1.);}` });
  const inst = new THREE.InstancedMesh(g, m, n); const dm = new THREE.Object3D();
  list.forEach(([x, z, h, s], i) => { dm.position.set(x, 0, z); dm.scale.set(.62, h, .62); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix); seed.set([x, z, .4 + s * .8, s], i * 4); });
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  inst.frustumCulled = false; scene.add(inst);
  return { u, list };
})();
const labCity = label('<small>CLOSED LOOP · REAL USERS</small>真實用戶閉環測試', 'big gold', V(36, 7.6, 10));
const labSmall = label('小規模上線', 'tag gold', V(30, 3.8, 3));
// 使用者回饋光點：從亮起的城市升起
const userPts = makePoints(500, `
  float u=fract(aSeed.x+uTime*(.18+.2*aSeed.y)); float an=aSeed.z*6.283; float r=uProg*(.4+.6*aSeed.w);
  vec3 b=uA+vec3(cos(an)*r,0.,sin(an)*r*1.3);
  pos=b+vec3(sin(u*6.+aSeed.w*9.)*.3,u*9.,0.); a=smoothstep(0.,.1,u)*smoothstep(1.,.6,u); sz=.6+aSeed.w; col=mix(uColor,vec3(2.5,2.4,2.2),step(.8,aSeed.y));`, { A: P.LAND, size: .07, color: HDR(GOLD, 2.4), salt: 31 });
// 預測 vs 實測曲線（全息面板）
const curves = (() => {
  const u = { uTime: U.time, uA: { value: 0 }, uDraw: { value: 0 }, uConv: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.6), new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime,uA,uDraw,uConv; varying vec2 vUv; ${GRID}
      float f(float x){return .18+.62*(1.-exp(-x*2.6))+.05*sin(x*9.);}
      void main(){ vec2 p=vUv; vec2 e=min(p,1.-p); float frame=exp(-min(e.x*14.,e.y*5.6)*16.)*.6;
        float g=gridL(p*vec2(14.,5.6),.8,1.)*.12; float on=step(p.x,uDraw);
        float yp=f(p.x); float ya=yp+(1.-uConv)*(.16*sin(p.x*13.+1.)+.08*sin(p.x*31.))*smoothstep(0.,.15,p.x);
        float lp=exp(-sq((p.y-yp)*5.6*14.))*on*step(.5,fract(p.x*30.)); float la=exp(-sq((p.y-ya)*5.6*12.))*on;
        vec3 col=vec3(.2,.85,1.)*(g+frame)+vec3(.4,1.6,2.)*lp*1.4+vec3(2.2,1.5,.6)*la*1.6;
        gl_FragColor=vec4(col*uA,1.);}` }));
  m.position.set(37, 10.2, -7); m.rotation.y = -.18; scene.add(m);
  u.mesh = m; return u;
})();
const labCurves = label('<span class="cy">— — 預測</span>　<span class="gd">—— 實測</span>', 'sm', V(37, 13.6, -7));

// ===== 實測數據回饋：跨越天空的大光弧 =====
const cvFeed = curve([[40, .5, -2.5], [43, 9, -7], [31, 22, -13], [0, 27.5, -15], [-27, 21.5, -10], [-36.5, 16, -2.5], [-38, 14.4, 0]]);
const feed = makeTrack(cvFeed, .13, HDR(OR, 2.6));
const feedFlow = makeFlow(cvFeed, 900, HDR(OR, 2.6), { speed: .1, rad: .5, salt: 37, size: .09 });
const labFeed = label('實測數據回饋 ↺', 'tag orange', V(0, 29.4, -15));

// ===== OUTPUT 落地決策：光門＋通天光柱 =====
const cvOut = curve([[31, 0, 0], [40, 0, .5], [48, 0, -.5], [55, 0, 0], [60, 0, 0]]);
const outWall = makeWall(cvOut, 1.6, HDR(GOLD, 1.2));
const outTrack = makeTrack(cvOut, .06, HDR(GOLD, 2.4));
const outGate = (() => {
  const grp = new THREE.Group(); grp.position.copy(P.OUT); scene.add(grp);
  const mat = new THREE.MeshBasicMaterial({ color: HDR(GOLD, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const parts = [];
  for (const z of [-4.2, 4.2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.32, 1, .32), mat); m.position.set(0, .5, z); m.geometry.translate(0, 0, 0); grp.add(m); parts.push(m); }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(.32, .32, 8.4), mat); grp.add(lintel);
  const beam = makeTrack(new THREE.LineCurve3(V(60, 0, 0), V(60, 140, 0)), .22, HDR(GOLD, 2.2), { flow: .6 });
  const glow = makeBill('glow', HDR(GOLD, 1), 22, P.OUT.clone().add(V(0, 6, 0)));
  const ring = makeFloorRing(HDR(GOLD, 3), P.OUT.clone().add(V(0, .05, 0)), 70);
  return { parts, lintel, beam, glow, ring };
})();
const labOut = label('<small>OUTPUT</small>落地決策', 'big gold', P.OUT.clone().add(V(0, 14.6, 0)));
const labOutSub = label('正式上線・擴大投放・策略定版', 'sm gold', P.OUT.clone().add(V(0, 12.6, 0)));

// ===== 互動：雙擊投放的專屬數據光點 =====
const packetRoute = (() => {
  const seq = [cvToSplit, cvA, cvNo, cvBack, cvToSplit, cvB, cvYes, cvFeed];
  const ptsL = []; for (const c of seq) for (let i = 0; i <= 80; i++) ptsL.push(c.getPointAt(i / 80));
  const cum = [0]; for (let i = 1; i < ptsL.length; i++) cum.push(cum[i - 1] + ptsL[i].distanceTo(ptsL[i - 1]));
  return { ptsL, cum, len: cum[cum.length - 1] };
})();
function routeAt(d) { const { ptsL, cum } = packetRoute; d = clamp(d, 0, packetRoute.len); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m; else hi = m; } const f = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]); return ptsL[lo].clone().lerp(ptsL[hi], f); }
const PKT_N = 60;
const packet = (() => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PKT_N * 3), 3)); const al = new Float32Array(PKT_N); for (let i = 0; i < PKT_N; i++) al[i] = 1 - i / PKT_N; g.setAttribute('aA', new THREE.BufferAttribute(al, 1));
  const u = { uScale: { value: 1000 }, uAmt: { value: 0 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aA; uniform float uScale,uAmt; varying float vA; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=max(1.,(.05+.25*aA*aA)*uScale/max(-mv.z,.1)); vA=aA*uAmt; }`,
    fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vec3(2.6,2.4,2.)*a*a*vA,1.);}` });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return { p, u, g };
})();

// ===== 互動卡片 =====
for (const k in CARDS) {
  const c = CARDS[k], d = document.createElement('div'); d.className = 'card'; d.style.setProperty('--c', c.c);
  d.innerHTML = `<h4>${c.t}</h4><p>${c.b}</p>`;
  c.o = new CSS2DObject(d); c.o.position.copy(c.at); scene.add(c.o); setO(c.o, 0); c.hv = 0;
}
const HITS = [['in', V(-38, 8, 0), 7, 0], ['h', P.H, 3, 12], ['can', P.MKT, 4.5, 15.5], ['ab', V(3, 1, 0), 5.5, 24], ['gate', P.GATE, 3.6, 36], ['loop', P.LOOP, 4, 38.6], ['city', V(36, 2, 0), 9, 64], ['out', V(60, 7, 0), 6, 80]].map(([k, p, r, n]) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ visible: false })); m.position.copy(p); m.userData = { k, n }; scene.add(m); return m;
});

// ===== 導演鏡頭（故事時間）=====
// 三種鏡頭：keys＝關鍵格（可指定緩動）；follow＝騎在光的後方跟著走；orbit＝繞著物體轉。
// 質量感：大位移「加速短、煞停長」，撞擊只交給 recoil 做一次後座。
const brake = x => 1 - Math.pow(1 - clamp(x), 4);          // 快出、長煞停
const heavy = x => { x = clamp(x); return x < .35 ? Math.pow(x / .35, 2) * .5 : .5 + .5 * brake((x - .35) / .65); };
const EASE = { io: eio, brake, heavy, lin: x => clamp(x), in: x => Math.pow(clamp(x), 3), mix: x => eio(x) * .5 + clamp(x) * .5 };
const F = (cv, prog, o = {}) => ({ type: 'follow', cv, prog, back: o.back ?? 2.5, up: o.up ?? .7, side: o.side ?? 0, ahead: o.ahead ?? 6, fov: o.fov ?? 54 });
const K = (keys, ease = 'heavy') => ({ type: 'keys', keys, ease });
const SHOTS = [  // 原本的運鏡（較好理解）：每個 shot 內關鍵格平滑過渡，shot 之間硬切
  [0, K([[0, -66, 2.6, 26, -38, 9, 0, 40], [3.5, -56, 3.4, 19, -38, 10, 0, 42], [7, -48, 5.5, 15, -34, 7, 0, 46]], 'mix')],
  [7, K([[7, -44, 2.2, 9, -24, 2.5, 0, 50], [9.4, -36, 7, 28, -8, 6, 0, 46], [12, -30, 13, 36, 0, 7, 0, 44]], 'mix')],
  [12, K([[12, -20, 6.6, 8.5, -13, 6, 0, 40], [15.5, -8.2, 8.6, 8.6, -13, 6.2, 0, 40]], 'mix')],
  [15.5, K([[15.5, -19, 13, 11, -8, 9, -4, 46], [19, -10, 14.5, 6, -4, 10.6, -8, 42], [21.6, -.2, 12.6, 3.2, -3, 10.6, -9, 42], [24, -3, 13.4, 8, -7, 7, -4, 46]], 'mix')],
  [24, K([[24, -13, 2.6, 9.5, -5, 1, 0, 46], [27, -6, 2, .2, 4, 1.1, 0, 52], [30, 3, 2.3, 0, 11, 1.6, 0, 52]], 'mix')],
  [30, K([[30, 0, 16, 23, 5, 2.5, 0, 44], [36, 4, 21, 27, 8, 3.5, 0, 42]], 'mix')],
  [36, K([[36, 24, 6.5, 14, 15, 5, 0, 42], [39, 21, 5.5, 9.5, 15, 5, 0, 48]], 'mix')],
  [39, K([[39, 15, 14.5, 12, 6, 11.4, -5, 46], [44, 4.5, 14.5, 8.5, 1.5, 11.4, -8, 50]], 'mix')],
  [44, K([[44, -2, 12.5, 10, -10, 9, -2, 44], [48, -16.5, 8.4, 9, -13, 6, 0, 40], [52, -20.5, 6.4, 6.4, -13, 6, 0, 38]], 'mix')],
  [52, K([[52, -26, 13, 23, -4, 5, -2, 44], [58, -10, 17, 27, 2, 4, 0, 44]], 'mix')],
  [58, K([[58, 19, 4.2, 9.5, 9, 3.6, 0, 42], [61.5, 16, 6.4, 12.5, 12, 4.5, 0, 44], [64, 23, 7.4, 13.5, 15, 4.8, 0, 46]], 'mix')],
  [64, K([[64, 11, 7.4, 7.5, 20, 3.5, 0, 56], [66, 22, 4.6, 6.4, 31, 1, 0, 58], [68, 27, 6.5, 12, 35, 1, 0, 50]], 'mix')],
  [68, K([[68, 23, 10.5, 23, 35, 1.5, 0, 44], [73, 30, 12.5, 25, 37, 4, -3, 44]], 'mix')],
  [73, K([[73, 41, 2.8, 9, 38, 9, -4, 58], [76, 24, 31, 48, 4, 14, -6, 50], [80, 2, 35, 84, 6, 10, -4, 44]], 'mix')],
  [80, K([[80, 40, 4.5, 30, 60, 11, 0, 50], [84, 34, 7.5, 42, 60, 16, 0, 52]], 'mix')],
  [84, K([[84, 8, 27, 98, 11, 8, 0, 42], [90, 8, 31, 114, 11, 9, 0, 40]], 'mix')],
];
function cr(p0, p1, p2, p3, u) { const u2 = u * u, u3 = u2 * u; return .5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); }
const _tA = V(), _tB = V();
function storyCam(N) {
  let sh = SHOTS[0][1]; for (const [n0, s] of SHOTS) if (N >= n0) sh = s;
  if (sh.type === 'keys') {
    const k = sh.keys; let i = 0; while (i < k.length - 2 && N > k[i + 1][0]) i++;
    const a = k[Math.max(0, i - 1)], b = k[i], c = k[Math.min(k.length - 1, i + 1)], d = k[Math.min(k.length - 1, i + 2)];
    const u = k.length === 1 ? 0 : EASE[sh.ease](seg(N, b[0], c[0]));
    const v = j => cr(a[j], b[j], c[j], d[j], u);
    return { p: V(v(1), v(2), v(3)), t: V(v(4), v(5), v(6)), fov: v(7) };
  }
  if (sh.type === 'orbit') {
    const u = EASE[sh.ease](seg(N, sh.n0, sh.n1)), an = lerp(sh.a0, sh.a1, u);
    return { p: sh.c.clone().add(V(Math.cos(an) * sh.r, sh.y + Math.sin(u * Math.PI) * .8, Math.sin(an) * sh.r)), t: sh.c.clone(), fov: sh.fov };
  }
  // follow：相機在光頭後方 back 公尺、上方 up 公尺、側移 side，看向前方 ahead 公尺
  const L = sh.cv.getLength(), u = clamp(sh.prog(N));
  const pc = sh.cv.getPointAt(clamp(u - sh.back / L)), pa = sh.cv.getPointAt(clamp(u + sh.ahead / L));
  const tan = sh.cv.getTangentAt(clamp(u - sh.back / L)); const sideV = _tA.crossVectors(tan, Yup).normalize();
  return { p: pc.add(V(0, sh.up, 0)).add(sideV.multiplyScalar(sh.side)), t: pa, fov: sh.fov };
}
const Yup = V(0, 1, 0);

// ===== UI =====
const $ = id => document.getElementById(id);
const UI = { stepNo: $('stepNo'), stepName: $('stepName'), bar: $('bar'), tcv: $('tcv'), end: $('endcard'), credit: $('credit'), cap: $('cap'), hn: null };
const S = { T: 0, A: 0, playing: false, cam: 'story', blend: 1, from: null, hover: null, sound: true, rip: -99, mouse: V(0, -99, 0), started: REC, pkt: -99 };
const camCur = { p: V(), t: V(), fov: 44 };
let capIdx = -2;
// 低頻包絡取約 0.4 秒平均：畫面隨音樂「呼吸」，不跟每一下大鼓閃
const envAt = t => { const E = window.AUDIO_ENV; if (!E) return [0, 0, 0]; const i = Math.max(0, Math.floor(t * E.fps)); let l = 0, n = 0; for (let k = Math.max(0, i - 10); k <= i + 2; k++) { l += E.lo[k] || 0; n++; } return [E.rms[i] || 0, l / n, E.on[i] || 0]; };
const C = c => new THREE.Color(c);

function update(T, A, dt) {
  const N = toN(T);
  const [rms, lo, on] = envAt(T);
  const beat = lo;
  // 兩個 drop 段落裡，大鼓帶動鏡頭、光軌、網格一起脈動
  const kick = on, dropF = clamp(win(N, 36, 52, .3) + win(N, 64, 80, .3)), pk = 0;
  U.time.value = A; U.beat.value = beat * .6 + pk * .9; U.lo.value = lo;

  // 關鍵拍點
  const NO = 37.0, YES = 64.0, IGN = 80.0;
  const flash = .3 * decay(N, 36, 6) + .38 * decay(N, NO, 5) + .28 * decay(N, YES, 4) + .25 * decay(N, 76.2, 5) + .55 * decay(N, IGN, 3.5) + .12 * decay(N, 19.8, 6) + .12 * decay(N, 54.8, 6);
  fin.uniforms.uFlashC.value.copy(N >= YES ? C(0xfff0d8) : N >= NO - .1 && N < 46 ? C(0xff6070) : C(0xd8f6ff));
  // 質量感：撞擊只給一次低頻後座力（往後退再回位），不做高頻抖動與閃光
  const bump = (t, k) => t < 0 ? 0 : t * k * Math.exp(1 - t * k);
  const IMP = [[13.2, .7, 6], [36, .9, 5], [NO, 1.4, 5], [50.2, 1.2, 5.5], [YES, 1.6, 4.5], [IGN, 2.2, 3.5], [81.5, .7, 7]];
  const recoil = IMP.reduce((m, [t0, a, k]) => m + a * bump(N - t0, k), 0);
  const shake = 0, punch = 0;
  fin.uniforms.uGlitch.value = 0;
  floorU.uGrid.value = .25 + .75 * sstep(seg(N, .2, 3));
  floorU.uScan.value = N > 64 && N < 70 ? lerp(18, 60, seg(N, 64, 69)) : N > 7 && N < 11 ? lerp(-40, 25, seg(N, 7, 11)) : -999;

  // INPUT
  rain.uAmt.value = sstep(seg(N, .3, 2.6)) * (N < 66 ? 1 : .6) * (1 + .6 * decay(N, 76.2, 2) + beat * .3);
  const fun = eout(seg(N, 1, 4));
  funnel.rings.forEach((r, i) => { const a = seg(fun * 7 - i, 0, 1); r.visible = a > 0; r.scale.setScalar(lerp(1.3, 1, a)); r.material.opacity = a * (.7 + .3 * beat + 1.4 * decay(N, 76.2, 2.5)); });
  funnel.ribs.forEach((r, i) => { r.visible = fun > .2; r.material.opacity = fun * .35 * (1 + 2 * decay(N, 76.2, 2.5)); });
  funnel.g.rotation.y = A * .08;
  funnelGlow.set(fun * (.6 + beat * .4) + 1.5 * decay(N, 76.2, 2.5));
  setO(labIn, win(N, 2.2, 11.6, .5) + (N > 82 ? .8 : 0) * seg(N, 82, 83));
  labInSub.forEach((l, i) => setO(l, win(N, 2.8 + i * .35, 11.4, .4)));
  riverWall.set(eio(seg(N, 4.2, 7.6)), .9 + beat * .4);
  riverFlow.material.uniforms.uHead.value = eio(seg(N, 4.4, 8.4)); riverFlow.material.uniforms.uAmt.value = seg(N, 4.4, 5) * 1.0;

  // 結界
  cubeEdges.forEach((e, i) => { const t0 = 7 + i * .25; e.set(eio(seg(N, t0, t0 + .7)), (1 + beat * .3 + pk * 1.1) * (1 + 1.5 * decay(N, 65.2, 3) + .8 * decay(N, 78, 3)) * (N >= YES ? lerp(1, .6, seg(N, 66, 70)) : 1)); });
  cornerGlows.forEach((g, i) => g.set(seg(N, 7.6 + i * .3, 8.4 + i * .3) * (.5 + beat * .4 + 1.5 * decay(N, 65.2, 3))));
  holoMat.uniforms.uA.value = sstep(seg(N, 9.5, 11.5)) * (1 + beat * .5);
  holoMat.uniforms.uFlash.value = decay(N, NO, 4) + decay(N, YES, 3);
  holoMat.uniforms.uFC.value.set(N >= YES ? GOLD : RED);
  setO(labHarness, win(N, 9.6, 14, .5) + (N > 84 ? seg(N, 84.5, 85.5) * .9 : 0));

  // 假設核心
  // 碎片：飛來懸停 → 逐片加速撞回（四次方緩入）→ 卡入時小幅回彈；散開時指數爆出（唰）、零重力漂浮
  const B1 = 13.2, B2 = 50.2, EX = 46.4;
  const asm = N < 11.4 ? 0 : 1;
  const second = N >= 49.4;
  const snapK = t => t < 0 ? 0 : -.32 * Math.exp(-t * 13) * Math.sin(t * 46);
  const shardR = (sh, n) => {
    const far = (7 + sh.h * 5);
    if (n < EX) {
      const land = 11.85 + sh.ord * 1.3, u = seg(n, land - .5, land);
      const hang = far + 22 * (1 - eout(seg(n, 11.4, 11.85)));
      return n < land ? lerp(hang, 0, Math.pow(u, 4)) : snapK(n - land);
    }
    const land = 48.85 + sh.ord * 1.3, u = seg(n, land - .45, land);
    const blast = (5 + sh.h * 5) * (1 - Math.exp(-(n - EX) * 9)) + Math.max(0, Math.min(n, land - .45) - EX) * .35;
    return n < land ? lerp(blast, 0, Math.pow(u, 4)) : snapK(n - land);
  };
  const shardSpin = (sh, n) => {
    if (n < EX) { const land = 11.85 + sh.ord * 1.3; return n < land ? (1 - Math.pow(seg(n, land - .5, land), 2)) * (3 + sh.h * 4) + (land - n) * .4 : 0; }
    const land = 48.85 + sh.ord * 1.3; return n < land ? (1 - Math.pow(seg(n, land - .45, land), 2)) * ((sh.h - .5) * 9 * (1 - Math.exp(-(n - EX) * 4)) + (n - EX) * .5 * (sh.h - .5)) : 0;
  };
  const tp = core.trails.geometry.attributes.position.array, prev = V(), cur = V();
  core.shards.forEach((sh, i) => {
    const r = shardR(sh, N), r0 = shardR(sh, N - .05);
    sh.pivot.position.copy(sh.cen).multiplyScalar(1 + r / 2.2 * .9);
    sh.pivot.quaternion.setFromAxisAngle(sh.ax, shardSpin(sh, N));
    sh.pivot.visible = asm > 0;
    cur.copy(sh.pivot.position).applyMatrix4(core.grp.matrixWorld); prev.copy(sh.cen).multiplyScalar(1 + r0 / 2.2 * .9).applyMatrix4(core.grp.matrixWorld);
    const tail = cur.clone().lerp(prev, 2.2);
    tp.set([cur.x, cur.y, cur.z, tail.x, tail.y, tail.z], i * 6);
  });
  core.trails.geometry.attributes.position.needsUpdate = true; core.trails.visible = asm > 0 && ((N > 11.4 && N < B1 + .1) || (N > EX && N < B2 + .1));
  const boom = t => t < 0 ? 0 : -.13 * Math.exp(-t * 6) * Math.cos(t * 2 * Math.PI * 2.2);
  const bt = N >= B2 ? N - B2 : N - B1;
  dustBurst.material.uniforms.uAmt.value = (N > B1 && N < B1 + 3) || (N > B2 && N < B2 + 3) ? 1 : 0; dustBurst.material.uniforms.uProg.value = Math.max(0, bt);
  const exp1 = win(N, EX, B2, .3);
  core.grp.rotation.set(A * .21, A * .34 + (second ? .6 : 0), 0);
  core.grp.scale.setScalar(((N >= B2 ? 1.12 : 1) + boom(N - B1) * (N < B2 ? 1 : 0) + boom(N - B2)));
  const coreC = second ? C(0x9ff4ff) : C(CY);
  core.seamMat.color.copy(coreC).multiplyScalar(2.2 + 1.6 * decay(N, B1, 2.5) + 2 * decay(N, B2, 2.5) + beat * .5);
  core.chrome.emissiveIntensity = .02 + .25 * decay(N, 50.2, 2);
  core.inner.set(asm * (.55 + beat * .2) + .9 * decay(N, B1, 2.5) + 1.1 * decay(N, B2, 2.2) + exp1 * .5);
  core.rings.forEach((r, i) => { r.visible = asm > .5; r.rotation.set(1.2 + i * .5 + A * (.3 + i * .2), A * (.2 - i * .4), 0); r.material.opacity = asm; });
  coreLight.intensity = asm * (40 + beat * 10) + decay(N, B2, 2) * 70 + decay(N, B1, 2) * 50;
  setO(labH, (win(N, 12.2, 24, .5) + win(N, 44.5, 53, .5)) * seg(camera.position.distanceTo(P.H), 9, 12) + (N > 84 ? seg(N, 84.5, 85.5) * .9 : 0));
  if (!UI.hn) UI.hn = $('hn'); if (UI.hn) { const t = second ? 'H(2)' : 'H(1)'; if (UI.hn.textContent !== t) UI.hn.textContent = t; }

  // 金絲雀（兩輪）
  const runs = [[15.6, 17.6, 19.6, 19.8], [52.2, 53.3, 54.5, 54.8]];
  let pr = -1, scan = -1, ok = 0, mA_ = 0, ctrack = 0, ctail = 0;
  for (const [l0, l1, s1, okT] of runs) {
    if (N >= l0 - .1 && N < okT + 3) { pr = eio(seg(N, l0, l1)); scan = N > l1 && N < s1 ? seg(N, l1, s1) : -1; ok = Math.max(ok, seg(N, okT, okT + .3)); ctrack = 1; ctail = seg(N, okT + .8, okT + 2.4); }
    mA_ = Math.max(mA_, win(N, l0 - .6, okT + 4.2, .6));
  }
  canaryTrack.set(pr < 0 ? 0 : pr, ctrack * 1.1, ctail);
  canaryTrail.material.uniforms.uHead.value = pr < 0 ? 0 : pr; canaryTrail.material.uniforms.uTail.value = Math.max(ctail, pr - .35); canaryTrail.material.uniforms.uAmt.value = ctrack * (1 - ctail);
  const pp = cvCanary.getPointAt(clamp(pr)); probe.position.copy(pp);
  probe.visible = pr >= 0 && ctail < .99; probeGlow.position.copy(pp); probeGlow.set(probe.visible ? (1 + .5 * (scan >= 0 ? 1 : 0)) * (1 - ctail) : 0);
  market.u.uA.value = mA_ * (1 + beat * .3); market.grp.visible = mA_ > .002; market.u.uScan.value = scan >= 0 ? 1 - scan : -1; market.u.uOk.value = ok; market.u.uBars.value = scan >= 0 ? scan : ok;
  scanCone.u.uI.value = scan >= 0 ? win(scan, 0, 1, .15) : 0; scanCone.m.visible = scanCone.u.uI.value > 0;
  okRing.set(ok > 0 && ok < 1 || (N > 19.8 && N < 21.4) || (N > 54.8 && N < 56.4) ? 1 : 0, seg(N, N < 40 ? 19.8 : 54.8, (N < 40 ? 19.8 : 54.8) + 1.6));
  setO(labCan, mA_); setO(labOk, ok * mA_);
  const ng = win(N, 20.4, 23.8, .5); noGo.set(eio(seg(N, 20.4, 21.6)), ng * .5); setO(labNoGo, ng * .8);

  // A/B 測試（兩輪）
  const ab1 = [22, 24.3, 34.5, 36], ab2 = [55, 55.6, 61.8, 63.6];
  const abRun = (r) => ({ split: eio(seg(N, r[0], r[0] + 2.3)), tr: eio(seg(N, r[1], r[1] + 2.2)) * AB_END + eio(seg(N, r[2], r[3])) * (1 - AB_END) });
  const r1 = abRun(ab1), r2 = abRun(ab2);
  const inR2 = N >= 52;
  const R = inR2 ? r2 : r1;
  const drain = inR2 ? seg(N, 64.4, 66) : seg(N, 37.2, 39.6);
  const abI = 1 + beat * .4 + pk * .9;
  toSplit.set(R.split, abI, drain * R.split, pulses(N, [55, 55.25], .9));
  toSplitFlow.material.uniforms.uHead.value = R.split; toSplitFlow.material.uniforms.uTail.value = drain * R.split; toSplitFlow.material.uniforms.uAmt.value = R.split > 0 ? 1 : 0;
  const trackDim = N > 39.6 && N < 55.6 ? .35 : 1;
  for (const [tr, fl] of [[trA, flA], [trB, flB]]) {
    tr.set(Math.max(R.tr, N > 39.6 && N < 55.6 ? 1 : 0), abI * trackDim, 0);
    fl.material.uniforms.uHead.value = R.tr; fl.material.uniforms.uTail.value = drain * R.tr; fl.material.uniforms.uAmt.value = R.tr > .01 ? 1 - drain : 0;
  }
  wallA.set(R.tr / AB_END, .8 + beat * .4); wallB.set(R.tr / AB_END, .8 + beat * .4);
  // 成效柱：第一輪 A 54%、B 62%（未達 80%）；第二輪 A 58%、B 86%
  const jit = k => .02 * Math.sin(A * 7 + k) * (1 - seg(N, inR2 ? 61 : 33.5, inR2 ? 62 : 34.5));
  const f1 = eout(seg(N, 27, 34)), f2 = eout(seg(N, 56.4, 61.6));
  const reset = 1 - seg(N, 51.6, 52.6);
  const va = inR2 ? .58 * f2 + jit(1) * f2 : .54 * f1 * (N > 51.6 ? reset : 1) + jit(1) * f1;
  const vb = inR2 ? .86 * f2 + jit(2) * f2 : .62 * f1 * (N > 51.6 ? reset : 1) + jit(2) * f1;
  const mvis = win(N, 25.5, 70, .8) * (N > 66 ? lerp(1, .5, seg(N, 66, 70)) : 1) + (N > 84 ? seg(N, 84.5, 85.5) * .5 : 0);
  mA.uFill.value = va; mB.uFill.value = vb; mA.uA.value = mB.uA.value = mvis;
  if (vaEl) vaEl.textContent = Math.round(va * 100); if (vbEl) vbEl.textContent = Math.round(vb * 100);
  setO(labMA, mvis * seg(N, 26.6, 27.2)); setO(labMB, mvis * seg(N, 26.6, 27.2));
  const tg = win(N, 29.4, 70, .6); target.set(eio(seg(N, 29.4, 30.6)), tg * 1.2); setO(labTarget, tg);
  setO(labA, win(N, 24.6, 35.5, .4) + win(N, 55.6, 63.5, .4)); setO(labB, win(N, 24.6, 35.5, .4) + win(N, 55.6, 63.5, .4));
  setO(labAB, win(N, 24.2, 29, .5) + (N > 84 ? seg(N, 84.5, 85.5) * .9 : 0));

  // 閘門
  const gateC = N >= YES ? C(0xfff1d6).lerp(C(GOLD), seg(N, 66, 70)) : (N >= NO && N < 44 ? C(RED) : C(CY));
  gate.halves.forEach((h, i) => { h.mat.color.copy(gateC).multiplyScalar(2.2 + 2.5 * decay(N, NO, 3) + 2 * decay(N, YES, 2.5) + beat * .8); h.h.position.y = (i ? -1 : 1) * 2.6 * eout(seg(N, YES + .1, YES + 1.1)); });
  gate.grp.rotation.y = A * .4 + 6 * eio(seg(N, 35.6, 37)) + 6 * eio(seg(N, 62.8, 64));
  gate.grp.visible = N > 5;
  const gv = sstep(seg(N, 9, 11)); gate.grp.scale.setScalar(Math.max(.001, gv));
  gate.glow.material.uniforms.uColor.value.copy(gateC).multiplyScalar(1.2); gate.glow.set(gv * (.4 + beat * .3) + 1.2 * decay(N, NO, 3) + .5 * decay(N, YES, 2.5));
  gate.shock.material.uniforms.uColor.value.copy(N >= YES ? C(GOLD) : C(RED)).multiplyScalar(1.6);
  const shP = N >= YES ? seg(N, YES, YES + 1.4) : seg(N, NO, NO + 1.4); gate.shock.set((N >= NO && N < NO + 1.4) || (N >= YES && N < YES + 1.4) ? 1 : 0, shP);
  gateLight.color.copy(gateC); gateLight.intensity = gv * 30 + 120 * decay(N, NO, 3) + 150 * decay(N, YES, 2.5);
  setO(labGate, win(N, 33.6, 36.2, .4) + win(N, 62.4, 64.2, .4) + (N > 84 ? seg(N, 84.5, 85.5) * .9 : 0));
  setO(labNo, win(N, NO, 44, .3)); setO(labYes, win(N, YES, 69, .3));

  // Loop 迭代
  const lp = sstep(seg(N, 8.5, 11)) * .25 + win(N, 38.6, 48, .8) * .9;
  loopRings.r1.material.opacity = loopRings.r2.material.opacity = Math.min(1, lp * (1 + beat * .5));
  loopRings.grp.rotation.z = A * .2;
  const loopAmt = win(N, 39.4, 46.2, .6);
  const ph = 2.2 * (N - 39.4) + 1.4 * Math.pow(Math.max(0, N - 39.4), 2) * .35;
  loopPts.material.uniforms.uPhase.value = ph; loopPts.material.uniforms.uAmt.value = loopAmt * (1 + beat * .5);
  loopGlow.set(loopAmt * (.6 + beat * .5));
  noTrack.set(eio(seg(N, 37.6, 39.4)), win(N, 37.6, 47, .6) * 1.1, 0); noFlow.material.uniforms.uHead.value = eio(seg(N, 37.6, 39.4)); noFlow.material.uniforms.uTail.value = seg(N, 40.6, 42.4); noFlow.material.uniforms.uAmt.value = win(N, 37.6, 42.6, .3);
  backTrack.set(eio(seg(N, 43.8, 46.4)), win(N, 43.8, 51, .6) * 1.1, 0); backFlow.material.uniforms.uHead.value = eio(seg(N, 43.8, 46.4)); backFlow.material.uniforms.uTail.value = seg(N, 47.2, 49); backFlow.material.uniforms.uAmt.value = win(N, 43.8, 49.2, .3);
  setO(labLoop, win(N, 39, 47.6, .5) + (N > 84 ? seg(N, 84.5, 85.5) * .9 : 0)); setO(labRevise, win(N, 44.6, 50, .4));

  // 是 → 城市 → 回饋
  const yh = eio(seg(N, YES + .2, YES + 2.2));
  yesTrack.set(yh, (N >= YES ? .9 : 0) * (1 + beat * .3 + pk * .8)); yesFlow.material.uniforms.uHead.value = yh; yesFlow.material.uniforms.uAmt.value = N >= YES ? 1 : 0;
  pilot.visible = N > YES + .2 && N < YES + 2.4; const pp2 = cvYes.getPointAt(clamp(yh)); pilot.position.copy(pp2); pilotGlow.position.copy(pp2); pilotGlow.set(pilot.visible ? 1.6 : 0);
  exitRing.set(N >= 65 && N < 66.6 ? 1 : 0, seg(N, 65, 66.6));
  city.u.uBase.value = sstep(seg(N, 9, 12));
  city.u.uLit.value = N < 66 ? 0 : lerp(0, 6.5, eout(seg(N, 66, 68.4))) + lerp(0, 6, eout(seg(N, 75.8, 79)));
  city.u.uAll.value = eout(seg(N, 80.6, 84)) * 1.6;
  setO(labCity, win(N, 66.4, 79, .5) + (N > 84 ? seg(N, 84.5, 85.5) * .9 : 0)); setO(labSmall, win(N, 67.2, 72, .4));
  userPts.material.uniforms.uAmt.value = win(N, 69.6, 80, .8); userPts.material.uniforms.uProg.value = 2 + 6 * seg(N, 69.6, 79);
  const cvA_ = win(N, 69.4, 81, .6); curves.uA.value = cvA_; curves.mesh.visible = cvA_ > .002; curves.uDraw.value = eio(seg(N, 70, 72.6)); curves.uConv.value = eio(seg(N, 73.2, 77.4)); setO(labCurves, cvA_);
  const fh = eio(seg(N, 72.6, 76.2));
  feed.set(fh, (N > 72.6 ? 1.1 : 0) * (1 + beat * .4) * (N > 84 ? .8 : 1) + 1.2 * decay(N, 78, 3), 0, pulses(N, [76.4, 78, 79, 80], 1.6));
  feedFlow.material.uniforms.uHead.value = fh; feedFlow.material.uniforms.uAmt.value = N > 72.6 ? 1 : 0;
  setO(labFeed, win(N, 74, 81, .5) + (N > 84 ? seg(N, 84.5, 85.5) * .9 : 0));

  // 第二輪：其他路徑在閉環同步點亮時一起閃
  const sync = 1.2 * decay(N, 78, 3);
  river.set(eio(seg(N, 4.4, 8.4)), 1 + beat * .4 + sync);

  // OUTPUT
  const oh = eio(seg(N, 79.4, 80.4));
  outWall.set(oh, (1 + beat * .4) * (oh > 0 ? 1 : 0)); outTrack.set(oh, oh > 0 ? 1.2 : 0);
  const rise = eout(seg(N, IGN + .1, IGN + 1.5));
  outGate.parts.forEach(m => { m.visible = rise > 0; m.scale.y = Math.max(.001, rise * 13); m.position.y = rise * 13 / 2; });
  outGate.lintel.visible = rise > .9; outGate.lintel.position.y = 13;
  outGate.beam.set(eout(seg(N, IGN, IGN + .9)), (N >= IGN ? .9 : 0) * (1 + beat * .3 + 1.2 * decay(N, IGN, 2)));
  outGate.glow.set((N >= IGN ? 1 : 0) * (.5 + beat * .3 + 1.2 * decay(N, IGN, 2)));
  outGate.ring.set(N >= IGN && N < IGN + 2.4 ? 1 : 0, seg(N, IGN, IGN + 2.4));
  setO(labOut, seg(N, IGN + .6, IGN + 1.4)); setO(labOutSub, seg(N, IGN + 1, IGN + 1.8));

  // 地面衝擊波：drop、否、是、H(2) 重組
  const gHits = [[36, CY], [NO, RED], [YES, GOLD]]; let gh = null; for (const h of gHits) if (N >= h[0] && N < h[0] + 1.8) gh = h;
  gateFloorRing.material.uniforms.uColor.value.set(gh ? gh[1] : CY).multiplyScalar(2.6); gateFloorRing.set(gh ? 1 : 0, gh ? eout(seg(N, gh[0], gh[0] + 1.8)) : 0);
  coreFloorRing.set(N >= 50.2 && N < 51.6 ? 1 : 0, eout(seg(N, 50.2, 51.6)));

  // 地板光池
  pool(0, P.IN, 9, C(WHITE), fun * .6 + 1.5 * decay(N, 76.2, 2));
  pool(1, P.H, 6, coreC, asm * (.7 + beat * .5) + 1.5 * decay(N, 50.2, 2));
  pool(2, V(2, 0, -3.4), 7, C(CY), R.tr * .7);
  pool(3, V(2, 0, 3.4), 7, C(OR), R.tr * .7);
  pool(4, P.GATE, 7, gateC, gv * .5 + 1.4 * decay(N, NO, 3) + 1.2 * decay(N, YES, 2.5));
  pool(5, P.LAND, 6 + 8 * seg(N, 75.8, 84), C(GOLD), (N > YES + 1.5 ? 1 : 0) * (.8 + beat * .4));
  pool(6, P.OUT, 14, C(GOLD), (N >= IGN ? .8 : 0) + 1.5 * decay(N, IGN, 2));
  pool(7, S.mouse.y > -50 ? S.mouse : V(0, 0, -999), 4, C(CY), REC ? 0 : .5);

  // 封包（雙擊）
  const pkt = A - S.pkt, pd = pkt * 18;
  if (pkt >= 0 && pd < packetRoute.len + 30) {
    const arr = packet.g.attributes.position.array;
    for (let i = 0; i < PKT_N; i++) { const p = routeAt(pd - i * .35); arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; }
    packet.g.attributes.position.needsUpdate = true; packet.u.uAmt.value = 1 - seg(pd, packetRoute.len, packetRoute.len + 20);
  } else packet.u.uAmt.value = 0;
  packet.p.visible = packet.u.uAmt.value > 0;

  // 字幕
  const showCap = REC || S.playing;
  const ci = showCap ? CAPS.findIndex(c => N >= c[0] && N < c[1]) : -1;
  if (ci !== capIdx) {
    capIdx = ci;
    if (ci >= 0) { const c = CAPS[ci]; UI.cap.className = c[3] || ''; UI.cap.innerHTML = `<div class="zh">${[...c[2]].map(ch => `<span>${ch}</span>`).join('')}</div><div class="en">${c[4].split(' ').map(w => `<span>${w}</span>`).join(' ')}</div>`; }
    else UI.cap.innerHTML = '';
  }
  if (ci >= 0) {
    const c = CAPS[ci], out = clamp((c[1] - N) / .3);
    const ws = UI.cap.querySelectorAll('.en span'), rate = Math.max(2.2, ws.length / Math.max(.6, (c[1] - c[0]) * .55));
    ws.forEach((s, i) => { const a = clamp(((N - c[0]) * rate - i) * 1.6); s.style.opacity = (a * out).toFixed(3); s.style.transform = `translateY(${((1 - a) * 10).toFixed(1)}px)`; s.style.filter = a < 1 ? `blur(${((1 - a) * 5).toFixed(1)}px)` : 'none'; });
    UI.cap.querySelectorAll('.zh span').forEach((s, i) => { const a = clamp((N - c[0]) * 9 - i * .45); s.style.opacity = (a * out).toFixed(3); s.style.transform = `translateY(${((1 - a) * 12).toFixed(1)}px)`; s.style.filter = a < 1 ? `blur(${((1 - a) * 6).toFixed(1)}px)` : 'none'; });
  }

  // HUD
  let si = 0; STEPS.forEach((s, i) => { if (N >= s[0]) si = i; });
  UI.stepNo.textContent = '0' + (si + 1); UI.stepName.textContent = STEPS[si][1];
  UI.bar.style.width = (clamp(T / DUR) * 100).toFixed(2) + '%';
  const mm = Math.floor(T / 60), ss = (T % 60).toFixed(1).padStart(4, '0');
  UI.tcv.textContent = `SIM RUN ${second ? '02' : '01'} · ${second ? 'H(2)' : 'H(1)'} · T+${String(mm).padStart(2, '0')}:${ss}`;
  const endA = (REC || S.playing) ? seg(N, 84.6, 86) : 0;
  UI.end.style.opacity = endA; UI.credit.style.opacity = (REC || S.playing) ? seg(N, 85.4, 86.6) * .9 : 0;
  labelR.domElement.style.opacity = 1 - endA * .88;

  // 互動卡片
  for (const k in CARDS) { const c = CARDS[k]; c.hv = lerp(c.hv, S.hover === k ? 1 : 0, REC ? 1 : clamp(dt * 8)); setO(c.o, c.hv); }

  // 滑鼠、漣漪
  floorU.uRip.value.set(S.ripX || 0, S.ripZ || 0, S.rip, 1);
  dust.material.uniforms.uAmt.value = .5 + seg(N, 0, 2) * .5;
  for (const p of pts) p.material.uniforms.uMouse.value.copy(S.mouse);
  mouseLight.position.copy(S.mouse).add(V(0, 1.5, 0)); mouseLight.intensity = REC ? 0 : 20;

  // 後製
  bloom.strength = .55 + beat * .08 + flash * .18;
  fin.uniforms.uTime.value = A; fin.uniforms.uFlash.value = 0; fin.uniforms.uCA.value = 1 + flash * .8;
  fin.uniforms.uStreak.value = 1;
  const fadeOut = (REC || S.playing) ? seg(T, DUR - 1.6, DUR) : 0;
  fin.uniforms.uFade.value = Math.max(1 - seg(T, 0, .8), fadeOut);

  // 鏡頭
  const sc = storyCam(N);
  const hand = V(Math.sin(A * .7) * .05, Math.sin(A * .53 + 1) * .04, 0);
  // 後座力：沿視線往後退、略往下沉，一次就回穩
  const back = sc.p.clone().sub(sc.t).normalize().multiplyScalar(recoil).add(V(0, -.22 * recoil, 0));
  // 鏡頭移動越快，放射模糊越明顯（速度感，不是閃光）
  const sp = storyCam(N + .04).p.distanceTo(sc.p) / .04;
  fin.uniforms.uZoom.value = S.cam === 'story' ? clamp((sp - 6) / 60) * .22 : 0;
  if (S.cam === 'story') {
    if (S.blend < 1 && S.from) {
      S.blend = Math.min(1, S.blend + dt / 1.4); const e = eio(S.blend);
      camCur.p.copy(S.from.p).lerp(sc.p, e); camCur.t.copy(S.from.t).lerp(sc.t, e); camCur.fov = lerp(S.from.fov, sc.fov, e);
    } else { camCur.p.copy(sc.p); camCur.t.copy(sc.t); camCur.fov = sc.fov; }
    camera.position.copy(camCur.p).add(hand).add(back);
    camera.lookAt(camCur.t);
    if (camera.fov !== camCur.fov) { camera.fov = camCur.fov; camera.updateProjectionMatrix(); }
    controls.target.copy(camCur.t);
  } else { controls.update(); camera.position.add(back.multiplyScalar(.5)); }
  const scale = H * PR / (2 * Math.tan(camera.fov * Math.PI / 360));
  for (const p of pts) p.material.uniforms.uScale.value = scale;
  packet.u.uScale.value = scale;
}

function draw() { composer.render(); labelR.render(scene, camera); }

// ===== 互動 =====
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .07; controls.minDistance = 4; controls.maxDistance = 170;
controls.maxPolarAngle = Math.PI * .495; controls.target.set(11, 8, 0);
const audio = new Audio('music/soundtrack.mp3'); audio.preload = 'auto';
const SFX = {}; for (const n of ['chime', 'energy_pulse', 'lock_on', 'whoosh']) { SFX[n] = new Audio(`music/sfx/${n}.mp3`); SFX[n].preload = 'auto'; }
function sfx(n, vol = .5, rate = 1, delay = 0) {
  if (!S.sound || REC) return;
  setTimeout(() => { const a = SFX[n].cloneNode(); a.volume = vol; a.preservesPitch = false; a.playbackRate = rate; a.play().catch(() => { }); }, delay * 1000);
}

if (REC) {
  window.render = t => { S.T = t; update(t, t, 1 / 30); draw(); };
  window.DURATION = DUR;
  window.__dbg = { bloom, fin, scene, camera, renderer };
  update(toT(86), toT(86), 1); draw(); update(toT(50), toT(50), 1); draw();
  window.__ready = true;
} else {
  const stepsEl = $('steps');
  STEPS.forEach(([n, name], i) => { const b = document.createElement('button'); b.innerHTML = `${i + 1}<span> ${name}</span>`; b.onclick = () => jump(toT(n)); stepsEl.appendChild(b); });
  const playBtn = $('play'), scrub = $('scrub'), dirBtn = $('director'), intro = $('intro');
  scrub.max = DUR;
  function toDirector() { if (S.cam !== 'story') { S.from = { p: camera.position.clone(), t: controls.target.clone(), fov: camera.fov }; S.blend = 0; S.cam = 'story'; } dirBtn.style.display = 'none'; }
  function play(from) {
    if (from !== undefined) S.T = from; if (S.T >= DUR - .1) S.T = 0;
    S.playing = true; try { audio.currentTime = S.T; } catch (e) { } if (S.sound) audio.play().catch(() => { }); toDirector();
  }
  function pause() { S.playing = false; audio.pause(); }
  function jump(t) { play(t); }
  function hideIntro() { intro.style.opacity = 0; setTimeout(() => intro.style.display = 'none', 800); S.started = true; }
  $('go').onclick = () => { hideIntro(); play(0); };
  $('explore').onclick = () => { hideIntro(); };
  playBtn.onclick = () => S.playing ? pause() : play();
  const stepIdx = (off) => { const N = toN(S.T); let si = 0; STEPS.forEach((s, i) => { if (N >= s[0] + off) si = i; }); return si; };
  $('prev').onclick = () => jump(toT(STEPS[Math.max(0, stepIdx(.5) - 1)][0]));
  $('next').onclick = () => jump(toT(STEPS[Math.min(STEPS.length - 1, stepIdx(0) + 1)][0]));
  $('snd').onclick = e => { S.sound = !S.sound; e.target.textContent = S.sound ? '🔊' : '🔇'; if (!S.sound) audio.pause(); else if (S.playing) { try { audio.currentTime = S.T; } catch (er) { } audio.play().catch(() => { }); } };
  scrub.oninput = () => { S.T = +scrub.value; if (S.playing) try { audio.currentTime = S.T; } catch (e) { } };
  dirBtn.onclick = toDirector;
  controls.addEventListener('start', () => { if (S.cam === 'story') { S.cam = 'free'; controls.target.copy(camCur.t); dirBtn.style.display = 'block'; } });
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); S.playing ? pause() : play(); } if (e.code === 'ArrowRight') $('next').click(); if (e.code === 'ArrowLeft') $('prev').click(); });

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), yPlane = new THREE.Plane(V(0, 1, 0), 0);
  let downAt = null;
  const el = renderer.domElement;
  el.addEventListener('pointermove', e => {
    ndc.set(e.clientX / W * 2 - 1, -(e.clientY / H) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(HITS)[0]; const k = hit ? hit.object.userData.k : null;
    if (k && k !== S.hover) sfx('chime', .12, 1.6);
    S.hover = k; el.style.cursor = hit ? 'pointer' : 'grab';
    ray.ray.intersectPlane(yPlane, S.mouse) || S.mouse.set(0, -99, 0);
  });
  el.addEventListener('pointerleave', () => { S.hover = null; S.mouse.set(0, -99, 0); });
  el.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
  el.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    ndc.set(e.clientX / W * 2 - 1, -(e.clientY / H) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(HITS)[0];
    if (hit) { if (!S.started) hideIntro(); sfx('lock_on', .45); jump(toT(hit.object.userData.n)); return; }
    const p = V(); if (ray.ray.intersectPlane(yPlane, p)) { S.ripX = p.x; S.ripZ = p.z; S.rip = S.A; sfx('chime', .2, .6 + Math.random() * .5); }
  });
  el.addEventListener('dblclick', () => { S.pkt = S.A; sfx('energy_pulse', .55, 1); sfx('whoosh', .4, 1.1, 1.2); sfx('energy_pulse', .4, 1.25, 3.4); sfx('chime', .45, 1.26, 5.6); });

  addEventListener('resize', () => {
    W = innerWidth; H = innerHeight; camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H); composer.setSize(W, H); labelR.setSize(W, H); bloom.setSize(W, H); fin.uniforms.uRes.value.set(W, H);
  });

  // 一開始：完整閉環的全景，鏡頭自由
  S.T = toT(86.5); S.cam = 'free'; camera.position.set(8, 30, 110); camera.fov = 44; camera.updateProjectionMatrix();
  let last = performance.now(); const perf = { n: 0, t: 0 };
  function loop(now) {
    const dt = Math.min(.25, (now - last) / 1000); last = now; S.A += dt;
    perf.n++; perf.t += dt;
    if (perf.t > 2) { const fps = perf.n / perf.t; perf.n = 0; perf.t = 0;
      const want = fps < 42 ? Math.max(.75, PR - .25) : fps > 58 ? Math.min(PR_MAX, PR + .25) : PR;
      if (want !== PR) { PR = want; renderer.setPixelRatio(PR); composer.setPixelRatio(PR); composer.setSize(W, H); } }
    if (S.playing) {
      S.T += dt;
      if (S.sound && !audio.paused && audio.readyState >= 2) {
        const d = audio.currentTime - S.T;
        if (Math.abs(d) < .3) S.T += d * .1;
        else if (now - (S.seekAt || 0) > 1500) { S.seekAt = now; try { audio.currentTime = S.T; } catch (e) { } }
      }
      if (S.T >= DUR) { pause(); S.T = toT(86.5); }
    }
    playBtn.textContent = S.playing ? '❚❚ 暫停' : (S.T > 0 && toN(S.T) < 84 ? '▶ 繼續' : '▶ 開始模擬');
    if (document.activeElement !== scrub) scrub.value = S.T;
    const N = toN(S.T); let si = 0; STEPS.forEach((s, i) => { if (N >= s[0]) si = i; });
    [...stepsEl.children].forEach((b, i) => b.classList.toggle('on', i === si));
    update(S.T, S.A, dt); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
