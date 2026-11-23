//! Shaders copiados do GLRenderer.java (mesmo céu, nuvens, neblina, luz, sombras do sol e água).

pub const SKY_FUNCS: &str = r#"
uniform vec3 uSun;
uniform vec3 uLightDir;
uniform float uLightStr;
uniform float uDaylight;
uniform vec3 uCam;
uniform float uTime;
uniform float uViewDist;
uniform int uUnderwater;
vec3 skyBase(float dy){ float k = sqrt(clamp(dy,0.0,1.0));
  vec3 hor = mix(vec3(20.0,26.0,48.0)/255.0, vec3(186.0,212.0,246.0)/255.0, uDaylight);
  vec3 zen = mix(vec3(3.0,5.0,14.0)/255.0, vec3(78.0,128.0,228.0)/255.0, uDaylight);
  vec3 c = mix(hor, zen, k);
  float dusk = clamp(1.0 - abs(uSun.y)*3.5, 0.0, 1.0) * (1.0-k);
  return mix(c, vec3(1.0,0.52,0.26), dusk*0.55); }
float hash2(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  float a=hash2(i), b=hash2(i+vec2(1,0)), c=hash2(i+vec2(0,1)), d=hash2(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
float fbm(vec2 p){ float s=0.0,a=1.0,n=0.0; for(int i=0;i<3;i++){ s+=vnoise(p)*a; n+=a; a*=0.5; p*=2.0; } return s/n; }
vec3 skyColor(vec3 d){
  vec3 col = skyBase(d.y);
  if (uDaylight < 0.7 && d.y > 0.0) {
    vec3 p = floor(d*220.0); float h = hash2(p.xy + p.z*17.13);
    if (h > 0.9965) col += vec3(0.85,0.9,1.0) * ((0.7-uDaylight)/0.7) * (h-0.9965)/0.0035; }
  float dt = dot(d, uSun);
  if (dt > 0.9985) col = vec3(1.0,0.97,0.86);
  else if (dt > 0.9) { float g=(dt-0.9)/0.0985; col = mix(col, vec3(1.0,0.82,0.55), g*g*g*0.75); }
  float dm = dot(d, -uSun);
  if (dm > 0.9993) col = vec3(0.92,0.94,1.0);
  else if (dm > 0.995) col += vec3(0.12,0.13,0.16)*(1.0-uDaylight)*(dm-0.995)/0.0043;
  if (d.y > 0.02) { float ct = (110.0-uCam.y)/d.y;
    if (ct > 0.0 && ct < 2500.0) { vec2 c = uCam.xz + d.xz*ct + vec2(uTime*3.0,0.0);
      float n = fbm(c/70.0);
      if (n > 0.55) { float a = min(1.0,(n-0.55)*7.0)*(1.0-ct/2500.0);
        vec3 cl = mix(vec3(1.0), vec3(0.784,0.816,0.863), min(1.0,(n-0.55)*4.0));
        cl *= mix(0.16, 1.0, uDaylight);
        col = mix(col, cl, a*0.92); } } }
  return col; }
vec3 fog(vec3 col, float dist, vec3 dir){
  float fs = uViewDist*0.55; float f = clamp((dist-fs)/(uViewDist-fs),0.0,1.0);
  col = mix(col, skyBase(dir.y), f*(2.0-f));
  if (uUnderwater==1) col = mix(col, vec3(0.063,0.188,0.416)*mix(0.25,1.0,uDaylight), min(0.9, 0.45+dist/30.0));
  return col; }
"#;

pub const BLOCK_VS: &str = r#"#version 330 core
layout(location=0) in uint aA;
layout(location=1) in uint aB;
layout(location=2) in uint aC;
uniform mat4 uViewProj;
uniform mat4 uShadowMat;
uniform vec3 uChunk;
uniform float uWaterDrop;
out vec2 vUV; flat out float vLayer; out float vAO; flat out vec3 vN; out vec3 vWorld; out vec3 vShadow;
out float vSky; out float vBlk; flat out int vFlags;
const vec3 NORMALS[8] = vec3[8](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1),vec3(0,1,0),vec3(0,1,0));
void main(){
  vec3 p = vec3(float(aA & 511u), float((aA>>9u)&2047u), float((aA>>20u)&511u)) / 16.0 - vec3(4.0, 0.0, 4.0) + uChunk;
  uint f = (aC>>10u)&7u; uint occ = (aC>>13u)&3u; uint corner = (aC>>15u)&3u;
  vN = NORMALS[f]; vAO = 1.0 - float(occ)*0.19; vLayer = float((aB & 1023u) | ((aB >> 26u) & 1u) << 10u);
  vSky = float((aB>>10u)&15u)/15.0; vBlk = float((aB>>14u)&15u)/15.0; vFlags = int((aB>>18u)&15u);
  vec2 uv = vec2(float(aC & 31u), float((aC>>5u)&31u)) / 16.0; vUV = vec2(uv.x, 1.0-uv.y);
  uint surf = (aB>>22u)&15u;
  if (uWaterDrop > 0.0 && surf > 0u && (f == 2u || (f != 3u && corner >= 2u)))
    p.y -= uWaterDrop + float(surf - 1u) * 0.105;
  vWorld = p;
  vShadow = (uShadowMat * vec4(p + vN*0.06, 1.0)).xyz;
  gl_Position = uViewProj * vec4(p, 1.0);
}
"#;

pub fn block_fs() -> String {
    format!(
        r#"#version 330 core
in vec2 vUV; flat in float vLayer; in float vAO; flat in vec3 vN; in vec3 vWorld; in vec3 vShadow;
in float vSky; in float vBlk; flat in int vFlags;
uniform sampler2DArray uTex;
uniform sampler2DShadow uShadowMap;
uniform float uAOStr; uniform int uShadows; uniform float uShadowTexel;
out vec4 frag;
{SKY_FUNCS}
float shadowAt(){{
  if (vShadow.x<0.0||vShadow.x>1.0||vShadow.y<0.0||vShadow.y>1.0||vShadow.z>1.0) return 1.0;
  float s = 0.0;
  for (int x=-1;x<=1;x++) for (int y=-1;y<=1;y++)
    s += texture(uShadowMap, vec3(vShadow.xy + vec2(x,y)*uShadowTexel, vShadow.z - 0.0008));
  return s/9.0; }}
void main(){{
  vec4 t = texture(uTex, vec3(vUV, vLayer));
  if (t.a < 0.5) discard;
  vec3 d = vWorld - uCam; float dist = length(d);
  if ((vFlags & 1) != 0) {{ frag = vec4(fog(t.rgb, dist, d/dist), 1.0); return; }}
  bool plant = (vFlags & 2) != 0;
  float ao = plant ? 1.0 : mix(1.0, vAO, uAOStr);
  float ndl = plant ? 0.55 : dot(vN, uLightDir);
  float sun = 0.0;
  if (ndl > 0.0 && uLightStr > 0.0)
    sun = 0.7*ndl*uLightStr*(uShadows==1 ? shadowAt() : 1.0) * smoothstep(0.5, 0.95, vSky);
  float amb = (vN.y > 0.5 ? 0.55 : (vN.y < -0.5 ? 0.30 : 0.42)) * ao * vSky * mix(0.13, 1.0, uDaylight);
  float sa = sun*(0.55+0.45*ao);
  vec3 skyL = vec3(amb*0.88+sa*1.08, amb*0.94+sa, amb*1.10+sa*0.86) * mix(vec3(0.72,0.82,1.2), vec3(1.0), uDaylight);
  float bl = pow(vBlk, 1.5) * 1.05 * (0.6+0.4*ao);
  vec3 torch = vec3(1.0,0.78,0.5) * bl;
  vec3 light = max(skyL, torch) + min(skyL, torch)*0.3;
  vec3 col = min(t.rgb*light, vec3(1.0));
  col = max(col, t.rgb*0.02);
  frag = vec4(fog(col, dist, d/dist), 1.0);
}}
"#
    )
}

pub fn water_fs() -> String {
    format!(
        r#"#version 330 core
in vec2 vUV; flat in float vLayer; in float vAO; flat in vec3 vN; in vec3 vWorld;
in float vSky; in float vBlk; flat in int vFlags;
uniform sampler2DArray uTex;
uniform int uReflect;
out vec4 frag;
{SKY_FUNCS}
void main(){{
  float lit = max(vSky*mix(0.15,1.0,uDaylight), pow(vBlk,1.5)*0.9);
  vec3 base = texture(uTex, vec3(vUV, vLayer)).rgb * 0.85 * lit;
  vec3 d = vWorld - uCam; float dist = length(d); vec3 v = d/dist;
  float fres = 0.0; vec3 col = base;
  if (uReflect==1 && vN.y > 0.5 && uUnderwater==0) {{
    float wave = sin(vWorld.x*1.7+uTime*1.8)*0.05 + sin(vWorld.z*2.3-uTime*1.3)*0.05
               + sin((vWorld.x+vWorld.z)*3.1+uTime*2.6)*0.025;
    vec3 r = normalize(vec3(v.x+wave, abs(v.y), v.z+wave*0.7));
    float m = 1.0-abs(v.y);
    fres = clamp(0.04+0.96*m*m*m*m*m, 0.12, 0.85) * vSky;
    col = mix(base, skyColor(r), fres);
  }}
  frag = vec4(fog(col, dist, v), 0.62 + fres*0.3);
}}
"#
    )
}

pub const FULL_VS: &str = r#"#version 330 core
out vec2 vNdc;
void main(){ vec2 p = vec2(gl_VertexID==1 ? 3.0 : -1.0, gl_VertexID==2 ? 3.0 : -1.0);
  vNdc = p; gl_Position = vec4(p, 0.0, 1.0); }
"#;

pub fn sky_fs() -> String {
    format!(
        r#"#version 330 core
in vec2 vNdc;
uniform vec3 uFwd, uRight, uUp; uniform float uTanX, uTanY;
out vec4 frag;
{SKY_FUNCS}
void main(){{ vec3 d = normalize(uFwd + uRight*vNdc.x*uTanX + uUp*vNdc.y*uTanY);
  vec3 c = skyColor(d);
  if (uUnderwater==1) c = mix(c, vec3(0.063,0.188,0.416)*mix(0.25,1.0,uDaylight), 0.9);
  frag = vec4(c, 1.0); }}
"#
    )
}

/// Mira no meio da tela (um "+" desenhado com retângulos em coordenadas de tela).
pub const CROSSHAIR_VS: &str = r#"#version 330 core
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
"#;
pub const CROSSHAIR_FS: &str = r#"#version 330 core
out vec4 frag;
void main(){ frag = vec4(1.0); }
"#;

/// Contorno do bloco mirado (linhas pretas, meio transparentes).
pub const LINE_VS: &str = r#"#version 330 core
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
void main(){ gl_Position = uViewProj * vec4(aPos, 1.0); }
"#;
pub const LINE_FS: &str = r#"#version 330 core
out vec4 frag;
void main(){ frag = vec4(0.0, 0.0, 0.0, 0.55); }
"#;

pub const SHADOW_VS: &str = r#"#version 330 core
layout(location=0) in uint aA;
layout(location=1) in uint aB;
layout(location=2) in uint aC;
uniform mat4 uLightVP; uniform vec3 uChunk;
out vec2 vUV; flat out float vLayer;
void main(){
  vec3 p = vec3(float(aA & 511u), float((aA>>9u)&2047u), float((aA>>20u)&511u)) / 16.0 - vec3(4.0, 0.0, 4.0) + uChunk;
  vLayer = float((aB & 1023u) | ((aB >> 26u) & 1u) << 10u); vec2 uv = vec2(float(aC & 31u), float((aC>>5u)&31u)) / 16.0; vUV = vec2(uv.x, 1.0-uv.y);
  gl_Position = uLightVP * vec4(p, 1.0); }
"#;

pub const SHADOW_FS: &str = r#"#version 330 core
in vec2 vUV; flat in float vLayer; uniform sampler2DArray uTex;
void main(){ if (texture(uTex, vec3(vUV, vLayer)).a < 0.5) discard; }
"#;
