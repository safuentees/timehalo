export const SHARED_VERT = `attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const SHARED_SNOISE = `#extension GL_OES_standard_derivatives : enable
precision highp float;

vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289_2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289_3(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289_2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                          dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float a = 0.5; float f = 1.0; float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    sum += a * snoise(p * f);
    f *= 2.03;
    a *= 0.5;
  }
  return sum * 0.5 + 0.5;
}
`;

export const FRAG_A = `varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform float uRippleFreq;
uniform float uRippleSpeed;
uniform int   uLayers;
uniform float uRound;
uniform int   uShowCurrentOnly;

void main() {
  // Aspect-aware centered coords: short axis = unit length.
  vec2 uv = vUv - 0.5;
  uv.x *= uAspect;

  // Elliptical-to-circular interpolation for wide containers.
  vec2 wuv = uv;
  wuv.x *= mix(1.0 / max(uAspect, 0.001), 1.0, uRound);

  // Polar form.
  float t = uTime * uRippleSpeed * 3.14159;
  float a = atan(wuv.y, wuv.x);
  float d = length(wuv) * 2.0;

  // The two edges of each accumulated band: smoothstep(s1, s2, v).
  float s1 = -0.1;
  float s2 = s1 + sin(t - d * uRippleFreq * 0.6) * 0.1 + 0.15;

  // Accumulate up to 128 layers; each has its own phase ki.
  // sin(a*3 - t + sin(ki - t)*2.5) is a wobble-within-wobble -
  // the inner sin modulates the phase of the outer sin over time,
  // which gives the field its breathing / slowly-rotating quality.
  float f = 0.0;
  float fSingle = 0.0;
  int lastK = uLayers > 0 ? uLayers - 1 : 0;
  for (int k = 0; k < 128; k++) {
    if (k >= uLayers) break;
    float ki = float(k) * (6.2831853 / float(uLayers));
    float v = sin(a*3.0 - t + sin(ki - t)*2.5) * 0.1 * d + (d - ki*0.4);
    float w = fwidth(v);
    float contrib = smoothstep(s1 - w, s2 + w, v);
    f += contrib;
    if (k == lastK) fSingle = contrib;
  }

  float field = (uShowCurrentOnly == 1)
    ? fSingle
    : clamp(f / float(uLayers), 0.0, 1.0);

  gl_FragColor = vec4(vec3(field), 1.0);
}`;

export const FRAG_B = `varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform float uSwirl;
uniform int   uShowWarp;

void main() {
  vec2 uv = vUv - 0.5;
  uv.x *= uAspect;
  vec2 q = uv * 1.6;

  // Two decorrelated fBm samples give us a 2D displacement vector.
  // Feeding uv through this warp before sampling fBm is "domain warping"
  // - it bends the sample coords, turning smooth blobs into swirls.
  vec2 warp = vec2(
    fbm(q + vec2(uTime * 0.10, 0.0)),
    fbm(q + vec2(0.0, uTime * 0.13) + 17.3)
  ) - 0.5;

  if (uShowWarp == 1) {
    // Visualize the warp vector: red = +x, green = +y.
    gl_FragColor = vec4(warp * 2.0 + 0.5, 0.5, 1.0);
    return;
  }

  vec2 wq = q + warp * uSwirl * 4.0;
  float n = fbm(wq + vec2(uTime * 0.07, -uTime * 0.05));

  gl_FragColor = vec4(vec3(n), 1.0);
}`;

export const FRAG_C = `varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform vec2  uMouse;
uniform float uMouseWarp;
uniform float uRippleMix;
uniform float uBaseMix;
uniform float uRippleSpeed;
uniform float uRippleFreq;
uniform float uSwirl;
uniform int   uLayers;
uniform float uDrift;
uniform float uRound;
uniform int   uShowVignette;

void main() {
  vec2 uv = vUv - 0.5;
  uv.x *= uAspect;

  // Cursor warp - pull coords toward the mouse with gaussian falloff.
  vec2 mp = uMouse - 0.5;
  mp.x *= uAspect;
  vec2 mDelta = uv - mp;
  float mDist = length(mDelta);
  float mPull = exp(-mDist * mDist * 6.0) * uMouseWarp;
  uv += mDelta * mPull;

  // Horizontal drift so the long axis has inherent travel.
  uv.x -= uTime * uDrift * 0.15;

  // (A) Wave field
  vec2 wuv = uv;
  wuv.x *= mix(1.0 / max(uAspect, 0.001), 1.0, uRound);
  float t = uTime * uRippleSpeed * 3.14159;
  float a = atan(wuv.y, wuv.x);
  float d = length(wuv) * 2.0;
  float s1 = -0.1;
  float s2 = s1 + sin(t - d * uRippleFreq * 0.6) * 0.1 + 0.15;
  float f = 0.0;
  for (int k = 0; k < 128; k++) {
    if (k >= uLayers) break;
    float ki = float(k) * (6.2831853 / float(uLayers));
    float v = sin(a*3.0 - t + sin(ki - t)*2.5) * 0.1 * d + (d - ki*0.4);
    float w = fwidth(v);
    f += smoothstep(s1 - w, s2 + w, v);
  }
  float wave = clamp(f / float(uLayers), 0.0, 1.0);

  // (B) Warped fBm
  vec2 q = uv * 1.6;
  vec2 warp = vec2(
    fbm(q + vec2(uTime * 0.10, 0.0)),
    fbm(q + vec2(0.0, uTime * 0.13) + 17.3)
  ) - 0.5;
  vec2 wq = q + warp * uSwirl * 4.0;
  float n = fbm(wq + vec2(uTime * 0.07, -uTime * 0.05));

  // Composite.
  float field = wave * uRippleMix + n * uBaseMix;

  // Soft edge vignette.
  vec2 c = vUv - 0.5; c.x *= uAspect;
  float r = length(c);
  float vign = smoothstep(max(uAspect, 1.0) * 0.55, 0.10, r);
  if (uShowVignette == 1) {
    gl_FragColor = vec4(vec3(vign), 1.0);
    return;
  }
  field *= mix(0.55, 1.0, vign);

  gl_FragColor = vec4(vec3(clamp(field, 0.0, 1.0)), 1.0);
}`;
