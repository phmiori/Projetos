import java.nio.IntBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.lwjgl.system.MemoryUtil;

import static org.lwjgl.opengl.GL33C.*;

/**
 * Desenha o mundo com a placa de vídeo (OpenGL 3.3).
 *
 * - O mundo é dividido em pedaços (chunks) de 16x64x16; cada um vira uma malha montada em
 *   segundo plano (Mesher) e enviada à placa uma vez. Mudar um bloco refaz só o pedaço dele.
 * - Shaders fazem luz do sol, sombras (shadow map), oclusão nos cantos, névoa, céu com nuvens
 *   e água com reflexo.
 * - Menus e HUD continuam desenhados em Java2D e entram como uma camada transparente por cima.
 */
final class GLRenderer {
    private static final int SHADOW_SIZE = 2048;
    private static final int MAX_QUADS = 16 * 16 * 64 * 6; // faces por pedaço (sobra até para muitas escadas)
    /**
     * O mundo não tem fim, então a placa de vídeo guarda só uma janela de GRID x GRID pedaços em volta da
     * câmera. Cada pedaço (cx, cz) usa a posição (cx mod GRID, cz mod GRID); quando a câmera anda, as
     * posições dos pedaços que ficaram para trás são reaproveitadas pelos novos.
     */
    private static final int GRID = 64, NCHUNKS = GRID * GRID;

    private static int slot(int cx, int cz) {
        return ((cz & (GRID - 1)) * GRID) + (cx & (GRID - 1));
    }

    // ---------------------------------------------------------------------------------
    // shaders
    // ---------------------------------------------------------------------------------
    private static final String SKY_FUNCS =
            "uniform vec3 uSun;\n" +        // posição do sol (pode estar abaixo do horizonte)
            "uniform vec3 uLightDir;\n" +   // de onde vem a luz que ilumina os blocos (sol ou lua)
            "uniform float uLightStr;\n" +  // força dessa luz
            "uniform float uDaylight;\n" +  // 0 noite, 1 dia
            "uniform vec3 uCam;\n" +
            "uniform float uTime;\n" +
            "uniform float uViewDist;\n" +
            "uniform int uUnderwater;\n" +
            "vec3 skyBase(float dy){ float k = sqrt(clamp(dy,0.0,1.0));\n" +
            "  vec3 hor = mix(vec3(20.0,26.0,48.0)/255.0, vec3(186.0,212.0,246.0)/255.0, uDaylight);\n" +
            "  vec3 zen = mix(vec3(3.0,5.0,14.0)/255.0, vec3(78.0,128.0,228.0)/255.0, uDaylight);\n" +
            "  vec3 c = mix(hor, zen, k);\n" +
            "  float dusk = clamp(1.0 - abs(uSun.y)*3.5, 0.0, 1.0) * (1.0-k);\n" +
            "  return mix(c, vec3(1.0,0.52,0.26), dusk*0.55); }\n" +
            "float hash2(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }\n" +
            "float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);\n" +
            "  float a=hash2(i), b=hash2(i+vec2(1,0)), c=hash2(i+vec2(0,1)), d=hash2(i+vec2(1,1));\n" +
            "  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }\n" +
            "float fbm(vec2 p){ float s=0.0,a=1.0,n=0.0; for(int i=0;i<3;i++){ s+=vnoise(p)*a; n+=a; a*=0.5; p*=2.0; } return s/n; }\n" +
            "vec3 skyColor(vec3 d){\n" +
            "  vec3 col = skyBase(d.y);\n" +
            "  if (uDaylight < 0.7 && d.y > 0.0) {\n" + // estrelas
            "    vec3 p = floor(d*220.0); float h = hash2(p.xy + p.z*17.13);\n" +
            "    if (h > 0.9965) col += vec3(0.85,0.9,1.0) * ((0.7-uDaylight)/0.7) * (h-0.9965)/0.0035; }\n" +
            "  float dt = dot(d, uSun);\n" +
            "  if (dt > 0.9985) col = vec3(1.0,0.97,0.86);\n" +
            "  else if (dt > 0.9) { float g=(dt-0.9)/0.0985; col = mix(col, vec3(1.0,0.82,0.55), g*g*g*0.75); }\n" +
            "  float dm = dot(d, -uSun);\n" +
            "  if (dm > 0.9993) col = vec3(0.92,0.94,1.0);\n" + // lua
            "  else if (dm > 0.995) col += vec3(0.12,0.13,0.16)*(1.0-uDaylight)*(dm-0.995)/0.0043;\n" +
            "  if (d.y > 0.02) { float ct = (110.0-uCam.y)/d.y;\n" +
            "    if (ct > 0.0 && ct < 2500.0) { vec2 c = uCam.xz + d.xz*ct + vec2(uTime*3.0,0.0);\n" +
            "      float n = fbm(c/70.0);\n" +
            "      if (n > 0.55) { float a = min(1.0,(n-0.55)*7.0)*(1.0-ct/2500.0);\n" +
            "        vec3 cl = mix(vec3(1.0), vec3(0.784,0.816,0.863), min(1.0,(n-0.55)*4.0));\n" +
            "        cl *= mix(0.16, 1.0, uDaylight);\n" +
            "        col = mix(col, cl, a*0.92); } } }\n" +
            "  return col; }\n" +
            "vec3 fog(vec3 col, float dist, vec3 dir){\n" +
            "  float fs = uViewDist*0.55; float f = clamp((dist-fs)/(uViewDist-fs),0.0,1.0);\n" +
            "  col = mix(col, skyBase(dir.y), f*(2.0-f));\n" +
            "  if (uUnderwater==1) col = mix(col, vec3(0.063,0.188,0.416)*mix(0.25,1.0,uDaylight), min(0.9, 0.45+dist/30.0));\n" +
            "  return col; }\n";

    private static final String BLOCK_VS =
            "#version 330 core\n" +
            "layout(location=0) in uint aA;\n" +
            "layout(location=1) in uint aB;\n" +
            "layout(location=2) in uint aC;\n" +
            "uniform mat4 uViewProj;\n" +
            "uniform mat4 uShadowMat;\n" +
            "uniform vec3 uChunk;\n" +
            "uniform float uWaterDrop;\n" +
            "out vec2 vUV; flat out float vLayer; out float vAO; flat out vec3 vN; out vec3 vWorld; out vec3 vShadow;\n" +
            "out float vSky; out float vBlk; flat out int vFlags;\n" +
            "const vec3 NORMALS[8] = vec3[8](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1),vec3(0,1,0),vec3(0,1,0));\n" +
            "const vec2 UVS[4] = vec2[4](vec2(0,0),vec2(1,0),vec2(1,1),vec2(0,1));\n" +
            "void main(){\n" +
            "  vec3 p = vec3(float(aA & 511u), float((aA>>9u)&2047u), float((aA>>20u)&511u)) / 16.0 - vec3(4.0, 0.0, 4.0) + uChunk;\n" +
            "  uint f = (aC>>10u)&7u; uint occ = (aC>>13u)&3u; uint corner = (aC>>15u)&3u;\n" +
            "  vN = NORMALS[f]; vAO = 1.0 - float(occ)*0.19; vLayer = float(aB & 1023u);\n" +
            "  vSky = float((aB>>10u)&15u)/15.0; vBlk = float((aB>>14u)&15u)/15.0; vFlags = int((aB>>18u)&15u);\n" +
            "  vec2 uv = vec2(float(aC & 31u), float((aC>>5u)&31u)) / 16.0; vUV = vec2(uv.x, 1.0-uv.y);\n" +
            // água: baixa os cantos de cima conforme o nível (fonte um pouco abaixo, corrente cada vez mais rasa)
            "  uint surf = (aB>>22u)&15u;\n" +
            "  if (uWaterDrop > 0.0 && surf > 0u && (f == 2u || (f != 3u && corner >= 2u)))\n" +
            "    p.y -= uWaterDrop + float(surf - 1u) * 0.105;\n" +
            "  vWorld = p;\n" +
            "  vShadow = (uShadowMat * vec4(p + vN*0.06, 1.0)).xyz;\n" +
            "  gl_Position = uViewProj * vec4(p, 1.0);\n" +
            "}\n";

    private static final String BLOCK_FS =
            "#version 330 core\n" +
            "in vec2 vUV; flat in float vLayer; in float vAO; flat in vec3 vN; in vec3 vWorld; in vec3 vShadow;\n" +
            "in float vSky; in float vBlk; flat in int vFlags;\n" +
            "uniform sampler2DArray uTex;\n" +
            "uniform sampler2DShadow uShadowMap;\n" +
            "uniform float uAOStr; uniform int uShadows; uniform float uShadowTexel;\n" +
            "out vec4 frag;\n" +
            SKY_FUNCS +
            "float shadowAt(){\n" +
            "  if (vShadow.x<0.0||vShadow.x>1.0||vShadow.y<0.0||vShadow.y>1.0||vShadow.z>1.0) return 1.0;\n" +
            "  float s = 0.0;\n" +
            "  for (int x=-1;x<=1;x++) for (int y=-1;y<=1;y++)\n" +
            "    s += texture(uShadowMap, vec3(vShadow.xy + vec2(x,y)*uShadowTexel, vShadow.z - 0.0008));\n" +
            "  return s/9.0; }\n" +
            "void main(){\n" +
            "  vec4 t = texture(uTex, vec3(vUV, vLayer));\n" +
            "  if (t.a < 0.5) discard;\n" +
            "  vec3 d = vWorld - uCam; float dist = length(d);\n" +
            "  if ((vFlags & 1) != 0) { frag = vec4(fog(t.rgb, dist, d/dist), 1.0); return; }\n" + // lava brilha sozinha
            "  bool plant = (vFlags & 2) != 0;\n" +
            "  float ao = plant ? 1.0 : mix(1.0, vAO, uAOStr);\n" +
            "  float ndl = plant ? 0.55 : dot(vN, uLightDir);\n" +
            "  float sun = 0.0;\n" +
            "  if (ndl > 0.0 && uLightStr > 0.0)\n" +
            "    sun = 0.7*ndl*uLightStr*(uShadows==1 ? shadowAt() : 1.0) * smoothstep(0.5, 0.95, vSky);\n" +
            "  float amb = (vN.y > 0.5 ? 0.55 : (vN.y < -0.5 ? 0.30 : 0.42)) * ao * vSky * mix(0.13, 1.0, uDaylight);\n" +
            "  float sa = sun*(0.55+0.45*ao);\n" +
            "  vec3 skyL = vec3(amb*0.88+sa*1.08, amb*0.94+sa, amb*1.10+sa*0.86) * mix(vec3(0.72,0.82,1.2), vec3(1.0), uDaylight);\n" +
            "  float bl = pow(vBlk, 1.5) * 1.05 * (0.6+0.4*ao);\n" +
            "  vec3 torch = vec3(1.0,0.78,0.5) * bl;\n" +
            "  vec3 light = max(skyL, torch) + min(skyL, torch)*0.3;\n" +
            "  vec3 col = min(t.rgb*light, vec3(1.0));\n" +
            "  col = max(col, t.rgb*0.02);\n" +
            "  frag = vec4(fog(col, dist, d/dist), 1.0);\n" +
            "}\n";

    private static final String WATER_FS =
            "#version 330 core\n" +
            "in vec2 vUV; flat in float vLayer; in float vAO; flat in vec3 vN; in vec3 vWorld; in vec3 vShadow;\n" +
            "in float vSky; in float vBlk; flat in int vFlags;\n" +
            "uniform sampler2DArray uTex;\n" +
            "uniform int uReflect;\n" +
            "out vec4 frag;\n" +
            SKY_FUNCS +
            "void main(){\n" +
            "  float lit = max(vSky*mix(0.15,1.0,uDaylight), pow(vBlk,1.5)*0.9);\n" +
            "  vec3 base = texture(uTex, vec3(vUV, vLayer)).rgb * 0.85 * lit;\n" +
            "  vec3 d = vWorld - uCam; float dist = length(d); vec3 v = d/dist;\n" +
            "  float fres = 0.0; vec3 col = base;\n" +
            "  if (uReflect==1 && vN.y > 0.5 && uUnderwater==0) {\n" +
            "    float wave = sin(vWorld.x*1.7+uTime*1.8)*0.05 + sin(vWorld.z*2.3-uTime*1.3)*0.05\n" +
            "               + sin((vWorld.x+vWorld.z)*3.1+uTime*2.6)*0.025;\n" +
            "    vec3 r = normalize(vec3(v.x+wave, abs(v.y), v.z+wave*0.7));\n" +
            "    float m = 1.0-abs(v.y);\n" +
            "    fres = clamp(0.04+0.96*m*m*m*m*m, 0.12, 0.85) * vSky;\n" +
            "    col = mix(base, skyColor(r), fres);\n" +
            "  }\n" +
            "  frag = vec4(fog(col, dist, v), 0.62 + fres*0.3);\n" +
            "}\n";

    private static final String FULL_VS =
            "#version 330 core\n" +
            "out vec2 vNdc;\n" +
            "void main(){ vec2 p = vec2(gl_VertexID==1 ? 3.0 : -1.0, gl_VertexID==2 ? 3.0 : -1.0);\n" +
            "  vNdc = p; gl_Position = vec4(p, 0.0, 1.0); }\n";

    private static final String SKY_FS =
            "#version 330 core\n" +
            "in vec2 vNdc;\n" +
            "uniform vec3 uFwd, uRight, uUp; uniform float uTanX, uTanY;\n" +
            "out vec4 frag;\n" +
            SKY_FUNCS +
            "void main(){ vec3 d = normalize(uFwd + uRight*vNdc.x*uTanX + uUp*vNdc.y*uTanY);\n" +
            "  vec3 c = skyColor(d);\n" +
            "  if (uUnderwater==1) c = mix(c, vec3(0.063,0.188,0.416)*mix(0.25,1.0,uDaylight), 0.9);\n" +
            "  frag = vec4(c, 1.0); }\n";

    private static final String VIGNETTE_FS =
            "#version 330 core\n" +
            "in vec2 vNdc; out vec4 frag;\n" +
            "void main(){ float d = dot(vNdc,vNdc)/2.0; float v = 1.0 - 0.32*d*d - 0.08*d; frag = vec4(v,v,v,1.0); }\n";

    private static final String UI_FS =
            "#version 330 core\n" +
            "in vec2 vNdc; uniform sampler2D uUi; out vec4 frag;\n" +
            "void main(){ frag = texture(uUi, vec2(vNdc.x*0.5+0.5, 0.5-vNdc.y*0.5)); }\n";

    private static final String SHADOW_VS =
            "#version 330 core\n" +
            "layout(location=0) in uint aA;\n" +
            "layout(location=1) in uint aB;\n" +
            "layout(location=2) in uint aC;\n" +
            "uniform mat4 uLightVP; uniform vec3 uChunk;\n" +
            "out vec2 vUV; flat out float vLayer;\n" +
            "const vec2 UVS[4] = vec2[4](vec2(0,0),vec2(1,0),vec2(1,1),vec2(0,1));\n" +
            "void main(){\n" +
            "  vec3 p = vec3(float(aA & 511u), float((aA>>9u)&2047u), float((aA>>20u)&511u)) / 16.0 - vec3(4.0, 0.0, 4.0) + uChunk;\n" +
            "  vLayer = float(aB & 1023u); vec2 uv = vec2(float(aC & 31u), float((aC>>5u)&31u)) / 16.0; vUV = vec2(uv.x, 1.0-uv.y);\n" +
            "  gl_Position = uLightVP * vec4(p, 1.0); }\n";

    private static final String SHADOW_FS =
            "#version 330 core\n" +
            "in vec2 vUV; flat in float vLayer; uniform sampler2DArray uTex;\n" +
            "void main(){ if (texture(uTex, vec3(vUV, vLayer)).a < 0.5) discard; }\n";

    private static final String SIMPLE_VS =
            "#version 330 core\n" +
            "layout(location=0) in vec3 aPos; layout(location=1) in vec3 aN;\n" +
            "uniform mat4 uViewProj; out vec3 vPos; flat out vec3 vN;\n" +
            "void main(){ vPos = aPos; vN = aN; gl_Position = uViewProj * vec4(aPos, 1.0); }\n";

    private static final String SIMPLE_FS =
            "#version 330 core\n" +
            "in vec3 vPos; flat in vec3 vN; uniform vec4 uColor; uniform float uCrack; out vec4 frag;\n" +
            "float h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }\n" +
            "void main(){\n" +
            "  if (uCrack > 0.0) {\n" +
            "    vec2 uv = abs(vN.x) > 0.5 ? vPos.zy : (abs(vN.y) > 0.5 ? vPos.xz : vPos.xy);\n" +
            "    vec2 f = fract(uv); vec2 cell = floor(f*16.0);\n" +
            "    float edge = min(min(f.x,1.0-f.x), min(f.y,1.0-f.y));\n" +
            "    if (h(cell + vN.xy*7.0 + vN.z*13.0) >= uCrack*0.75 - edge*0.4) discard;\n" +
            "  }\n" +
            "  frag = uColor; }\n";

    /** Criaturas: triângulos coloridos (cor e luz já calculadas no processador), com névoa. */
    private static final String ENTITY_VS =
            "#version 330 core\n" +
            "layout(location=0) in vec3 aPos; layout(location=1) in vec3 aColor;\n" +
            "uniform mat4 uViewProj; out vec3 vColor; out vec3 vWorld;\n" +
            "void main(){ vColor = aColor; vWorld = aPos; gl_Position = uViewProj * vec4(aPos, 1.0); }\n";

    private static final String ENTITY_FS =
            "#version 330 core\n" +
            "in vec3 vColor; in vec3 vWorld; out vec4 frag;\n" +
            SKY_FUNCS +
            "void main(){ vec3 d = vWorld - uCam; float dist = length(d);\n" +
            "  frag = vec4(fog(vColor, dist, d/max(dist,0.001)), 1.0); }\n";

    // ---------------------------------------------------------------------------------
    // estado
    // ---------------------------------------------------------------------------------
    private int blockProg, waterProg, skyProg, vignetteProg, uiProg, shadowProg, simpleProg, entityProg;
    private int emptyVao, ebo, texArray, shadowFbo, shadowTex, uiTex, uiW, uiH;
    private int simpleVao, simpleVbo, entityVao, entityVbo, entityCap;

    // sol, lua e luz do quadro (dependem da hora do dia do mundo)
    private float sunX, sunY, sunZ, lightX, lightY, lightZ, lightStr, daylight;

    /** Triângulos das criaturas deste quadro: x,y,z, r,g,b por vértice (preenchido pelo jogo). */
    float[] entityVerts = new float[0];
    int entityVertCount;

    /** Mão em primeira pessoa (coordenadas da câmera), desenhada por cima de tudo. */
    float[] handVerts = new float[0];
    int handVertCount;
    private int handVao, handVbo, handCap;
    private int[][] uploadedTex;
    private int texSize;

    private World world;
    private int generation;
    private final int[] opaqueVao = new int[NCHUNKS], opaqueVbo = new int[NCHUNKS], opaqueQuads = new int[NCHUNKS];
    private final int[] waterVao = new int[NCHUNKS], waterVbo = new int[NCHUNKS], waterQuads = new int[NCHUNKS];
    private final int[] wantVersion = new int[NCHUNKS], haveVersion = new int[NCHUNKS];
    private final int[] slotCx = new int[NCHUNKS], slotCz = new int[NCHUNKS]; // que pedaço ocupa cada posição
    private final long[] inFlightId = new long[NCHUNKS]; // 0 = não está sendo montado
    private long nextTaskId = 1;
    private int inFlightCount;
    private final ExecutorService meshPool;
    private final int meshThreads;
    private final ConcurrentLinkedQueue<Object[]> results = new ConcurrentLinkedQueue<>();

    // configurações
    private float viewDist = 96, fovDeg = 70;
    private boolean shadows = true, reflections = true, aoOn = true;

    // câmera do quadro
    private final float[] viewProj = new float[16], shadowMat = new float[16], lightVP = new float[16];
    private final float[][] planes = new float[6][4];
    private float camX, camY, camZ;

    double breakProgress;

    GLRenderer() {
        meshThreads = Math.max(1, Runtime.getRuntime().availableProcessors() - 2);
        meshPool = Executors.newFixedThreadPool(meshThreads, r -> {
            Thread t = new Thread(r, "malhas");
            t.setDaemon(true);
            t.setPriority(Thread.NORM_PRIORITY - 1);
            return t;
        });

        blockProg = program(BLOCK_VS, BLOCK_FS);
        waterProg = program(BLOCK_VS, WATER_FS);
        skyProg = program(FULL_VS, SKY_FS);
        vignetteProg = program(FULL_VS, VIGNETTE_FS);
        uiProg = program(FULL_VS, UI_FS);
        shadowProg = program(SHADOW_VS, SHADOW_FS);
        simpleProg = program(SIMPLE_VS, SIMPLE_FS);
        entityProg = program(ENTITY_VS, ENTITY_FS);

        emptyVao = glGenVertexArrays();
        entityVao = glGenVertexArrays();
        entityVbo = glGenBuffers();
        glBindVertexArray(entityVao);
        glBindBuffer(GL_ARRAY_BUFFER, entityVbo);
        glVertexAttribPointer(0, 3, GL_FLOAT, false, 24, 0);
        glEnableVertexAttribArray(0);
        glVertexAttribPointer(1, 3, GL_FLOAT, false, 24, 12);
        glEnableVertexAttribArray(1);
        handVao = glGenVertexArrays();
        handVbo = glGenBuffers();
        glBindVertexArray(handVao);
        glBindBuffer(GL_ARRAY_BUFFER, handVbo);
        glVertexAttribPointer(0, 3, GL_FLOAT, false, 24, 0);
        glEnableVertexAttribArray(0);
        glVertexAttribPointer(1, 3, GL_FLOAT, false, 24, 12);
        glEnableVertexAttribArray(1);
        glBindVertexArray(0);

        // índices compartilhados: cada face = 2 triângulos (0,1,2, 2,3,0)
        IntBuffer idx = MemoryUtil.memAllocInt(MAX_QUADS * 6);
        for (int q = 0; q < MAX_QUADS; q++) {
            int b = q * 4;
            idx.put(b).put(b + 1).put(b + 2).put(b + 2).put(b + 3).put(b);
        }
        idx.flip();
        ebo = glGenBuffers();
        glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo);
        glBufferData(GL_ELEMENT_ARRAY_BUFFER, idx, GL_STATIC_DRAW);
        MemoryUtil.memFree(idx);

        // mapa de sombras
        shadowTex = glGenTextures();
        glBindTexture(GL_TEXTURE_2D, shadowTex);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0, GL_DEPTH_COMPONENT, GL_FLOAT, (java.nio.ByteBuffer) null);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_COMPARE_MODE, GL_COMPARE_REF_TO_TEXTURE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_COMPARE_FUNC, GL_LEQUAL);
        shadowFbo = glGenFramebuffers();
        glBindFramebuffer(GL_FRAMEBUFFER, shadowFbo);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, shadowTex, 0);
        glDrawBuffer(GL_NONE);
        glReadBuffer(GL_NONE);
        glBindFramebuffer(GL_FRAMEBUFFER, 0);

        // geometria do contorno / rachaduras do bloco mirado
        simpleVao = glGenVertexArrays();
        simpleVbo = glGenBuffers();
        glBindVertexArray(simpleVao);
        glBindBuffer(GL_ARRAY_BUFFER, simpleVbo);
        glBufferData(GL_ARRAY_BUFFER, 64 * 6 * 4, GL_DYNAMIC_DRAW);
        glVertexAttribPointer(0, 3, GL_FLOAT, false, 24, 0);
        glEnableVertexAttribArray(0);
        glVertexAttribPointer(1, 3, GL_FLOAT, false, 24, 12);
        glEnableVertexAttribArray(1);
        glBindVertexArray(0);

        texArray = glGenTextures();
        uiTex = glGenTextures();
    }

    // ---------------------------------------------------------------------------------
    // mundo e pedaços
    // ---------------------------------------------------------------------------------
    void setWorld(World w) {
        if (w == world) return;
        world = w;
        shadowDirty = true;
        generation++;
        for (int i = 0; i < NCHUNKS; i++) {
            deleteChunk(i);
            slotCx[i] = slotCz[i] = Integer.MIN_VALUE;
            wantVersion[i] = 0;
            haveVersion[i] = 0;
            inFlightId[i] = 0;
        }
        inFlightCount = 0;
        results.clear();
    }

    /** Esvazia uma posição: apaga a malha da placa de vídeo e esquece o pedaço. */
    private void releaseSlot(int s) {
        deleteChunk(s);
        slotCx[s] = slotCz[s] = Integer.MIN_VALUE;
        wantVersion[s] = haveVersion[s] = 0;
        if (inFlightId[s] != 0) { inFlightId[s] = 0; inFlightCount--; }
    }

    private void deleteChunk(int i) {
        if (opaqueVao[i] != 0) { glDeleteVertexArrays(opaqueVao[i]); glDeleteBuffers(opaqueVbo[i]); }
        if (waterVao[i] != 0) { glDeleteVertexArrays(waterVao[i]); glDeleteBuffers(waterVbo[i]); }
        opaqueVao[i] = opaqueVbo[i] = opaqueQuads[i] = 0;
        waterVao[i] = waterVbo[i] = waterQuads[i] = 0;
    }

    /** Quantos pedaços perto da câmera ainda faltam carregar (para a tela de carregamento). */
    int pendingNear(double x, double z, double radius) {
        int n = 0, r = (int) Math.ceil(radius / 16) + 1;
        int pcx = (int) Math.floor(x / 16), pcz = (int) Math.floor(z / 16);
        for (int dx = -r; dx <= r; dx++)
            for (int dz = -r; dz <= r; dz++) {
                int cx = pcx + dx, cz = pcz + dz;
                double ddx = cx * 16 + 8 - x, ddz = cz * 16 + 8 - z;
                if (Math.sqrt(ddx * ddx + ddz * ddz) >= radius) continue;
                int s = slot(cx, cz);
                if (slotCx[s] != cx || slotCz[s] != cz || haveVersion[s] == 0) n++;
            }
        return n;
    }

    private double chunkDist(int i, double x, double z) {
        double cx = slotCx[i] * 16.0 + 8 - x, cz = slotCz[i] * 16.0 + 8 - z;
        return Math.sqrt(cx * cx + cz * cz);
    }

    private void updateChunks(double px, double pz) {
        // blocos mudados pelo jogador: refaz já, nesta thread, para a mudança aparecer no mesmo quadro
        if (world.anyDirty) {
            for (long k : world.takeDirty()) {
                int cx = World.ckeyX(k), cz = World.ckeyZ(k), s = slot(cx, cz);
                if (slotCx[s] != cx || slotCz[s] != cz) continue; // fora da janela: não tem malha
                wantVersion[s]++;
                if (haveVersion[s] != 0) {
                    Mesher.Mesh m = Mesher.build(world, cx, cz, wantVersion[s]);
                    if (m != null) upload(m);
                }
            }
            // mudanças sem pressa (a luz que veio de um pedaço novo): as threads de malha refazem, a malha velha fica até lá
            for (long k : world.takeLazyDirty()) {
                int cx = World.ckeyX(k), cz = World.ckeyZ(k), s = slot(cx, cz);
                if (slotCx[s] == cx && slotCz[s] == cz) wantVersion[s]++;
            }
        }

        // resultados prontos das threads de malha
        long budget = System.nanoTime() + 4_000_000L;
        Object[] r;
        while (System.nanoTime() < budget && (r = results.poll()) != null) {
            int gen = (Integer) r[0], s = (Integer) r[3];
            Mesher.Mesh m = (Mesher.Mesh) r[1];
            long id = (Long) r[2];
            if (gen != generation || inFlightId[s] != id) continue; // mundo trocado, ou a posição já é de outro pedaço
            inFlightId[s] = 0;
            inFlightCount--;
            if (m != null && slotCx[s] == m.cx && slotCz[s] == m.cz && m.version == wantVersion[s]) upload(m);
        }

        // a janela de pedaços em volta da câmera: o que ficou para trás sai, o que chegou perto entra
        double limit = viewDist + 24;
        int R = Math.min(GRID / 2 - 1, (int) Math.ceil(limit / 16) + 1);
        int pcx = (int) Math.floor(px / 16), pcz = (int) Math.floor(pz / 16);
        for (int s = 0; s < NCHUNKS; s++) {
            if (slotCx[s] == Integer.MIN_VALUE) continue;
            double dx = slotCx[s] - pcx, dz = slotCz[s] - pcz;
            if (dx * dx + dz * dz > (R + 1.0) * (R + 1.0)) releaseSlot(s);
        }

        // agenda os pedaços que faltam, do mais perto para o mais longe
        int free = meshThreads * 2 - inFlightCount;
        List<double[]> todo = new ArrayList<>();
        for (int dx = -R; dx <= R; dx++)
            for (int dz = -R; dz <= R; dz++) {
                int cx = pcx + dx, cz = pcz + dz;
                double ddx = cx * 16 + 8 - px, ddz = cz * 16 + 8 - pz;
                double d = Math.sqrt(ddx * ddx + ddz * ddz);
                if (d >= limit) continue;
                int s = slot(cx, cz);
                if (slotCx[s] != cx || slotCz[s] != cz) {
                    if (slotCx[s] != Integer.MIN_VALUE) releaseSlot(s);
                    slotCx[s] = cx;
                    slotCz[s] = cz;
                    wantVersion[s] = 1;
                    haveVersion[s] = 0;
                }
                if (free <= 0 || inFlightId[s] != 0 || haveVersion[s] == wantVersion[s]) continue;
                if (!world.neighborsLoaded(cx, cz)) continue; // a malha precisa dos 8 vizinhos
                todo.add(new double[] { d, s });
            }
        if (free <= 0 || todo.isEmpty()) return;
        todo.sort((a, b) -> Double.compare(a[0], b[0]));
        final World w = world;
        final int gen = generation;
        for (int k = 0; k < todo.size() && k < free; k++) {
            final int s = (int) todo.get(k)[1];
            final int cx = slotCx[s], cz = slotCz[s], ver = wantVersion[s];
            final long id = nextTaskId++;
            inFlightId[s] = id;
            inFlightCount++;
            meshPool.submit(() -> {
                Mesher.Mesh m = null;
                try {
                    m = Mesher.build(w, cx, cz, ver);
                } catch (RuntimeException e) {
                    e.printStackTrace();
                }
                results.add(new Object[] { gen, m, id, s });
            });
        }
    }

    private void upload(Mesher.Mesh m) {
        // o mapa de sombras só precisa ser refeito se o pedaço está dentro da área que ele cobre
        double sdx = m.cx * 16 + 8 - shCx, sdz = m.cz * 16 + 8 - shCz, sr = shR * 1.5 + 23;
        if (!shadowValid || sdx * sdx + sdz * sdz <= sr * sr) shadowDirty = true;
        int i = slot(m.cx, m.cz);
        haveVersion[i] = m.version;
        int[] vao = { opaqueVao[i], waterVao[i] }, vbo = { opaqueVbo[i], waterVbo[i] };
        int[][] data = { m.opaque, m.water };
        int[] counts = { m.opaqueCount, m.waterCount };
        for (int k = 0; k < 2; k++) {
            int n = counts[k];
            if (n == 0) {
                if (vao[k] != 0) { glDeleteVertexArrays(vao[k]); glDeleteBuffers(vbo[k]); vao[k] = vbo[k] = 0; }
            } else {
                if (vao[k] == 0) {
                    vao[k] = glGenVertexArrays();
                    vbo[k] = glGenBuffers();
                    glBindVertexArray(vao[k]);
                    glBindBuffer(GL_ARRAY_BUFFER, vbo[k]);
                    glVertexAttribIPointer(0, 1, GL_UNSIGNED_INT, 12, 0); // posição (1/16 de bloco)
                    glEnableVertexAttribArray(0);
                    glVertexAttribIPointer(1, 1, GL_UNSIGNED_INT, 12, 4); // textura, luz, marcas
                    glEnableVertexAttribArray(1);
                    glVertexAttribIPointer(2, 1, GL_UNSIGNED_INT, 12, 8); // u, v, face, oclusão, canto
                    glEnableVertexAttribArray(2);
                    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo);
                    glBindVertexArray(0);
                }
                IntBuffer buf = MemoryUtil.memAllocInt(n);
                buf.put(data[k], 0, n).flip();
                glBindBuffer(GL_ARRAY_BUFFER, vbo[k]);
                glBufferData(GL_ARRAY_BUFFER, buf, GL_STATIC_DRAW);
                MemoryUtil.memFree(buf);
            }
        }
        opaqueVao[i] = vao[0]; opaqueVbo[i] = vbo[0]; opaqueQuads[i] = Math.min(MAX_QUADS, m.opaqueCount / 12);
        waterVao[i] = vao[1]; waterVbo[i] = vbo[1]; waterQuads[i] = Math.min(MAX_QUADS, m.waterCount / 12);
    }

    // ---------------------------------------------------------------------------------
    // configurações e texturas
    // ---------------------------------------------------------------------------------
    void configure(Settings s) {
        viewDist = s.viewDist;
        fovDeg = s.fov;
        shadows = s.shadows;
        reflections = s.reflections;
        aoOn = s.ao;
        int[][] t = Textures.get(s.texSize());
        if (t != uploadedTex) uploadTextures(t, s.texSize());
    }

    /** Envia as 36 texturas (12 blocos x 3 faces) como um "texture array", com mipmaps feitos à mão. */
    private void uploadTextures(int[][] tex, int size) {
        uploadedTex = tex;
        texSize = size;
        int layers = tex.length;
        glBindTexture(GL_TEXTURE_2D_ARRAY, texArray);
        int levels = Integer.numberOfTrailingZeros(size) + 1;
        int[][] cur = new int[layers][];
        for (int l = 0; l < layers; l++) cur[l] = tex[l];
        int s = size;
        for (int level = 0; level < levels; level++) {
            IntBuffer buf = MemoryUtil.memAllocInt(s * s * layers);
            for (int l = 0; l < layers; l++) buf.put(cur[l], 0, s * s);
            buf.flip();
            glTexImage3D(GL_TEXTURE_2D_ARRAY, level, GL_RGBA8, s, s, layers, 0, GL_BGRA, GL_UNSIGNED_INT_8_8_8_8_REV, buf);
            MemoryUtil.memFree(buf);
            if (s == 1) break;
            int ns = s / 2;
            for (int l = 0; l < layers; l++) {
                int sh = Block.shape(l / 6);
                cur[l] = downsample(cur[l], s, sh == Block.CUTOUT || sh == Block.CROSS);
            }
            s = ns;
        }
        glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MAX_LEVEL, levels - 1);
        glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MIN_FILTER, GL_NEAREST_MIPMAP_LINEAR);
        glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    }

    /** Reduz pela metade. Nas folhas, mantém os buracos nítidos (senão as árvores somem de longe). */
    private static int[] downsample(int[] src, int s, boolean cutout) {
        int ns = s / 2;
        int[] out = new int[ns * ns];
        for (int y = 0; y < ns; y++)
            for (int x = 0; x < ns; x++) {
                int a = 0, r = 0, g = 0, b = 0, opaque = 0;
                for (int k = 0; k < 4; k++) {
                    int c = src[(y * 2 + (k >> 1)) * s + x * 2 + (k & 1)];
                    if ((c >>> 24) < 128) continue;
                    opaque++;
                    r += (c >> 16) & 255; g += (c >> 8) & 255; b += c & 255;
                }
                if (opaque == 0 || (cutout && opaque < 2)) { out[y * ns + x] = 0; continue; }
                out[y * ns + x] = 0xFF000000 | (r / opaque) << 16 | (g / opaque) << 8 | (b / opaque);
            }
        return out;
    }

    // ---------------------------------------------------------------------------------
    // desenho
    // ---------------------------------------------------------------------------------
    void render(Player cam, int[] sel, double time, int w, int h, boolean crosshair) {
        lastW = w;
        lastH = h;
        updateChunks(cam.x, cam.z);

        camX = (float) cam.x; camY = (float) (cam.y + Player.EYE); camZ = (float) cam.z;
        float cy = (float) Math.cos(cam.yaw), sy = (float) Math.sin(cam.yaw);
        float cp = (float) Math.cos(cam.pitch), sp = (float) Math.sin(cam.pitch);
        float fx = sy * cp, fy = sp, fz = cy * cp;
        float rx = -cy, rz = sy;                    // direita = frente x cima
        float ux = -sp * sy, uy = cp, uz = -sp * cy; // cima da câmera
        // (cima = direita x frente, conferido: com pitch 0 dá (0,1,0))
        float tanY = (float) Math.tan(Math.toRadians(fovDeg) / 2), tanX = tanY * w / (float) h;
        float[] view = Mat.view(camX, camY, camZ, rx, 0, rz, ux, uy, uz, fx, fy, fz);
        float[] proj = Mat.perspective(tanX, tanY, 0.05f, viewDist + 40);
        Mat.mul(proj, view, viewProj);
        Mat.frustumPlanes(viewProj, planes);
        boolean underwater = world.get((int) Math.floor(camX), (int) Math.floor(camY), (int) Math.floor(camZ)) == Block.WATER || Block.isWater(world.get((int) Math.floor(camX), (int) Math.floor(camY), (int) Math.floor(camZ)));

        // sol e lua: o sol dá a volta no céu ao longo do dia
        double ang = world.time / World.DAY_LENGTH * Math.PI * 2;
        double sx0 = Math.cos(ang) * 0.92, sy0 = Math.sin(ang), sz0 = 0.38;
        double sl = Math.sqrt(sx0 * sx0 + sy0 * sy0 + sz0 * sz0);
        sunX = (float) (sx0 / sl); sunY = (float) (sy0 / sl); sunZ = (float) (sz0 / sl);
        daylight = (float) world.daylight();
        if (sunY > 0.02f) { // de dia a luz vem do sol
            lightX = sunX; lightY = sunY; lightZ = sunZ;
            lightStr = Math.min(1f, (sunY - 0.02f) / 0.25f);
        } else {            // de noite, fraca, da lua (do lado oposto)
            lightX = -sunX; lightY = -sunY; lightZ = -sunZ;
            lightStr = 0.16f * Math.min(1f, Math.max(0f, (-sunY - 0.02f) / 0.2f));
        }
        boolean castShadows = shadows && lightY > 0.1f && lightStr > 0.05f;

        if (castShadows) shadowPass();

        glBindFramebuffer(GL_FRAMEBUFFER, 0);
        glViewport(0, 0, w, h);
        glClearColor(0, 0, 0, 1);
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        // céu
        glDisable(GL_DEPTH_TEST);
        glDepthMask(false);
        glDisable(GL_BLEND);
        glUseProgram(skyProg);
        skyUniforms(skyProg, time, underwater);
        glUniform3f(loc(skyProg, "uFwd"), fx, fy, fz);
        glUniform3f(loc(skyProg, "uRight"), rx, 0, rz);
        glUniform3f(loc(skyProg, "uUp"), ux, uy, uz);
        glUniform1f(loc(skyProg, "uTanX"), tanX);
        glUniform1f(loc(skyProg, "uTanY"), tanY);
        glBindVertexArray(emptyVao);
        glDrawArrays(GL_TRIANGLES, 0, 3);

        // blocos opacos
        glEnable(GL_DEPTH_TEST);
        glDepthFunc(GL_LEQUAL);
        glDepthMask(true);
        glEnable(GL_CULL_FACE);
        glCullFace(GL_BACK);
        glUseProgram(blockProg);
        skyUniforms(blockProg, time, underwater);
        glUniformMatrix4fv(loc(blockProg, "uViewProj"), false, viewProj);
        glUniformMatrix4fv(loc(blockProg, "uShadowMat"), false, shadowMat);
        glUniform1i(loc(blockProg, "uTex"), 0);
        glUniform1i(loc(blockProg, "uShadowMap"), 1);
        glUniform1f(loc(blockProg, "uAOStr"), aoOn ? 1f : 0f);
        glUniform1i(loc(blockProg, "uShadows"), castShadows ? 1 : 0);
        glUniform1f(loc(blockProg, "uShadowTexel"), 1f / SHADOW_SIZE);
        glUniform1f(loc(blockProg, "uWaterDrop"), 0f);
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D_ARRAY, texArray);
        glActiveTexture(GL_TEXTURE1);
        glBindTexture(GL_TEXTURE_2D, shadowTex);
        glActiveTexture(GL_TEXTURE0);
        int uChunk = loc(blockProg, "uChunk");
        List<Integer> visibleWater = new ArrayList<>();
        for (int i = 0; i < NCHUNKS; i++) {
            if ((opaqueQuads[i] == 0 && waterQuads[i] == 0) || !chunkVisible(i)) continue;
            if (waterQuads[i] > 0) visibleWater.add(i);
            if (opaqueQuads[i] == 0) continue;
            glUniform3f(uChunk, slotCx[i] * 16, 0, slotCz[i] * 16);
            glBindVertexArray(opaqueVao[i]);
            glDrawElements(GL_TRIANGLES, opaqueQuads[i] * 6, GL_UNSIGNED_INT, 0);
        }

        // criaturas
        if (entityVertCount > 0) {
            glUseProgram(entityProg);
            skyUniforms(entityProg, time, underwater);
            glUniformMatrix4fv(loc(entityProg, "uViewProj"), false, viewProj);
            glBindVertexArray(entityVao);
            glBindBuffer(GL_ARRAY_BUFFER, entityVbo);
            int floats = entityVertCount * 6;
            if (floats > entityCap) {
                entityCap = Math.max(floats, entityCap * 2);
                glBufferData(GL_ARRAY_BUFFER, (long) entityCap * 4, GL_DYNAMIC_DRAW);
            }
            glBufferSubData(GL_ARRAY_BUFFER, 0, scratch(entityVerts, floats));
            glDisable(GL_CULL_FACE);
            glDrawArrays(GL_TRIANGLES, 0, entityVertCount);
            glEnable(GL_CULL_FACE);
        }

        // bloco mirado: rachaduras e contorno
        if (sel != null) drawSelection(sel);

        // água (transparente, de trás para frente)
        visibleWater.sort((a, b) -> Double.compare(chunkDist(b, camX, camZ), chunkDist(a, camX, camZ)));
        glEnable(GL_BLEND);
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        glDepthMask(false);
        glDisable(GL_CULL_FACE);
        glUseProgram(waterProg);
        skyUniforms(waterProg, time, underwater);
        glUniformMatrix4fv(loc(waterProg, "uViewProj"), false, viewProj);
        glUniformMatrix4fv(loc(waterProg, "uShadowMat"), false, shadowMat);
        glUniform1i(loc(waterProg, "uTex"), 0);
        glUniform1i(loc(waterProg, "uReflect"), reflections ? 1 : 0);
        glUniform1f(loc(waterProg, "uWaterDrop"), 0.12f);
        int wChunk = loc(waterProg, "uChunk");
        for (int i : visibleWater) {
            glUniform3f(wChunk, slotCx[i] * 16, 0, slotCz[i] * 16);
            glBindVertexArray(waterVao[i]);
            glDrawElements(GL_TRIANGLES, waterQuads[i] * 6, GL_UNSIGNED_INT, 0);
        }
        glDepthMask(true);

        // mão em primeira pessoa: profundidade limpa, câmera própria (não atravessa paredes)
        if (handVertCount > 0) {
            glClear(GL_DEPTH_BUFFER_BIT);
            glEnable(GL_DEPTH_TEST);
            glDisable(GL_BLEND);
            glDisable(GL_CULL_FACE);
            glUseProgram(entityProg);
            skyUniforms(entityProg, time, underwater);
            glUniform3f(loc(entityProg, "uCam"), 0, 0, 0); // vértices já estão na câmera: sem névoa
            float ht = (float) Math.tan(Math.toRadians(70) / 2);
            glUniformMatrix4fv(loc(entityProg, "uViewProj"), false, Mat.perspective(ht * w / (float) h, ht, 0.01f, 10f));
            glBindVertexArray(handVao);
            glBindBuffer(GL_ARRAY_BUFFER, handVbo);
            int floats = handVertCount * 6;
            if (floats > handCap) {
                handCap = Math.max(floats, handCap * 2);
                glBufferData(GL_ARRAY_BUFFER, (long) handCap * 4, GL_DYNAMIC_DRAW);
            }
            glBufferSubData(GL_ARRAY_BUFFER, 0, scratch(handVerts, floats));
            glDrawArrays(GL_TRIANGLES, 0, handVertCount);
            glEnable(GL_CULL_FACE);
        }

        // vinheta (escurece as bordas multiplicando a imagem)
        glDisable(GL_DEPTH_TEST);
        glEnable(GL_BLEND);
        glBlendFunc(GL_ZERO, GL_SRC_COLOR);
        glUseProgram(vignetteProg);
        glBindVertexArray(emptyVao);
        glDrawArrays(GL_TRIANGLES, 0, 3);

        if (crosshair) drawCrosshair(w, h);
        glBindVertexArray(0);
    }

    private int lastW = 1, lastH = 1;

    private java.nio.FloatBuffer scratchBuf;

    /** Os primeiros n floats de data num buffer reaproveitado (sem criar um vetor novo a cada quadro). */
    private java.nio.FloatBuffer scratch(float[] data, int n) {
        if (scratchBuf == null || scratchBuf.capacity() < n) {
            if (scratchBuf != null) MemoryUtil.memFree(scratchBuf);
            scratchBuf = MemoryUtil.memAllocFloat(Math.max(n, 16384) * 2);
        }
        scratchBuf.clear();
        scratchBuf.put(data, 0, n).flip();
        return scratchBuf;
    }

    /** Ponto do mundo -> pixel na tela (do último quadro desenhado), ou null se estiver atrás da câmera. */
    float[] project(double x, double y, double z) {
        float[] m = viewProj;
        double cx = m[0] * x + m[4] * y + m[8] * z + m[12];
        double cy = m[1] * x + m[5] * y + m[9] * z + m[13];
        double cw = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (cw <= 0.05) return null;
        double nx = cx / cw, ny = cy / cw;
        if (nx < -1.2 || nx > 1.2 || ny < -1.2 || ny > 1.2) return null;
        return new float[] { (float) ((nx * 0.5 + 0.5) * lastW), (float) ((0.5 - ny * 0.5) * lastH) };
    }

    private void skyUniforms(int prog, double time, boolean underwater) {
        glUniform3f(loc(prog, "uSun"), sunX, sunY, sunZ);
        glUniform3f(loc(prog, "uLightDir"), lightX, lightY, lightZ);
        glUniform1f(loc(prog, "uLightStr"), lightStr);
        glUniform1f(loc(prog, "uDaylight"), daylight);
        glUniform3f(loc(prog, "uCam"), camX, camY, camZ);
        glUniform1f(loc(prog, "uTime"), (float) time);
        glUniform1f(loc(prog, "uViewDist"), viewDist);
        glUniform1i(loc(prog, "uUnderwater"), underwater ? 1 : 0);
    }

    /** Desenha a profundidade vista do sol, numa região em volta da câmera. */
    // cache do mapa de sombras: ele só é redesenhado quando o sol andou um pouco, a câmera saiu da
    // região coberta ou algum pedaço do mundo mudou (antes era redesenhado inteiro a cada quadro)
    private static final boolean NO_SHADOW_CACHE = System.getProperty("bench.nocache") != null; // só para comparar
    private boolean shadowDirty = true, shadowValid;
    private float shLightX, shLightY, shLightZ, shCx, shCy, shCz, shR;

    private void shadowPass() {
        float R = Math.max(48, Math.min(112, viewDist));
        // enquanto o sol quase não andou, continua usando a direção do último desenho
        boolean force = shadowDirty || !shadowValid || R != shR || NO_SHADOW_CACHE
                || lightX * shLightX + lightY * shLightY + lightZ * shLightZ < 0.999997f;
        float lx = force ? lightX : shLightX, ly = force ? lightY : shLightY, lz = force ? lightZ : shLightZ;
        // direção da luz e base ortogonal
        float fx = -lx, fy = -ly, fz = -lz;
        float rx = -fz, rz = fx; // frente x (0,1,0)
        float rl = (float) Math.sqrt(rx * rx + rz * rz);
        rx /= rl; rz /= rl;
        float ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy; // direita x frente
        // centro "grudado" na grade de texels para a sombra não tremer ao andar
        // (a grade é de ~4 blocos, múltipla do texel: andando, o mapa é refeito só de vez em quando)
        float texel = 2 * R / SHADOW_SIZE;
        float step = texel * Math.max(1, Math.round(4 / texel));
        float cr = camX * rx + camZ * rz, cu = camX * ux + camY * uy + camZ * uz;
        float sr = (float) Math.floor(cr / step) * step - cr, su = (float) Math.floor(cu / step) * step - cu;
        float cx = camX + sr * rx + su * ux, cyy = camY + su * uy, cz = camZ + sr * rz + su * uz;
        if (!force && Math.abs(cx - shCx) + Math.abs(cyy - shCy) + Math.abs(cz - shCz) < 0.01f) return; // o mapa atual ainda serve
        shadowDirty = false;
        shadowValid = true;
        shLightX = lx; shLightY = ly; shLightZ = lz;
        shCx = cx; shCy = cyy; shCz = cz; shR = R;
        float dist = 160;
        float ex = cx - fx * dist, ey = cyy - fy * dist, ez = cz - fz * dist;
        float[] view = Mat.view(ex, ey, ez, rx, 0, rz, ux, uy, uz, fx, fy, fz);
        float[] proj = Mat.ortho(-R, R, -R, R, 1, dist * 2);
        Mat.mul(proj, view, lightVP);
        float[] bias = { 0.5f, 0, 0, 0, 0, 0.5f, 0, 0, 0, 0, 0.5f, 0, 0.5f, 0.5f, 0.5f, 1 };
        Mat.mul(bias, lightVP, shadowMat);

        glBindFramebuffer(GL_FRAMEBUFFER, shadowFbo);
        glViewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
        glClear(GL_DEPTH_BUFFER_BIT);
        glEnable(GL_DEPTH_TEST);
        glDepthFunc(GL_LEQUAL);
        glDepthMask(true);
        glDisable(GL_CULL_FACE);
        glDisable(GL_BLEND);
        glEnable(GL_POLYGON_OFFSET_FILL);
        glPolygonOffset(1.5f, 3f);
        glUseProgram(shadowProg);
        glUniformMatrix4fv(loc(shadowProg, "uLightVP"), false, lightVP);
        glUniform1i(loc(shadowProg, "uTex"), 0);
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D_ARRAY, texArray);
        int uChunk = loc(shadowProg, "uChunk");
        for (int i = 0; i < NCHUNKS; i++) {
            if (opaqueQuads[i] == 0 || chunkDist(i, cx, cz) > R * 1.5 + 23) continue;
            glUniform3f(uChunk, slotCx[i] * 16, 0, slotCz[i] * 16);
            glBindVertexArray(opaqueVao[i]);
            glDrawElements(GL_TRIANGLES, opaqueQuads[i] * 6, GL_UNSIGNED_INT, 0);
        }
        glDisable(GL_POLYGON_OFFSET_FILL);
    }

    private boolean chunkVisible(int i) {
        float x0 = slotCx[i] * 16, z0 = slotCz[i] * 16;
        float dx = x0 + 8 - camX, dz = z0 + 8 - camZ;
        if (Math.sqrt(dx * dx + dz * dz) > viewDist + 23) return false;
        for (float[] p : planes) {
            float px = p[0] >= 0 ? x0 + 16 : x0, py = p[1] >= 0 ? World.SY : 0, pz = p[2] >= 0 ? z0 + 16 : z0;
            if (p[0] * px + p[1] * py + p[2] * pz + p[3] < 0) return false;
        }
        return true;
    }

    private void drawSelection(int[] sel) {
        float e = 0.004f;
        float x0 = sel[0] - e, y0 = sel[1] - e, z0 = sel[2] - e, x1 = sel[0] + 1 + e, y1 = sel[1] + 1 + e, z1 = sel[2] + 1 + e;
        glUseProgram(simpleProg);
        glUniformMatrix4fv(loc(simpleProg, "uViewProj"), false, viewProj);
        glBindVertexArray(simpleVao);
        glBindBuffer(GL_ARRAY_BUFFER, simpleVbo);
        glEnable(GL_BLEND);
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

        if (breakProgress > 0) {
            float[] v = cubeFaces(x0, y0, z0, x1, y1, z1);
            glBufferSubData(GL_ARRAY_BUFFER, 0, v);
            glUniform4f(loc(simpleProg, "uColor"), 0, 0, 0, 0.62f);
            glUniform1f(loc(simpleProg, "uCrack"), (float) breakProgress);
            glDepthMask(false);
            glDrawArrays(GL_TRIANGLES, 0, 36);
            glDepthMask(true);
        }
        float[] l = cubeLines(x0, y0, z0, x1, y1, z1);
        glBufferSubData(GL_ARRAY_BUFFER, 0, l);
        glUniform4f(loc(simpleProg, "uColor"), 0.05f, 0.05f, 0.05f, 0.85f);
        glUniform1f(loc(simpleProg, "uCrack"), 0);
        glDrawArrays(GL_LINES, 0, 24);
        glDisable(GL_BLEND);
    }

    private static float[] cubeLines(float x0, float y0, float z0, float x1, float y1, float z1) {
        float[][] c = { { x0, y0, z0 }, { x1, y0, z0 }, { x1, y0, z1 }, { x0, y0, z1 },
                { x0, y1, z0 }, { x1, y1, z0 }, { x1, y1, z1 }, { x0, y1, z1 } };
        int[] e = { 0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7 };
        float[] v = new float[24 * 6];
        for (int i = 0; i < 24; i++) {
            float[] p = c[e[i]];
            v[i * 6] = p[0]; v[i * 6 + 1] = p[1]; v[i * 6 + 2] = p[2];
        }
        return v;
    }

    private static float[] cubeFaces(float x0, float y0, float z0, float x1, float y1, float z1) {
        float[][] q = {
                { x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, 1, 0, 0 },
                { x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0 },
                { x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, 0, 1, 0 },
                { x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0 },
                { x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1 },
                { x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0, 0, 0, -1 } };
        int[] tri = { 0, 1, 2, 2, 3, 0 };
        float[] v = new float[36 * 6];
        int o = 0;
        for (float[] f : q)
            for (int t : tri) {
                v[o++] = f[t * 3]; v[o++] = f[t * 3 + 1]; v[o++] = f[t * 3 + 2];
                v[o++] = f[12]; v[o++] = f[13]; v[o++] = f[14];
            }
        return v;
    }

    /** Mira que inverte as cores do que está atrás. */
    private void drawCrosshair(int w, int h) {
        float len = 11, th = 1;
        float sx = 2f / w, sy = 2f / h;
        float[][] rects = { { -len, -th, len, th }, { -th, -len, th, -th }, { -th, th, th, len } };
        float[] v = new float[3 * 6 * 6];
        int o = 0;
        for (float[] r : rects) {
            float ax = r[0] * sx, ay = r[1] * sy, bx = r[2] * sx, by = r[3] * sy;
            float[][] pts = { { ax, ay }, { bx, ay }, { bx, by }, { bx, by }, { ax, by }, { ax, ay } };
            for (float[] p : pts) { v[o++] = p[0]; v[o++] = p[1]; v[o++] = 0; v[o++] = 0; v[o++] = 0; v[o++] = 1; }
        }
        glUseProgram(simpleProg);
        glUniformMatrix4fv(loc(simpleProg, "uViewProj"), false, Mat.identity());
        glUniform4f(loc(simpleProg, "uColor"), 1, 1, 1, 1);
        glUniform1f(loc(simpleProg, "uCrack"), 0);
        glBindVertexArray(simpleVao);
        glBindBuffer(GL_ARRAY_BUFFER, simpleVbo);
        glBufferSubData(GL_ARRAY_BUFFER, 0, v);
        glEnable(GL_BLEND);
        glBlendFunc(GL_ONE_MINUS_DST_COLOR, GL_ZERO);
        glDrawArrays(GL_TRIANGLES, 0, 18);
        glDisable(GL_BLEND);
    }

    private int[] uiPrev;
    private static final int UI_TILE = 64;

    /**
     * Camada de menus/HUD (desenhada em Java2D, alfa pré-multiplicado) por cima da cena.
     * Enviar a tela inteira à placa todo quadro custava ~7 ms; aqui só vão os blocos de 64x64
     * que mudaram desde o quadro anterior (normalmente o braço e o texto de FPS).
     */
    void drawUi(int[] argb, int w, int h) {
        glBindTexture(GL_TEXTURE_2D, uiTex);
        if (argb == null) { composeUi(w, h); return; } // nada mudou: reaproveita a imagem anterior
        boolean full = false;
        if (w != uiW || h != uiH) {
            uiW = w;
            uiH = h;
            uiPrev = new int[w * h];
            full = true;
            glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_BGRA, GL_UNSIGNED_INT_8_8_8_8_REV, (IntBuffer) null);
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        }
        glPixelStorei(GL_UNPACK_ROW_LENGTH, w);
        for (int ty = 0; ty < h; ty += UI_TILE) {
            int th = Math.min(UI_TILE, h - ty);
            int run = -1; // início de uma sequência de blocos mudados nesta faixa
            for (int tx = 0; ; tx += UI_TILE) {
                boolean dirty = false;
                if (tx < w) {
                    int tw = Math.min(UI_TILE, w - tx);
                    dirty = full || copyIfChanged(argb, uiPrev, w, tx, ty, tw, th);
                }
                if (dirty) {
                    if (run < 0) run = tx;
                } else if (run >= 0) {
                    glPixelStorei(GL_UNPACK_SKIP_PIXELS, run);
                    glPixelStorei(GL_UNPACK_SKIP_ROWS, ty);
                    glTexSubImage2D(GL_TEXTURE_2D, 0, run, ty, Math.min(tx, w) - run, th,
                            GL_BGRA, GL_UNSIGNED_INT_8_8_8_8_REV, argb);
                    run = -1;
                }
                if (tx >= w) break;
            }
        }
        glPixelStorei(GL_UNPACK_ROW_LENGTH, 0);
        glPixelStorei(GL_UNPACK_SKIP_PIXELS, 0);
        glPixelStorei(GL_UNPACK_SKIP_ROWS, 0);
        composeUi(w, h);
    }

    private void composeUi(int w, int h) {
        glViewport(0, 0, w, h);
        glDisable(GL_DEPTH_TEST);
        glEnable(GL_BLEND);
        glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA); // pixels já vêm pré-multiplicados
        glUseProgram(uiProg);
        glUniform1i(loc(uiProg, "uUi"), 0);
        glActiveTexture(GL_TEXTURE0);
        glBindVertexArray(emptyVao);
        glDrawArrays(GL_TRIANGLES, 0, 3);
        glBindVertexArray(0);
        glDisable(GL_BLEND);
    }

    /** Compara um bloco da imagem com o quadro anterior; se mudou, guarda a versão nova e retorna true. */
    private static boolean copyIfChanged(int[] cur, int[] prev, int w, int x, int y, int tw, int th) {
        boolean changed = false;
        for (int row = y; row < y + th && !changed; row++) {
            int o = row * w + x;
            for (int i = 0; i < tw; i++)
                if (cur[o + i] != prev[o + i]) { changed = true; break; }
        }
        if (changed)
            for (int row = y; row < y + th; row++)
                System.arraycopy(cur, row * w + x, prev, row * w + x, tw);
        return changed;
    }

    // ---------------------------------------------------------------------------------
    // utilidades GL
    // ---------------------------------------------------------------------------------
    private final java.util.Map<Integer, java.util.Map<String, Integer>> locs = new java.util.HashMap<>();

    private int loc(int prog, String name) {
        java.util.Map<String, Integer> m = locs.computeIfAbsent(prog, k -> new java.util.HashMap<>());
        Integer l = m.get(name);
        if (l == null) {
            l = glGetUniformLocation(prog, name);
            m.put(name, l);
        }
        return l;
    }

    private static int program(String vs, String fs) {
        int v = shader(GL_VERTEX_SHADER, vs), f = shader(GL_FRAGMENT_SHADER, fs);
        int p = glCreateProgram();
        glAttachShader(p, v);
        glAttachShader(p, f);
        glLinkProgram(p);
        if (glGetProgrami(p, GL_LINK_STATUS) == GL_FALSE)
            throw new IllegalStateException("Erro ao ligar shaders: " + glGetProgramInfoLog(p));
        glDeleteShader(v);
        glDeleteShader(f);
        return p;
    }

    private static int shader(int type, String src) {
        int s = glCreateShader(type);
        glShaderSource(s, src);
        glCompileShader(s);
        if (glGetShaderi(s, GL_COMPILE_STATUS) == GL_FALSE)
            throw new IllegalStateException("Erro no shader: " + glGetShaderInfoLog(s) + "\n" + src);
        return s;
    }

    /** Matrizes 4x4 em colunas (como o OpenGL espera). */
    static final class Mat {
        static float[] identity() {
            return new float[] { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 };
        }

        static float[] perspective(float tanX, float tanY, float n, float f) {
            float[] m = new float[16];
            m[0] = 1 / tanX;
            m[5] = 1 / tanY;
            m[10] = -(f + n) / (f - n);
            m[11] = -1;
            m[14] = -2 * f * n / (f - n);
            return m;
        }

        static float[] ortho(float l, float r, float b, float t, float n, float f) {
            float[] m = new float[16];
            m[0] = 2 / (r - l);
            m[5] = 2 / (t - b);
            m[10] = -2 / (f - n);
            m[12] = -(r + l) / (r - l);
            m[13] = -(t + b) / (t - b);
            m[14] = -(f + n) / (f - n);
            m[15] = 1;
            return m;
        }

        /** Câmera em (ex,ey,ez) com eixos direita (r), cima (u) e frente (f). */
        static float[] view(float ex, float ey, float ez, float rx, float ry, float rz,
                            float ux, float uy, float uz, float fx, float fy, float fz) {
            return new float[] {
                    rx, ux, -fx, 0,
                    ry, uy, -fy, 0,
                    rz, uz, -fz, 0,
                    -(rx * ex + ry * ey + rz * ez), -(ux * ex + uy * ey + uz * ez), fx * ex + fy * ey + fz * ez, 1 };
        }

        static void mul(float[] a, float[] b, float[] out) {
            float[] r = new float[16];
            for (int c = 0; c < 4; c++)
                for (int row = 0; row < 4; row++) {
                    float s = 0;
                    for (int k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
                    r[c * 4 + row] = s;
                }
            System.arraycopy(r, 0, out, 0, 16);
        }

        /** Os 6 planos do campo de visão (para não desenhar pedaços fora da tela). */
        static void frustumPlanes(float[] m, float[][] p) {
            for (int i = 0; i < 3; i++) {
                for (int s = 0; s < 2; s++) {
                    float sign = s == 0 ? 1 : -1;
                    float[] pl = p[i * 2 + s];
                    pl[0] = m[3] + sign * m[i];
                    pl[1] = m[7] + sign * m[4 + i];
                    pl[2] = m[11] + sign * m[8 + i];
                    pl[3] = m[15] + sign * m[12 + i];
                }
            }
        }
    }
}
