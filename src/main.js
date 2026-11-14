// Sheer knit stretch toy — all geometry + shading procedural, live deformation.
import * as THREE from '../vendor/three.module.js';

const PI = Math.PI, TAU = Math.PI * 2;
const EXPOSURE = 0.55;
const sq = (x) => x * x;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
} catch (e) {
  document.getElementById('err').style.display = 'flex';
  throw e;
}
let DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, 16 / 9, 0.05, 10);
const CAM_BASE = new THREE.Vector3(0.05, 0.83, 1.32);
const CAM_TARGET = new THREE.Vector3(0.06, 0.672, 0.0);

// ---------------------------------------------------------------- leg model
// [y, rx, rz] radii table (meters), top to bottom
const RAD = [
  [1.06, 0.104, 0.106], [0.96, 0.099, 0.100], [0.86, 0.091, 0.093], [0.76, 0.081, 0.084],
  [0.67, 0.069, 0.072], [0.60, 0.057, 0.061], [0.545, 0.051, 0.056], [0.49, 0.048, 0.053],
  [0.42, 0.051, 0.057], [0.34, 0.051, 0.055], [0.24, 0.042, 0.044], [0.10, 0.030, 0.034], [0.0, 0.03, 0.034],
];
function catmull(y, idx) {
  const n = RAD.length;
  if (y >= RAD[0][0]) return RAD[0][idx];
  if (y <= RAD[n - 1][0]) return RAD[n - 1][idx];
  let i = 0; while (i < n - 2 && y < RAD[i + 1][0]) i++;
  const p0 = RAD[Math.max(i - 1, 0)][idx], p1 = RAD[i][idx], p2 = RAD[i + 1][idx], p3 = RAD[Math.min(i + 2, n - 1)][idx];
  const t = (RAD[i][0] - y) / (RAD[i][0] - RAD[i + 1][0]);
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const KNEE_Y = 0.545;
const LEG_L = { s: -1, H: [-0.086, 1.0, 0.0], K: [-0.104, KNEE_Y, 0.022], A: [-0.085, 0.06, -0.01] };
const LEG_R = { s: +1, H: [0.088, 1.0, 0.0], K: [0.050, KNEE_Y, 0.024], A: [0.062, 0.06, -0.01] };

function legCenter(leg, y, o) {
  const H = leg.H, K = leg.K, A = leg.A;
  const tu = (y - K[1]) / (H[1] - K[1]);
  const ux = K[0] + (H[0] - K[0]) * tu, uz = K[2] + (H[2] - K[2]) * tu;
  const tl = (y - A[1]) / (K[1] - A[1]);
  const lx = A[0] + (K[0] - A[0]) * tl, lz = A[2] + (K[2] - A[2]) * tl;
  const b = smooth(-0.08, 0.08, y - K[1]);
  o.x = lx + (ux - lx) * b; o.z = lz + (uz - lz) * b;
  return o;
}
const _c = { x: 0, z: 0 };
// phi = 0 is the leg's OUTER side, phi=+90° is the front (camera side) for both legs
function legSurface(leg, phi, y, off, out) {
  legCenter(leg, y, _c);
  const rx = catmull(y, 1), rz = catmull(y, 2);
  const a = leg.s > 0 ? phi : PI - phi;
  const ca = Math.cos(a), sa = Math.sin(a);
  const outer = Math.cos(phi);
  const k = 1 + 0.05 * Math.max(0, outer) * smooth(0.62, 0.98, y) - 0.04 * Math.max(0, -outer) * smooth(0.6, 0.95, y);
  const front = Math.max(0, sa), back = Math.max(0, -sa);
  let extra = 0.010 * Math.exp(-sq((y - (KNEE_Y + 0.008)) / 0.028)) * front ** 4   // kneecap
    + 0.006 * Math.exp(-sq((y - 0.625) / 0.05)) * front ** 2                         // quad above knee
    + 0.011 * Math.exp(-sq((y - 0.40) / 0.07)) * back ** 2                           // calf
    - 0.006 * Math.exp(-sq((y - (KNEE_Y - 0.02)) / 0.03)) * back ** 3;               // back of knee
  const r = (rx * k + extra + off), rz2 = (rz * k + extra + off);
  out.x = _c.x + r * ca; out.y = y; out.z = _c.z + rz2 * sa;
  return out;
}
const _p1 = { x: 0, y: 0, z: 0 }, _p2 = { x: 0, y: 0, z: 0 }, _p3 = { x: 0, y: 0, z: 0 }, _p4 = { x: 0, y: 0, z: 0 };
function legNormal(leg, phi, y, off, out) {
  const e = 1e-3;
  legSurface(leg, phi + e, y, off, _p1); legSurface(leg, phi - e, y, off, _p2);
  legSurface(leg, phi, y + e, off, _p3); legSurface(leg, phi, y - e, off, _p4);
  const ux = _p1.x - _p2.x, uy = _p1.y - _p2.y, uz = _p1.z - _p2.z;
  const vx = _p3.x - _p4.x, vy = _p3.y - _p4.y, vz = _p3.z - _p4.z;
  let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  // orient outward
  legCenter(leg, y, _c);
  legSurface(leg, phi, y, off, _p1);
  if (nx * (_p1.x - _c.x) + nz * (_p1.z - _c.z) < 0) { nx = -nx; ny = -ny; nz = -nz; }
  out.x = nx; out.y = ny; out.z = nz; return out;
}

function buildLeg(leg, nPhi, nY, y0, y1, off) {
  const cnt = (nPhi + 1) * (nY + 1);
  const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2);
  const p = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 };
  for (let j = 0; j <= nY; j++) {
    const y = y0 + (y1 - y0) * j / nY;
    for (let i = 0; i <= nPhi; i++) {
      const phi = -PI + TAU * i / nPhi;
      const k = j * (nPhi + 1) + i;
      legSurface(leg, phi, y, off, p); legNormal(leg, phi, y, off, n);
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
      uv[k * 2] = phi; uv[k * 2 + 1] = y;
    }
  }
  const idx = [];
  for (let j = 0; j < nY; j++) for (let i = 0; i < nPhi; i++) {
    const a = j * (nPhi + 1) + i, b = a + 1, c = a + nPhi + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  return g;
}
function fixWinding(g) {
  const ix = g.index.array, P = g.attributes.position.array, N = g.attributes.normal.array;
  const t = Math.floor(ix.length / 6) * 3;
  const a = ix[t], b = ix[t + 1], c = ix[t + 2];
  const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
  const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
  const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
  if (cx * N[a * 3] + cy * N[a * 3 + 1] + cz * N[a * 3 + 2] < 0) {
    for (let i = 0; i < ix.length; i += 3) { const tmp = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = tmp; }
  }
}

// ---------------------------------------------------------------- GLSL shared
const COMMON = /* glsl */`
uniform float uTime;
uniform float uExposure;
vec3 tonemap(vec3 c){
  c *= uExposure;
  vec3 a = (c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14);
  return pow(clamp(a,0.,1.), vec3(1./2.2));
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 hash32(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
// studio lights: key (front-left-top), fill (front-right), two rims behind
void getLight(int i, out vec3 L, out vec3 C){
  if(i==0){ L=normalize(vec3(-0.45,0.55,0.80)); C=vec3(1.0,0.97,0.94)*2.1; }
  else if(i==1){ L=normalize(vec3(0.75,0.15,0.55)); C=vec3(0.86,0.90,1.0)*0.65; }
  else if(i==2){ L=normalize(vec3(0.90,0.35,-0.55)); C=vec3(1.0,0.98,0.97)*1.5; }
  else { L=normalize(vec3(-0.90,0.30,-0.55)); C=vec3(1.0)*1.0; }
}
`;

// ---------------------------------------------------------------- stocking legs material
const legVS = /* glsl */`
varying vec3 vPos; varying vec3 vN; varying vec2 vPrm;
void main(){
  vec4 wp = modelMatrix*vec4(position,1.);
  vPos = wp.xyz; vN = normalize(mat3(modelMatrix)*normal); vPrm = uv;
  gl_Position = projectionMatrix*viewMatrix*wp;
}`;
const legFS = /* glsl */`
${COMMON}
uniform float uSide;      // -1 left, +1 right (viewer)
uniform float uPull;      // 0..1
uniform vec4  uAnchor;    // phiA, yA, Rtheta, Ry  (region on the leg)
uniform float uKneeY;
uniform float uFlat;      // 1 = filler blob, no pattern
varying vec3 vPos; varying vec3 vN; varying vec2 vPrm;
const float PI = 3.14159265;

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vPos);
  float phi = vPrm.x, y = vPrm.y;
  float rArc = 0.072;
  vec3 T = normalize(cross(vec3(0.,1.,0.), N) + vec3(1e-5));
  vec3 B = normalize(cross(N, T));

  // ---- knee wrinkles (horizontal soft folds), stronger on the pulled leg
  float knee = exp(-pow((y-uKneeY+0.005)/0.04, 2.));
  float n1 = vnoise(vec2(phi*3.0, y*24.));
  float n2 = vnoise(vec2(phi*9.0+7., y*60.));
  float frontish = smoothstep(-0.5, 0.7, N.z);
  float wr = knee*(0.35+0.65*frontish);
  float ph = y*720. + n1*5.0 + sin(phi*3.)*2.0;
  float wAmp = 0.05 + uPull*0.16;
  wr *= smoothstep(0.25, 0.6, vnoise(vec2(phi*5., y*90.)));
  // thin creases: sharpened cosine so they read as lines rather than blotches
  float cr = pow(0.5+0.5*cos(ph), 3.0) - 0.125;
  vec3 Nw = N + B*cr*wr*wAmp*2.0*(0.7+0.3*n1);

  // ---- tension folds radiating toward the sail attachment
  float tens = 0.;
  if(uPull > 0.002){
    float dphi = mod(phi - uAnchor.x + PI, 2.*PI) - PI;
    vec2 q = vec2(dphi*rArc/uAnchor.z, (y-uAnchor.y)/uAnchor.w);
    float d = length(q);
    float ring = smoothstep(1.45, 1.0, d)*smoothstep(0.7, 1.0, d);
    float ang = atan(q.y, q.x);
    float fold = sin(ang*18. + n1*3.);
    tens = ring*uPull;
    vec3 dir = normalize(T*(-sin(ang)) + B*cos(ang));
    Nw += dir*fold*tens*0.18;
  }
  N = normalize(Nw);
  float NdV = clamp(dot(N,V), 0., 1.);

  vec3 skin  = vec3(0.86, 0.50, 0.44);
  vec3 ivory = vec3(0.88, 0.85, 0.83);
  vec3 dSk = vec3(0.06,0.06,0.07), dSt = vec3(0.06,0.06,0.07), spec = vec3(0.);
  for(int i=0;i<4;i++){
    vec3 L, C; getLight(i, L, C);
    float nl = dot(N,L);
    dSk += C*max(0., (nl+0.35)/1.35)*0.80;
    float ws = max(0., (nl+0.1)/1.1);
    dSt += C*ws*ws*0.85;
    vec3 H = normalize(L+V);
    float th = dot(T,H); float kk = sqrt(max(0., 1.-th*th));
    float vis = smoothstep(-0.2, 0.2, nl);
    spec += C*pow(kk, 120.)*0.16*vis;                       // anisotropic yarn sheen (vertical streak)
    spec += C*pow(max(dot(N,H),0.), 48.)*0.05*vis;
  }
  float edge = pow(1.-NdV, 1.4);
  // sheer coverage: denser at grazing angles, thinner where stretched over the knee
  float kneeStretch = knee*smoothstep(0.1, 0.8, N.z)*0.55;
  float cover = clamp(0.56 + 0.42*edge - kneeStretch*0.22 - tens*0.05, 0., 1.);
  // micro knit striation (fades out when unresolvable)
  vec2 kc = vec2(phi*rArc*2400., y*1200.);
  float fw = max(fwidth(kc.x), fwidth(kc.y));
  float knit = (sin(kc.x*6.2832)*0.5+0.5)*(1.-smoothstep(0.25, 0.6, fw));
  cover = clamp(cover + (knit-0.5)*0.06 + (n2-0.5)*0.04, 0., 1.);

  vec3 col = mix(skin*dSk, ivory*dSt, cover);
  col += spec;
  // velvety rim sheen
  col += vec3(0.95,0.94,0.96)*pow(1.-NdV, 3.)*0.35;

  // ---- glitter: sparse random glints with their own micro-normals
  vec2 gc = vec2(phi*rArc, y)*vec2(820., 820.);
  vec2 gi = floor(gc);
  float h = hash12(gi + uSide*31.);
  if(h > 0.90 && uFlat < 0.5){
    vec3 r3 = hash32(gi*1.37 + 4.1);
    vec2 off = (r3.xy-0.5)*0.5;
    float dd = length(fract(gc)-0.5-off);
    float dotm = 1.-smoothstep(0.12, 0.42, dd);
    vec3 gN = normalize(N + (r3-0.5)*1.3);
    float g = 0.;
    for(int i=0;i<4;i++){ vec3 L,C; getLight(i,L,C); g += pow(max(dot(reflect(-L,gN),V),0.), 70.)*C.r; }
    float tw = 0.55+0.45*sin(uTime*2.3 + h*97.);
    col += vec3(1.0,0.98,0.95)*g*dotm*tw*2.8;
  }

  // ---- fake occlusion: under the skirt and between the thighs
  float occ = 1. - 0.38*smoothstep(0.70, 0.83, y);
  occ *= 1. - 0.45*max(0., -N.x*uSide)*smoothstep(0.62, 0.92, y);
  occ *= 1. - 0.25*smoothstep(0.84, 0.95, y);
  col *= occ;
  if(uFlat > 0.5) col = ivory*0.05;
  gl_FragColor = vec4(tonemap(col), 1.);
}`;

function makeLegMat(side) {
  return new THREE.ShaderMaterial({
    vertexShader: legVS, fragmentShader: legFS,
    uniforms: {
      uTime: { value: 0 }, uExposure: { value: EXPOSURE }, uSide: { value: side }, uPull: { value: 0 },
      uAnchor: { value: new THREE.Vector4(0, 0.68, 0.1, 0.2) }, uKneeY: { value: KNEE_Y }, uFlat: { value: 0 },
    },
  });
}
const matL = makeLegMat(-1), matR = makeLegMat(1);
const legL = new THREE.Mesh(buildLeg(LEG_L, 160, 260, 0.02, 1.06, 0), matL);
const legR = new THREE.Mesh(buildLeg(LEG_R, 160, 260, 0.02, 1.06, 0), matR);
scene.add(legL, legR);
// filler inside the skirt so no gap ever reads through the hem
let fillerBlob = null;
{
  const g = new THREE.SphereGeometry(1, 48, 24);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0, 1.0);
  const m = makeLegMat(0); m.uniforms.uFlat.value = 1;
  const blob = new THREE.Mesh(g, m); blob.position.set(0.0, 1.0, 0.0); blob.scale.set(0.19, 0.12, 0.11);
  scene.add(blob); fillerBlob = blob;
}

// ---------------------------------------------------------------- pleated skirt
const SK = { NP: 26, SEG: 12, NV: 40, HEM: 0.818, TOP: 1.14 };
function skirtShape(i, v, t, out) {
  const nA = SK.NP * SK.SEG;
  const f = (i % SK.SEG) / SK.SEG;
  const prof = f < 0.78 ? f / 0.78 : (1 - f) / 0.22;  // knife pleat
  const ang = TAU * i / nA - PI / 2;   // seam at the back
  const amp = 0.014 + (0.004 - 0.014) * v;
  const r = 0.272 + (0.188 - 0.272) * Math.pow(v, 0.85) + amp * (prof - 0.5);
  const hem = SK.HEM - 0.014 * Math.max(0, -Math.sin(ang)) + 0.005 * prof + 0.003 * Math.sin(ang * 3 + 1.0);
  const y = hem + (SK.TOP - hem) * v;
  out.x = r * Math.cos(ang) + 0.004; out.y = y; out.z = r * Math.sin(ang) * 0.80 + 0.012;
  out.prof = prof; out.h = y - hem; out.arc = ang * 0.24;
}
function buildSkirt() {
  const nA = SK.NP * SK.SEG, nV = SK.NV;
  const cnt = nA * (nV + 1);
  const pos = new Float32Array(cnt * 3), aux = new Float32Array(cnt * 4);
  const o = {};
  for (let j = 0; j <= nV; j++) {
    const v = Math.pow(j / nV, 1.6);
    for (let i = 0; i < nA; i++) {
      skirtShape(i, v, 0, o);
      const k = j * nA + i;
      pos.set([o.x, o.y, o.z], k * 3);
      aux.set([v, o.prof, o.h, i / nA], k * 4);
    }
  }
  const idx = [];
  for (let j = 0; j < nV; j++) for (let i = 0; i < nA; i++) {
    const i2 = (i + 1) % nA;
    const a = j * nA + i, b = j * nA + i2, c = (j + 1) * nA + i, d = (j + 1) * nA + i2;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aux', new THREE.BufferAttribute(aux, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make normals point outward
  const P = g.attributes.position.array, N = g.attributes.normal.array;
  if (P[0] * N[0] + P[2] * N[2] < 0) { for (let i = 0; i < N.length; i++) N[i] = -N[i]; }
  return g;
}
const skirtVS = /* glsl */`
uniform float uTime;
uniform vec2 uSkSway;   // lateral hem sway (x, z), metres, already clamped on the CPU
uniform vec2 uSkFlare;  // outward flare (metres), side bias (-1 left .. +1 right)
uniform vec2 uSkRip;    // pleat ripple amplitude (metres), phase
attribute vec4 aux;
varying vec3 vPos; varying vec3 vN; varying vec4 vAux;
void main(){
  vec3 p = position;
  float lo = pow(1.-aux.x, 2.);            // 1 at the hem, 0 at the waist
  float ang = aux.w*6.2832;
  vec2 radial = normalize(vec2(position.x, position.z/0.8) + 1e-5);
  vec2 tang = vec2(-radial.y, radial.x);
  // idle breathing (as v1)
  p.x += sin(uTime*0.9 + ang*2.)*0.0018*lo;
  p.z += sin(uTime*0.7 + ang*3.)*0.0012*lo;
  // drag response: lateral sway, flare biased toward the pulled side, travelling pleat ripple
  // z sway only toward the camera (never away), so the front hem can't even *appear* to rise in perspective
  p.xz += vec2(uSkSway.x, max(uSkSway.y, 0.))*lo;
  float sideW = 0.45 + 0.55*clamp(0.5 + 0.5*uSkFlare.y*radial.x*1.4, 0., 1.);
  float fl = max(uSkFlare.x, 0.)*sideW*lo;                         // flare: outward only
  float rip = uSkRip.x*(0.5 + 0.5*sin(ang*13. - uSkRip.y))*lo;     // ripple: outward only
  p.xz += radial*vec2(1., 0.8)*(fl + rip);
  p.xz += tang*uSkRip.x*0.5*cos(ang*26. - uSkRip.y*1.3)*lo;
  // HARD LIMIT: vertical hem motion is clamped to [-4 mm, +1 mm]; the hem can never lift or flip up.
  float dy = sin(uTime*1.1 + ang*5.)*0.0008*lo - fl*0.12;
  p.y = position.y + clamp(dy, -0.004, 0.001);
  vec4 wp = modelMatrix*vec4(p,1.);
  vPos = wp.xyz; vN = normalize(mat3(modelMatrix)*normal); vAux = aux;
  gl_Position = projectionMatrix*viewMatrix*wp;
}`;
const skirtFS = /* glsl */`
${COMMON}
varying vec3 vPos; varying vec3 vN; varying vec4 vAux;
void main(){
  float h = vAux.z, prof = vAux.y;
  float arc = vAux.w*6.2832*0.24;
  vec3 N = normalize(vN); bool back = !gl_FrontFacing; if(back) N = -N;
  vec3 V = normalize(cameraPosition - vPos);
  // ---- hem band layout (meters from hem)
  vec3 charcoal = vec3(0.030,0.030,0.034);
  vec3 pale = vec3(0.36,0.32,0.33);
  vec3 dark = vec3(0.055,0.053,0.058);
  vec3 base = charcoal;
  float meshBand = 0.;
  if(h < 0.003) base = dark*1.2;
  else if(h < 0.017){ base = pale; meshBand = 1.; }
  else if(h < 0.022) base = dark;
  else if(h < 0.031) base = pale;
  else if(h < 0.036) base = dark;
  else if(h < 0.042) base = pale*0.92;
  // soft edges between bands
  // woven texture on the charcoal body
  vec2 tc = vec2(arc, h)*vec2(1400.,1400.);
  float tw = sin((tc.x+tc.y)*1.2)*0.5+0.5;
  float fw = fwidth(tc.x)+fwidth(tc.y);
  tw = mix(0.5, tw, 1.-smoothstep(0.4,1.2,fw));
  float plaid = 0.94 + 0.06*smoothstep(0.45,0.55, fract(arc*38.)) * smoothstep(0.45,0.55, fract(h*38.));
  base *= (0.9 + 0.2*tw) * (h > 0.042 ? plaid : 1.);
  // perforated mesh at the hem (tiny holes)
  if(meshBand > 0.5){
    vec2 mc = vec2(arc, h)/0.0021;
    mc.x += 0.5*mod(floor(mc.y),2.);
    float dd = length(fract(mc)-0.5);
    float fwm = fwidth(mc.x)*0.8;
    float hole = 1.-smoothstep(0.26-fwm, 0.26+fwm, dd);
    if(hole > 0.5 && fwm < 0.45) discard;
    base *= mix(1.0, 0.82, smoothstep(0.3,0.9,fwm));
  }
  // lighting
  vec3 col = vec3(0.07)*base;
  for(int i=0;i<4;i++){
    vec3 L,C; getLight(i,L,C);
    float nl = max(dot(N,L),0.);
    vec3 H = normalize(L+V);
    col += base*C*nl*0.85 + C*pow(max(dot(N,H),0.),30.)*0.035;
  }
  col += vec3(0.6)*pow(1.-max(dot(N,V),0.),4.)*0.08;
  // pleat crease occlusion
  float crease = smoothstep(0.80, 1.0, prof);
  col *= mix(1.0, 0.45, crease);
  col *= 0.7 + 0.3*smoothstep(0.0, 0.15, prof);
  if(back) col *= 0.18;
  col *= 1. - 0.6*smoothstep(0.12, 0.25, h); // fade to dark toward waist (out of frame)
  gl_FragColor = vec4(tonemap(col), 1.);
}`;
const skirtMat = new THREE.ShaderMaterial({
  vertexShader: skirtVS, fragmentShader: skirtFS, side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 }, uExposure: { value: EXPOSURE },
    uSkSway: { value: new THREE.Vector2() }, uSkFlare: { value: new THREE.Vector2() }, uSkRip: { value: new THREE.Vector2() },
  },
});
const skirt = new THREE.Mesh(buildSkirt(), skirtMat);
scene.add(skirt);

// ---------------------------------------------------------------- deformable stocking shells (one rig per thigh)
const SH = { nPhi: 240, nY: 170, y0: 0.42, y1: 0.93, off: 0.0022 };
const LMAX = 0.33;
const LUT_N = 1101;

const shellVS = /* glsl */`
attribute vec3 aTan; attribute vec2 aStr; attribute float aLift;
varying vec3 vPos; varying vec3 vN; varying vec3 vT; varying vec2 vUv; varying vec2 vStr; varying float vLift;
void main(){
  vec4 wp = modelMatrix*vec4(position,1.);
  vPos = wp.xyz; vN = normal; vT = aTan; vUv = uv; vStr = aStr; vLift = aLift;
  gl_Position = projectionMatrix*viewMatrix*wp;
}`;
const shellFS = /* glsl */`
${COMMON}
uniform float uDensity;
uniform float uPull;
varying vec3 vPos; varying vec3 vN; varying vec3 vT; varying vec2 vUv; varying vec2 vStr; varying float vLift;
void main(){
  float liftFade = smoothstep(0.007, 0.03, vLift);
  if(liftFade < 0.003) discard;
  vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vPos);
  vec3 T = normalize(vT - N*dot(vT,N) + vec3(1e-5));
  vec3 Bt = normalize(cross(N,T));

  // ---- knit cell coordinates live in REST fabric space, so they stretch with the geometry
  vec2 c = vUv*uDensity;
  vec2 st = max(vStr, vec2(0.35));
  // yarn half-width in cell units: yarn keeps its thickness, cells open up
  float wx = clamp(0.34/pow(st.x,1.6), 0.035, 0.48);
  float wy = clamp(0.30/pow(st.y,1.6), 0.035, 0.48);
  // knit loops: wavy courses + wales
  float row = floor(c.y);
  float cy = c.y + 0.10*sin(6.2832*c.x + row*3.1416);
  float cx = c.x + 0.10*sin(6.2832*c.y*0.5);
  float dy = abs(fract(cy+0.5)-0.5);
  float dx = abs(fract(cx+0.5)-0.5);
  vec2 aa = vec2(fwidth(cx), fwidth(cy))*0.75 + 1e-4;
  float covY = 1.-smoothstep(wy-aa.y, wy+aa.y, dy);
  float covX = 1.-smoothstep(wx-aa.x, wx+aa.x, dx);
  float cov = max(covX*0.9, covY);
  float avgCov = 1. - (1.-2.*wx)*(1.-2.*wy);
  float res = max(aa.x, aa.y);
  float resolve = 1.-smoothstep(0.22, 0.55, res);
  float coverage = mix(avgCov, cov, resolve);
  float stretch = sqrt(st.x*st.y);
  float yarnOpacity = mix(0.92, 0.72, smoothstep(1.,3.,stretch));

  // ---- lighting: yarn sheen along the course direction, slides as the sheet deforms
  vec3 ivory = vec3(0.86,0.83,0.82);
  vec3 dif = vec3(0.10), spec = vec3(0.);
  for(int i=0;i<4;i++){
    vec3 L,C; getLight(i,L,C);
    float nl = dot(N,L);
    dif += C*(max(nl,0.)*0.75 + max(-nl,0.)*0.35); // transmission through thin knit
    vec3 H = normalize(L+V);
    float tu = dot(T,H), tv = dot(Bt,H);
    spec += C*pow(sqrt(max(0.,1.-tu*tu)), 70.)*0.10;
    spec += C*pow(sqrt(max(0.,1.-tv*tv)), 90.)*0.06;
  }
  vec3 col = ivory*dif*0.82 + spec;
  float NdV = abs(dot(N,V));
  col += vec3(0.9)*pow(1.-NdV, 3.)*0.25;
  col *= mix(1.0, 0.85 + 0.3*covX*covY, resolve);

  // ---- sparkle in the stretched knit (cell-locked so it slides with the fabric)
  vec2 gc = c/3.0; vec2 gi = floor(gc);
  float h = hash12(gi+17.);
  float glint = 0.;
  if(h > 0.86){
    vec3 r3 = hash32(gi*1.7+3.);
    float dd = length(fract(gc)-0.5-(r3.xy-0.5)*0.5);
    float dotm = 1.-smoothstep(0.08, 0.32 + 0.2*(1.-resolve), dd);
    vec3 gN = normalize(N + (r3-0.5)*1.4);
    for(int i=0;i<4;i++){ vec3 L,C; getLight(i,L,C); glint += pow(max(dot(reflect(-L,gN),V),0.),60.)*C.r; }
    glint *= dotm*(0.6+0.4*sin(uTime*3.0+h*60.));
  }
  col += vec3(1.,0.98,0.95)*glint*3.0;

  float alpha = clamp(coverage*yarnOpacity, 0., 1.)*liftFade;
  alpha = max(alpha, glint*0.8*liftFade);
  gl_FragColor = vec4(tonemap(col), clamp(alpha,0.,1.));
}`;

function makeRig(leg, legMat, name) {
  const shCnt = (SH.nPhi + 1) * (SH.nY + 1);
  const shRest = new Float32Array(shCnt * 3), shRestN = new Float32Array(shCnt * 3);
  const shPos = new Float32Array(shCnt * 3), shNor = new Float32Array(shCnt * 3), shTan = new Float32Array(shCnt * 3);
  const shUV = new Float32Array(shCnt * 2), shStr = new Float32Array(shCnt * 2), shLift = new Float32Array(shCnt);
  const shPhi = new Float32Array(SH.nPhi + 1), shY = new Float32Array(SH.nY + 1), shArc = new Float32Array(SH.nY + 1);
  const p = {}, n = {};
  for (let j = 0; j <= SH.nY; j++) {
    const y = SH.y0 + (SH.y1 - SH.y0) * j / SH.nY;
    shY[j] = y; shArc[j] = (catmull(y, 1) + catmull(y, 2)) * 0.5;
    for (let i = 0; i <= SH.nPhi; i++) {
      const phi = -PI + TAU * i / SH.nPhi; shPhi[i] = phi;
      const k = j * (SH.nPhi + 1) + i;
      legSurface(leg, phi, y, SH.off, p); legNormal(leg, phi, y, SH.off, n);
      shRest[k * 3] = p.x; shRest[k * 3 + 1] = p.y; shRest[k * 3 + 2] = p.z;
      shRestN[k * 3] = n.x; shRestN[k * 3 + 1] = n.y; shRestN[k * 3 + 2] = n.z;
      // mirror the knit u-coordinate on the left leg so both knits run the same way on screen
      shUV[k * 2] = phi * shArc[j] * leg.s; shUV[k * 2 + 1] = y;
      shStr[k * 2] = 1; shStr[k * 2 + 1] = 1;
    }
  }
  shPos.set(shRest); shNor.set(shRestN);
  // the grid-derived normal cross(dV, dU) points outward on the right leg; the mirrored left leg needs a flip
  const nSign = leg.s;
  // cross-section lookup for collision (y in [0,1.1] step 1mm)
  const lutCx = new Float32Array(LUT_N), lutCz = new Float32Array(LUT_N), lutRx = new Float32Array(LUT_N), lutRz = new Float32Array(LUT_N);
  for (let i = 0; i < LUT_N; i++) {
    const y = i / 1000; legCenter(leg, y, _c);
    lutCx[i] = _c.x; lutCz[i] = _c.z; lutRx[i] = catmull(y, 1); lutRz[i] = catmull(y, 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(shPos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(shNor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aTan', new THREE.BufferAttribute(shTan, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aStr', new THREE.BufferAttribute(shStr, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aLift', new THREE.BufferAttribute(shLift, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(shUV, 2));
  const idx = [];
  for (let j = 0; j < SH.nY; j++) for (let i = 0; i < SH.nPhi; i++) {
    const a = j * (SH.nPhi + 1) + i, b = a + 1, c = a + SH.nPhi + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  geo.setIndex(idx);
  fixWinding(geo);
  const mat = new THREE.ShaderMaterial({
    vertexShader: shellVS, fragmentShader: shellFS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uExposure: { value: EXPOSURE }, uDensity: { value: 620 }, uPull: { value: 0 } },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 10; mesh.visible = false;
  scene.add(mesh);
  // generous pick proxy around the thigh (never rendered)
  const proxy = new THREE.Mesh(buildLeg(leg, 64, 48, 0.47, 0.84, 0.03), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  proxy.updateMatrixWorld(true);

  const S = {
    name, leg, grabbing: false, pointerId: null,
    anchorPhi: -0.55, anchorY: 0.68,
    anchor: new THREE.Vector3(), anchorN: new THREE.Vector3(),
    D: new THREE.Vector3(), vel: new THREE.Vector3(), target: new THREE.Vector3(),
    Lm: 0, ripT: 99, ripA: 0, active: false,
  };
  const rig = { S, mesh, mat, legMat, proxy, leg };

  rig.setAnchor = (phi, y) => {
    y = clamp(y, 0.50, 0.80);
    S.anchorPhi = phi; S.anchorY = y;
    const p = {}, n = {};
    legSurface(leg, phi, y, SH.off, p); legNormal(leg, phi, y, SH.off, n);
    S.anchor.set(p.x, p.y, p.z); S.anchorN.set(n.x, n.y, n.z);
  };
  rig.setAnchor(-0.55, 0.68);

  rig.update = (dt) => {
    const L = S.D.length();
    S.Lm = Math.max(L, S.Lm * Math.exp(-dt * (S.grabbing ? 1.2 : 2.6)));
    const ripAmp = S.ripA * Math.exp(-S.ripT * 4.5);
    S.ripT += dt;
    if (S.Lm < 0.0015 && ripAmp < 0.0003 && !S.grabbing) {
      if (S.active) { S.active = false; mesh.visible = false; legMat.uniforms.uPull.value = 0; }
      return;
    }
    S.active = true; mesh.visible = true;
    const Lm = S.Lm;
    const Rt = 0.035 + 0.26 * Lm, Ry = 0.05 + 0.55 * Lm;
    const gather = smooth(0.0, 0.12, L) * 0.55;
    const foldK = Math.min(1, L / 0.12);
    // during the release overshoot don't push fabric INTO the leg (reads as a dent); keep only lateral wobble
    const dn = Math.min(0, S.D.dot(S.anchorN));
    const Dx = S.D.x - S.anchorN.x * dn, Dy = S.D.y - S.anchorN.y * dn, Dz = S.D.z - S.anchorN.z * dn;
    const vx = clamp(S.vel.x, -2, 2), vy = clamp(S.vel.y, -2, 2), vz = clamp(S.vel.z, -2, 2);
    const ax = S.anchor.x, ay = S.anchor.y, az = S.anchor.z;
    const nP = SH.nPhi + 1;
    const phA = S.anchorPhi, yA = S.anchorY;
    for (let j = 0; j <= SH.nY; j++) {
      const y = shY[j], arc = shArc[j];
      const dyn = (y - yA) / Ry;
      const taper = smooth(0.905, 0.80, y) * smooth(0.43, 0.47, y);
      for (let i = 0; i < nP; i++) {
        const k = j * nP + i, k3 = k * 3;
        const rx = shRest[k3], ry = shRest[k3 + 1], rz = shRest[k3 + 2];
        let dphi = shPhi[i] - phA; dphi = dphi - TAU * Math.round(dphi / TAU);
        const dsn = dphi * arc / Rt;
        const d = Math.hypot(dsn, dyn);
        let w = 0;
        if (d < 1) { w = Math.pow(1 - d, 1.55) * taper; }
        if (w <= 0 && ripAmp < 0.0003) {
          shPos[k3] = rx; shPos[k3 + 1] = ry; shPos[k3 + 2] = rz; shLift[k] = 0; continue;
        }
        const g = w * w * w * gather;
        let px = rx + w * Dx + (ax - rx) * g;
        let py = ry + w * Dy + (ay - ry) * g;
        let pz = rz + w * Dz + (az - rz) * g;
        const bl = 4 * w * (1 - w) * 0.035;
        px -= vx * bl; py -= vy * bl; pz -= vz * bl;
        const nx = shRestN[k3], ny = shRestN[k3 + 1], nz = shRestN[k3 + 2];
        if (w > 0) {
          const ang = Math.atan2(dyn, dsn);
          const env = smooth(0.0, 0.25, w) * (1 - w) * (1 - w) * foldK;
          const f = Math.sin(ang * 13.0) * 0.0045 * env;
          px += nx * f; py += ny * f; pz += nz * f;
        }
        if (ripAmp > 0.0003 && d < 1.3) {
          const r = ripAmp * Math.sin(d * 18 - S.ripT * 34) * Math.max(0, 1.3 - d);
          px += nx * r; py += ny * r; pz += nz * r;
        }
        // collide with the thigh (keep fabric outside the leg)
        const li = clamp(Math.round(py * 1000), 0, LUT_N - 1);
        const ex = (px - lutCx[li]) / (lutRx[li] * 1.06 + 0.003), ez = (pz - lutCz[li]) / (lutRz[li] * 1.06 + 0.003);
        const e = Math.hypot(ex, ez);
        if (e < 1 && e > 1e-4 && py > 0.4 && py < 1.0) {
          const s = 1 / e;
          px = lutCx[li] + (px - lutCx[li]) * s; pz = lutCz[li] + (pz - lutCz[li]) * s;
        }
        shPos[k3] = px; shPos[k3 + 1] = py; shPos[k3 + 2] = pz;
        shLift[k] = Math.hypot(px - rx, py - ry, pz - rz);
      }
    }
    const dphiStep = TAU / SH.nPhi, dyStep = (SH.y1 - SH.y0) / SH.nY;
    for (let j = 0; j <= SH.nY; j++) {
      const jm = Math.max(j - 1, 0), jp = Math.min(j + 1, SH.nY);
      const restV = (jp - jm) * dyStep;
      for (let i = 0; i < nP; i++) {
        const k = j * nP + i, k3 = k * 3;
        if (shLift[k] === 0 && ripAmp < 0.0003) {
          shNor[k3] = shRestN[k3]; shNor[k3 + 1] = shRestN[k3 + 1]; shNor[k3 + 2] = shRestN[k3 + 2];
          shStr[k * 2] = 1; shStr[k * 2 + 1] = 1; continue;
        }
        const im = Math.max(i - 1, 0), ip = Math.min(i + 1, SH.nPhi);
        const a = (j * nP + ip) * 3, b = (j * nP + im) * 3, c = (jp * nP + i) * 3, dd = (jm * nP + i) * 3;
        const ux = shPos[a] - shPos[b], uy = shPos[a + 1] - shPos[b + 1], uz = shPos[a + 2] - shPos[b + 2];
        const wx = shPos[c] - shPos[dd], wy = shPos[c + 1] - shPos[dd + 1], wz = shPos[c + 2] - shPos[dd + 2];
        let nx = wy * uz - wz * uy, ny = wz * ux - wx * uz, nz = wx * uy - wy * ux;
        const nl = (Math.hypot(nx, ny, nz) || 1) * nSign;
        shNor[k3] = nx / nl; shNor[k3 + 1] = ny / nl; shNor[k3 + 2] = nz / nl;
        const ul = Math.hypot(ux, uy, uz) || 1;
        shTan[k3] = ux / ul; shTan[k3 + 1] = uy / ul; shTan[k3 + 2] = uz / ul;
        const restU = (ip - im) * dphiStep * shArc[j];
        shStr[k * 2] = ul / restU;
        shStr[k * 2 + 1] = Math.hypot(wx, wy, wz) / restV;
      }
    }
    const A = geo.attributes;
    A.position.needsUpdate = A.normal.needsUpdate = A.aTan.needsUpdate = A.aStr.needsUpdate = A.aLift.needsUpdate = true;
    legMat.uniforms.uAnchor.value.set(phA, yA, Rt, Ry);
    legMat.uniforms.uPull.value = clamp(L / LMAX, 0, 1);
    mat.uniforms.uPull.value = clamp(L / LMAX, 0, 1);
  };

  // spring-damper on the pinch point
  rig.step = (dt) => {
    const k = S.grabbing ? 260 : 150;
    const zeta = S.grabbing ? 0.85 : 0.2;
    const c = 2 * zeta * Math.sqrt(k);
    const tx = S.grabbing ? S.target.x : 0, ty = S.grabbing ? S.target.y : 0, tz = S.grabbing ? S.target.z : 0;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      S.vel.x += (-k * (S.D.x - tx) - c * S.vel.x) * h;
      S.vel.y += (-k * (S.D.y - ty) - c * S.vel.y) * h;
      S.vel.z += (-k * (S.D.z - tz) - c * S.vel.z) * h;
      S.D.x += S.vel.x * h; S.D.y += S.vel.y * h; S.D.z += S.vel.z * h;
    }
  };

  // pointer → pull target with elastic resistance
  rig.pointerToTarget = (cx, cy) => {
    setNDC(cx, cy);
    _ray.setFromCamera(_ndc, camera);
    camera.getWorldDirection(_camDir);
    _plane.setFromNormalAndCoplanarPoint(_camDir.negate(), S.anchor);
    if (!_ray.ray.intersectPlane(_plane, _q)) return;
    const raw = _q.clone().sub(S.anchor);
    const rl = raw.length();
    // pulling outward also lifts the fabric away from the skin and slightly back (behind the thigh)
    raw.addScaledVector(S.anchorN, rl * 0.35);
    raw.z -= rl * 0.35;
    const l2 = raw.length();
    if (l2 > 1e-6) raw.multiplyScalar(LMAX * Math.tanh(l2 / LMAX) / l2);
    S.target.copy(raw);
  };

  rig.startGrab = (phi, y, cx, cy, pointerId) => {
    if (!(S.active && S.Lm > 0.01)) rig.setAnchor(phi, y); // re-grab mid-recoil keeps its anchor
    S.grabbing = true; S.pointerId = pointerId;
    rig.pointerToTarget(cx, cy);
  };
  rig.endGrab = () => {
    if (!S.grabbing) return;
    S.grabbing = false; S.pointerId = null;
    S.ripT = 0; S.ripA = 0.006 * clamp(S.D.length() / LMAX, 0, 1);
  };
  rig.stats = () => {
    const v = []; for (let k = 0; k < shLift.length; k++) if (shLift[k] > 0.02) v.push(Math.sqrt(shStr[k * 2] * shStr[k * 2 + 1]));
    v.sort((a, b) => a - b); const q = (f) => v[Math.floor(f * (v.length - 1))];
    const t0 = performance.now(); for (let i = 0; i < 10; i++) rig.update(1 / 60); const ms = (performance.now() - t0) / 10;
    return { n: v.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), msPerUpdate: ms };
  };
  return rig;
}

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane();
const _q = new THREE.Vector3();
const _camDir = new THREE.Vector3();
function setNDC(cx, cy) {
  const r = canvas.getBoundingClientRect();
  _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
}

const rigR = makeRig(LEG_R, matR, 'right');
const rigL = makeRig(LEG_L, matL, 'left');
const RIGS = [rigR, rigL];

// pick whichever thigh is under the pointer (nearest hit wins)
function pickThigh(cx, cy) {
  setNDC(cx, cy);
  _ray.setFromCamera(_ndc, camera);
  let best = null;
  for (const rig of RIGS) {
    const hit = _ray.intersectObject(rig.proxy, false)[0];
    if (hit && (!best || hit.distance < best.dist)) best = { rig, point: hit.point, dist: hit.distance };
  }
  if (!best) return null;
  const leg = best.rig.leg, y = best.point.y;
  legCenter(leg, y, _c);
  const a = Math.atan2((best.point.z - _c.z) / catmull(y, 2), (best.point.x - _c.x) / catmull(y, 1));
  const phi = leg.s > 0 ? a : PI - a; // undo the left-leg mirror (a = PI - phi)
  return { rig: best.rig, phi: Math.atan2(Math.sin(phi), Math.cos(phi)), y };
}

// ---------------------------------------------------------------- skirt reaction (spring-damped, hard-clamped)
// Lateral sway + slight outward flare + pleat ripple only. The shader additionally clamps any
// vertical motion to [-4 mm, +1 mm], so the hem can never lift to reveal anything.
const SKD = { sx: 0, sz: 0, vx: 0, vz: 0, flare: 0, fv: 0, side: 0, rip: 0, ripPh: 0, frozen: false };
const SK_LIM = { sway: 0.012, flareMax: 0.014, rip: 0.005 };
function stepSkirt(dt) {
  if (SKD.frozen) { applySkirtUniforms(); return; }
  let dX = 0, dZ = 0, vX = 0, vZ = 0, mag = 0, speed = 0, sideW = 0, sideSum = 0;
  for (const r of RIGS) {
    const S = r.S, l = S.D.length();
    dX += S.D.x; dZ += S.D.z; vX += S.vel.x; vZ += S.vel.z;
    mag += l; speed += S.vel.length();
    sideSum += r.leg.s * l; sideW += l;
  }
  // the fabric tugs the hem a little toward the pull and lags behind pointer velocity
  const tx = clamp(dX * 0.035, -0.009, 0.009), tz = clamp(dZ * 0.025, -0.006, 0.006);
  const k = 70, c = 2 * 0.22 * Math.sqrt(k);
  const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
  const tf = clamp(mag * 0.04, 0, SK_LIM.flareMax), kf = 90, cf = 2 * 0.3 * Math.sqrt(kf);
  for (let i = 0; i < n; i++) {
    SKD.vx += (-k * (SKD.sx - tx) - c * SKD.vx + clamp(vX, -3, 3) * 0.9) * h;
    SKD.vz += (-k * (SKD.sz - tz) - c * SKD.vz + clamp(vZ, -3, 3) * 0.4) * h;
    SKD.sx += SKD.vx * h; SKD.sz += SKD.vz * h;
    SKD.fv += (-kf * (SKD.flare - tf) - cf * SKD.fv) * h;
    SKD.flare += SKD.fv * h;
  }
  SKD.sx = clamp(SKD.sx, -SK_LIM.sway, SK_LIM.sway);
  SKD.sz = clamp(SKD.sz, -SK_LIM.sway, SK_LIM.sway);
  SKD.flare = clamp(SKD.flare, 0, SK_LIM.flareMax);
  SKD.side += ((sideW > 1e-4 ? sideSum / sideW : 0) - SKD.side) * Math.min(1, dt * 4);
  SKD.rip = Math.max(SKD.rip * Math.exp(-dt * 2.2), Math.min(SK_LIM.rip, speed * 0.003));
  SKD.ripPh += dt * 9.0;
  applySkirtUniforms();
}
function applySkirtUniforms() {
  const u = skirtMat.uniforms;
  u.uSkSway.value.set(SKD.sx, SKD.sz);
  u.uSkFlare.value.set(SKD.flare, SKD.side);
  u.uSkRip.value.set(SKD.rip, SKD.ripPh);
}

// ---------------------------------------------------------------- input (multi-pointer: one pointer per thigh)
const cur = document.getElementById('cur');
const hint = document.getElementById('hint');
let interacted = false, lastInput = performance.now(), demo = null, demoDone = false;
let pointerXY = [innerWidth / 2, innerHeight / 2];
const rigOfPointer = (id) => RIGS.find((r) => r.S.grabbing && r.S.pointerId === id);
const anyGrab = () => RIGS.some((r) => r.S.grabbing);
function stopDemo() { if (demo) { demo = null; demoDone = true; for (const r of RIGS) if (r.S.pointerId === 'demo') r.endGrab(); } }

canvas.addEventListener('pointerdown', (e) => {
  lastInput = performance.now();
  stopDemo();
  if (!interacted) { interacted = true; hint.classList.remove('show'); }
  const hit = pickThigh(e.clientX, e.clientY);
  if (!hit || hit.rig.S.grabbing) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers */ }
  hit.rig.startGrab(hit.phi, hit.y, e.clientX, e.clientY, e.pointerId);
  cur.classList.add('grab');
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  pointerXY = [e.clientX, e.clientY];
  if (e.pointerType === 'mouse') {
    cur.classList.add('on');
    cur.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  }
  lastInput = performance.now();
  const rig = rigOfPointer(e.pointerId);
  if (rig) rig.pointerToTarget(e.clientX, e.clientY);
  else if (e.pointerType === 'mouse') cur.classList.toggle('hot', !!pickThigh(e.clientX, e.clientY));
});
const up = (e) => {
  const rig = rigOfPointer(e.pointerId);
  if (rig) rig.endGrab();
  if (!anyGrab()) cur.classList.remove('grab');
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') cur.classList.remove('on'); });
window.addEventListener('blur', () => { for (const r of RIGS) r.endGrab(); cur.classList.remove('grab'); });

// ---------------------------------------------------------------- auto demo (once, after ~2 s idle): right, then left
function screenOf(v) { const p = v.clone().project(camera); const r = canvas.getBoundingClientRect();
  return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }
const DEMO_SEQ = [{ rig: rigR, phi: -0.6, y: 0.67, t0: 0 }, { rig: rigL, phi: -0.6, y: 0.67, t0: 2.5 }];
function runDemo(t) {
  const e = t - demo.t0;
  const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  for (const step of DEMO_SEQ) {
    const r = step.rig, le = e - step.t0;
    if (le < 0) continue;
    if (le < 1.5) {
      if (!r.S.grabbing) {
        r.setAnchor(step.phi, step.y);
        const [x, y] = screenOf(r.S.anchor);
        r.startGrab(step.phi, step.y, x, y, 'demo');
      }
      const end = r.S.anchor.clone().add(new THREE.Vector3(0.27 * r.leg.s, -0.035, 0.0));
      const [x, y] = screenOf(r.S.anchor.clone().lerp(end, ease(clamp(le / 1.5, 0, 1))));
      r.pointerToTarget(x, y);
    } else if (le > 2.2 && r.S.pointerId === 'demo') r.endGrab();
  }
  if (e > DEMO_SEQ[DEMO_SEQ.length - 1].t0 + 2.4) { demo = null; demoDone = true; lastInput = performance.now(); }
}

// ---------------------------------------------------------------- resize / camera
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const dist = CAM_BASE.distanceTo(CAM_TARGET);
  // landscape: lock the vertical frame (wide enough for a sail on either side); portrait: widen within limits
  const halfH = clamp(0.36 / camera.aspect, 0.26, 0.40);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfH / dist));
  camera.updateProjectionMatrix();
}
CAM_BASE.x = 0.0; CAM_TARGET.x = 0.0;
addEventListener('resize', resize);
resize();

// film grain texture (tiled, very subtle)
{
  const g = document.createElement('canvas'); g.width = g.height = 128;
  const ctx = g.getContext('2d'); const im = ctx.createImageData(128, 128);
  for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  ctx.putImageData(im, 0, 0);
  document.getElementById('grain').style.backgroundImage = `url(${g.toDataURL()})`;
}

// ---------------------------------------------------------------- loop
const camOff = new THREE.Vector2();
let tPrev = performance.now(), tStart = tPrev, frames = 0, ftAcc = 0, adapted = false, simT = 0;
const params = new URLSearchParams(location.search);
const NO_DEMO = params.has('nodemo');
setTimeout(() => { if (!interacted) hint.classList.add('show'); }, 600);

function simulate(dt) {
  for (const r of RIGS) r.step(dt);
  for (const r of RIGS) r.update(dt);
  stepSkirt(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - tPrev) / 1000, 1 / 20); tPrev = now;
  if (window.__fixedDt) dt = window.__fixedDt;
  const t = (now - tStart) / 1000;

  simT += dt; // the demo is timed in simulation time so it stays in sync with the physics even on slow devices
  if (!demo && !demoDone && !interacted && !NO_DEMO && now - lastInput > 2000 && t > 2) demo = { t0: simT };
  if (demo) runDemo(simT);

  simulate(dt);

  // subtle parallax drift; the camera never drops below its rest height (it always looks down onto the hem)
  const grabbing = anyGrab();
  const tx = grabbing ? 0 : (pointerXY[0] / innerWidth - 0.5), ty = grabbing ? 0.5 : (pointerXY[1] / innerHeight);
  camOff.x += (tx * 0.05 - camOff.x) * Math.min(1, dt * 2);
  camOff.y += ((1 - clamp(ty, 0, 1)) * 0.012 - camOff.y) * Math.min(1, dt * 2);
  camera.position.set(CAM_BASE.x + camOff.x + Math.sin(t * 0.25) * 0.006, CAM_BASE.y + Math.max(0, camOff.y), CAM_BASE.z);
  camera.lookAt(CAM_TARGET);

  for (const m of [matL, matR, skirtMat, rigR.mat, rigL.mat]) m.uniforms.uTime.value = t;
  renderer.render(scene, camera);

  // adapt resolution on weak GPUs
  if (!adapted && t > 1) { frames++; ftAcc += dt; if (frames > 90) { adapted = true; if (ftAcc / frames > 0.024 && DPR > 1) { DPR = 1; renderer.setPixelRatio(1); resize(); } } }
}
requestAnimationFrame(frame);

// test hooks (used by the headless screenshot script; harmless otherwise)
const rigBy = (side) => (side === 'left' ? rigL : rigR);
window.__toy = {
  grab(side, phi, y) { interacted = true; hint.classList.remove('show'); stopDemo(); const r = rigBy(side); r.setAnchor(phi, y); r.S.grabbing = true; r.S.pointerId = 'test'; },
  pullWorld(side, dx, dy, dz) { const r = rigBy(side); const [x, y] = screenOf(r.S.anchor.clone().add(new THREE.Vector3(dx, dy, dz))); r.pointerToTarget(x, y); },
  settle(n = 240) { for (let i = 0; i < n; i++) simulate(1 / 120); },
  release(side) { if (side) rigBy(side).endGrab(); else for (const r of RIGS) r.endGrab(); },
  screenOfAnchor(side, dx = 0, dy = 0, dz = 0) { const r = rigBy(side); return screenOf(r.S.anchor.clone().add(new THREE.Vector3(dx, dy, dz))); },
  rigs: { right: rigR.S, left: rigL.S },
  skirt: SKD, skirtLimits: SK_LIM,
  // freeze the skirt at given values (used to test the worst case), or pass null to unfreeze
  setSkirt(v) { if (!v) { SKD.frozen = false; return; } Object.assign(SKD, v, { frozen: true }); applySkirtUniforms(); },
  showBody(on) { legL.visible = legR.visible = on; if (fillerBlob) fillerBlob.visible = on; for (const r of RIGS) r.mesh.visible = on && r.S.active; },
  hideHint() { hint.classList.remove('show'); },
  stats(side = 'right') { return rigBy(side).stats(); },
  demoActive: () => !!demo,
};
