import java.awt.*;
import java.awt.event.KeyEvent;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Random;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.lwjgl.glfw.GLFWErrorCallback;
import org.lwjgl.glfw.GLFWVidMode;
import org.lwjgl.opengl.GL;

import static org.lwjgl.glfw.GLFW.*;
import static org.lwjgl.system.MemoryUtil.NULL;

/**
 * Mundo de Blocos — jogo 3D em primeira pessoa.
 * Lobby com vários mundos salvos; cada mundo tem seu personagem e seu modo (criativo ou sobrevivência).
 *
 * A janela é do GLFW e o mundo é desenhado pela placa de vídeo (GLRenderer). Menus e HUD são
 * desenhados com Java2D numa imagem transparente, enviada à placa como uma camada por cima.
 * Tudo roda na thread principal; os eventos de teclado/mouse chegam durante glfwPollEvents.
 */
public class BlockGame {

    private enum State { LOBBY, CREATE, JOIN, LOADING, PLAYING, PAUSED, SETTINGS, INVENTORY, DEAD }

    private static final SimpleDateFormat DATE = new SimpleDateFormat("dd/MM/yyyy HH:mm");

    private final long window;
    private final Ui ui = new Ui();
    private final Settings settings = Settings.load();
    private final World lobbyWorld;
    private final Player lobbyCam = new Player();
    private final GLRenderer renderer;
    private final ConcurrentLinkedQueue<Runnable> events = new ConcurrentLinkedQueue<>();
    private final boolean[] keys = new boolean[1024];
    private final ExecutorService saver = Executors.newSingleThreadExecutor(r -> new Thread(r, "save"));
    private Future<?> lastSave;

    // janela
    private int fbW = 1280, fbH = 720, winW = 1280, winH = 720;
    private boolean focused = true, captured, firstMouse = true;
    private double lastMouseX, lastMouseY;
    private BufferedImage uiImg;
    private int[] uiPx;

    private State state = State.LOBBY;
    private State settingsReturn = State.LOBBY;
    private boolean running = true;

    // ---- sessão (mundo aberto) ----
    private World world;
    private Saves.Info info;
    private Player player;
    private final Inventory inv = new Inventory();
    private boolean creative;
    private boolean warming; // esperando os pedaços perto do jogador ficarem prontos
    private double warmTime;

    // ---- lobby ----
    private List<Saves.Info> worlds = new ArrayList<>();
    private int selected, listScroll, lastListIndex = -1;
    private long lastListClick;
    private boolean confirmDelete;

    // ---- criação de mundo ----
    private final StringBuilder fWorld = new StringBuilder(), fSeed = new StringBuilder(), fChar = new StringBuilder();
    private int focus; // 0 nenhum, 1 nome do mundo, 2 semente, 3 nome do personagem
    private Persona draft = new Persona();
    private boolean draftCreative;

    // ---- carregamento ----
    private String loadingText = "";
    private Runnable loadingTask;
    private int loadingFrames;

    // ---- jogo ----
    private double mdx, mdy, coolL, coolR, fps, time, lobbyTime;
    private int[] sel;
    private int slot;
    private boolean lHeld, rHeld, lPending, rPending, help = true;

    // chat: T ou Enter abre, Enter envia, Esc fecha
    private static final class ChatLine {
        final String text; final Color color; final long time = System.currentTimeMillis();
        final BufferedImage img; // foto enviada no chat (ou null)
        ChatLine(String text, Color color, BufferedImage img) { this.text = text; this.color = color; this.img = img; }
    }
    /** Escolher/preparar fotos do disco demora um pouco: roda numa thread à parte e o resultado volta pela fila de eventos. */
    private final ExecutorService photoPool = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "fotos");
        t.setDaemon(true);
        return t;
    });
    private volatile boolean pickingFile; // a janela de escolher arquivo está aberta (o jogo não pausa ao perder o foco)
    private long lastPhotoSent;
    private int lastMods; // teclas Ctrl/Shift/Alt do último evento de tecla
    private long lastSpaceTap; // para voar: dois toques no espaço
    private final java.util.ArrayList<ChatLine> chatLines = new java.util.ArrayList<>();
    private final StringBuilder chatInput = new StringBuilder();
    private boolean chatOpen;
    private char chatSkip; // a letra T que abriu o chat chega depois como caractere: ignorar
    private int breakX, breakY = -1, breakZ;
    private double breakProgress, hurtFlash, lastHurt, drownTimer, swing, slotNameTimer;
    private String toast;
    private double toastTimer;
    private int cursorId, cursorCount, cursorWear; // item "preso" no mouse dentro do inventário
    private final Mobs mobs = new Mobs();
    private final Drops drops = new Drops();
    private final Particles particles = new Particles();
    /** Dinamites acesas: {x, y, z do bloco, segundos que faltam, 1 se o bloco ainda está lá}. */
    private final List<double[]> primed = new ArrayList<>();
    private static final double TNT_POWER = 4.2;
    /** Versão do jogo (aparece no título da janela). A da rede fica em Net.VERSION. */
    static final String GAME_VERSION = "Update 5";
    /** Flechas no mundo, e há quanto tempo o jogador segura o disparo do arco (BOW_FULL = força máxima). */
    private final Arrows arrows = new Arrows();
    /** Itens no chão no multijogador: o anfitrião cria, remove e decide quem pegou; os amigos recebem cópias. */
    private final Drops.Sync dropSync = new Drops.Sync() {
        @Override public boolean isMirror() { return toHost != null; }
        @Override public void spawned(Drops.Drop d) { if (server != null) server.broadcast(dropPacket(d), null); }
        @Override public void gone(Drops.Drop d) { if (server != null) server.broadcast(new Net.Out(Net.DROP_GONE).i(d.id), null); }
        @Override public void changed(Drops.Drop d) { if (server != null) server.broadcast(new Net.Out(Net.DROP_SET).i(d.id).i(d.count), null); }
        @Override public void request(Drops.Drop d) {
            if (toHost != null) toHost.send(new Net.Out(Net.DROP_REQ).i(d.item).i(d.count).i(d.wear)
                    .f(d.x).f(d.y).f(d.z).f(d.vx).f(d.vy).f(d.vz).f(d.delay));
        }
        @Override public void offer(Remote r, Drops.Drop d) {
            r.conn.send(new Net.Out(Net.DROP_OFFER).i(d.id).i(d.item).i(d.count).i(d.wear));
        }
    };
    { drops.sync = dropSync; }
    private double netDropTimer;

    private static Net.Out dropPacket(Drops.Drop d) {
        return new Net.Out(Net.DROP_NEW).i(d.id).i(d.item).i(d.count).i(d.wear).f(d.x).f(d.y).f(d.z).f(d.vx).f(d.vy).f(d.vz).f(d.phase);
    }
    private double bowCharge;
    private static final double BOW_FULL = 1.0;
    /** Baús do mundo ("x,y,z" -> conteúdo) e o que está aberto na tela (null = inventário comum). */
    private final java.util.Map<String, Inventory> chests = new java.util.HashMap<>();
    private Inventory chest;
    private String chestKey;
    private final Random rnd = new Random();
    private double eatCd, hazardCd, starveTimer, hitSoundCd, stepAcc;
    private boolean wasInWater;
    private int recipeScroll, paletteScroll;

    // ---- criação por grade: 2x2 no inventário, 3x3 na bancada; a fornalha tem entrada, combustível e resultado ----
    private final Inventory craftGrid = new Inventory(); // espaços 0..8 (linha * craftSize + coluna)
    private int craftSize = 2;
    /** Uma fornalha do mundo: guarda o que tem dentro e continua assando mesmo com a tela fechada. */
    static final class Furnace {
        final Inventory inv = new Inventory(); // 0 entrada, 1 combustível, 2 resultado
        double heat, heatMax, progress;
        boolean burning;
        /** Amigo com a tela desta fornalha aberta: enquanto isso, quem assa é ele (o anfitrião espera). */
        Net.Connection heldBy;

        String serialize() { return inv.serialize(3) + "|" + heat + "|" + heatMax + "|" + progress; }

        static Furnace parse(String s) {
            Furnace f = new Furnace();
            String[] p = s.split("\\|", -1);
            f.inv.deserialize(p[0], false);
            try { f.heat = Double.parseDouble(p[1]); f.heatMax = Double.parseDouble(p[2]); f.progress = Double.parseDouble(p[3]); }
            catch (RuntimeException ignored) { }
            return f;
        }
    }
    /** Fornalhas do mundo: "x,y,z" -> estado (no mundo de um amigo, só a que ele abriu, como antes). */
    private final java.util.Map<String, Furnace> furnaces = new java.util.HashMap<>();
    private Furnace furn = new Furnace(); // a fornalha aberta na tela
    private Inventory furnaceInv = furn.inv;
    private boolean furnaceOpen;
    /** Bloco da fornalha aberta (acende enquanto assa) e se está assando agora. */
    private int furnaceX, furnaceY = -1, furnaceZ;
    /**
     * Segundos para assar um item, conforme o tipo de fornalha. Para uma fornalha mais rápida no futuro,
     * basta um bloco novo aqui com um tempo menor (e tratá-lo como fornalha onde aparece FURNACE).
     */
    static double smeltTime(int furnaceBlock) {
        switch (furnaceBlock) {
            case Block.FURNACE:
            case Block.FURNACE_LIT:
            default: return 8.0; // fornalha comum
        }
    }
    private boolean recipeBook = true, bookOnlyCraftable;
    private Items.Recipe bookHover; // receita sob o mouse no livro: o desenho aparece apagado na grade
    // arrastar itens: {área, inventário, espaço} de cada espaço desenhado no último quadro
    private final List<Object[]> slotHits = new ArrayList<>();
    private final List<Object[]> paletteHits = new ArrayList<>(); // itens do menu do criativo na tela: {Rectangle, item}
    private Object[] dragFrom;
    private int dragStartX, dragStartY;
    private boolean invRightDown;
    private long clearConfirmUntil; // botão "Limpar inventário": até quando o segundo clique confirma
    private final java.util.Set<String> rightVisited = new java.util.HashSet<>();

    // ---- multijogador (LAN / Radmin) ----
    private final ConcurrentLinkedQueue<Net.Packet> netInbox = new ConcurrentLinkedQueue<>();
    private Net.Server server;         // este jogo é o anfitrião
    private Net.Connection toHost;     // este jogo é um amigo conectado a um anfitrião
    private final java.util.Map<Integer, Remote> remotes = new java.util.LinkedHashMap<>();
    private int nextRemoteId = 1, myId;
    private double netStateTimer, netMobTimer, netTimeTimer, netSaveTimer, netDamage, netDamageX, netDamageZ;
    private boolean applyingRemote;
    private final StringBuilder fIp = new StringBuilder(), fJoinName = new StringBuilder();
    private Persona joinPersona = new Persona();
    private String netError;
    private String tooltip;

    public static void main(String[] args) {
        // Java2D só desenha em imagens (menus/HUD); sem janelas do AWT para não brigar com o GLFW.
        System.setProperty("java.awt.headless", "true");
        // Truque conhecido do Windows: uma thread dormindo para sempre faz o Java usar o relógio
        // de alta precisão (1 ms). Em alguns PCs, sem isso, Thread.sleep acorda de 15 em 15 ms
        // e o limite de FPS fica impreciso.
        Thread timer = new Thread(() -> {
            while (true) {
                try { Thread.sleep(Long.MAX_VALUE); } catch (InterruptedException ignored) { }
            }
        }, "relogio-preciso");
        timer.setDaemon(true);
        timer.start();
        new BlockGame().run();
    }

    BlockGame() {
        System.out.println("Preparando o lobby...");
        GLFWErrorCallback.createPrint(System.err).set();
        if (!glfwInit()) throw new IllegalStateException("Não foi possível iniciar o GLFW");
        glfwDefaultWindowHints();
        glfwWindowHint(GLFW_VISIBLE, GLFW_FALSE);
        glfwWindowHint(GLFW_RESIZABLE, GLFW_TRUE);
        glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
        glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
        glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
        glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GLFW_TRUE);
        glfwWindowHint(GLFW_SAMPLES, 4); // bordas suavizadas
        if (NO_INPUT) { glfwWindowHint(GLFW_FOCUS_ON_SHOW, GLFW_FALSE); glfwWindowHint(GLFW_FOCUSED, GLFW_FALSE); }
        window = glfwCreateWindow(1280, 720, "Mundo de Blocos — " + GAME_VERSION, NULL, NULL);
        if (window == NULL)
            throw new IllegalStateException("Não foi possível criar a janela OpenGL 3.3. Atualize o driver da placa de vídeo.");
        glfwSetWindowSizeLimits(window, 1000, 640, GLFW_DONT_CARE, GLFW_DONT_CARE);
        GLFWVidMode mode = glfwGetVideoMode(glfwGetPrimaryMonitor());
        if (mode != null) glfwSetWindowPos(window, (mode.width() - 1280) / 2, (mode.height() - 720) / 2);
        glfwMakeContextCurrent(window);
        GL.createCapabilities();
        glfwSwapInterval(settings.vsync ? 1 : 0);
        installCallbacks();

        Textures.setUseImages(settings.imageTextures);
        Sounds.setVolume(settings.volume / 10.0);
        Sounds.init();
        lobbyWorld = new World(20241111);
        renderer = new GLRenderer();
        renderer.setWorld(lobbyWorld);

        int[] a = new int[1], b = new int[1];
        glfwGetFramebufferSize(window, a, b);
        fbW = a[0]; fbH = b[0];
        glfwGetWindowSize(window, a, b);
        winW = a[0]; winH = b[0];
        glfwShowWindow(window);
        enterLobby();
    }

    private void installCallbacks() {
        glfwSetKeyCallback(window, (w, key, scancode, action, mods) -> {
            if (NO_INPUT) return;
            int k = vk(key);
            lastMods = mods;
            if (action == GLFW_PRESS) {
                if (k >= 0 && state == State.PLAYING && !chatOpen) keys[k] = true;
                if (k >= 0) onKey(k);
                if (key == GLFW_KEY_BACKSPACE) onChar('\b');
            } else if (action == GLFW_REPEAT) {
                if (key == GLFW_KEY_BACKSPACE) onChar('\b');
            } else if (action == GLFW_RELEASE && k >= 0) {
                keys[k] = false;
            }
        });
        glfwSetCharCallback(window, (w, cp) -> { if (cp < 0x10000) onChar((char) cp); });
        glfwSetMouseButtonCallback(window, (w, button, action, mods) -> {
            int b = button == GLFW_MOUSE_BUTTON_LEFT ? 1 : button == GLFW_MOUSE_BUTTON_RIGHT ? 3
                    : button == GLFW_MOUSE_BUTTON_MIDDLE ? 2 : 0;
            if (b == 0 || NO_INPUT) return;
            if (action == GLFW_PRESS) onMouse(ui.mouseX, ui.mouseY, b, (mods & GLFW_MOD_SHIFT) != 0);
            else if (action == GLFW_RELEASE) {
                if (b == 1) lHeld = false;
                if (b == 3) rHeld = false;
                onMouseUp(b);
            }
        });
        glfwSetCursorPosCallback(window, (w, x, y) -> {
            if (NO_INPUT) return;
            if (captured) {
                if (firstMouse) { firstMouse = false; }
                else { mdx += x - lastMouseX; mdy += y - lastMouseY; }
                lastMouseX = x;
                lastMouseY = y;
            } else {
                ui.mouseX = (int) (x * fbW / Math.max(1, winW));
                ui.mouseY = (int) (y * fbH / Math.max(1, winH));
            }
        });
        glfwSetScrollCallback(window, (w, dx, dy) -> { if (dy != 0) onWheel(dy > 0 ? -1 : 1); });
        glfwSetWindowFocusCallback(window, (w, f) -> {
            focused = f;
            if (!f && state == State.PLAYING && !BENCH && !pickingFile) pause();
        });
        // arrastar uma foto do Windows para a janela do jogo manda a foto no chat
        glfwSetDropCallback(window, (w, count, names) -> {
            if (NO_INPUT) return;
            java.util.List<String> paths = new ArrayList<>();
            for (int i = 0; i < count; i++) paths.add(org.lwjgl.glfw.GLFWDropCallback.getName(names, i));
            if (!paths.isEmpty()) sendPhoto(new java.io.File(paths.get(0)));
        });
        glfwSetFramebufferSizeCallback(window, (w, width, height) -> { fbW = width; fbH = height; });
        glfwSetWindowSizeCallback(window, (w, width, height) -> { winW = width; winH = height; });
        glfwSetWindowCloseCallback(window, w -> {
            glfwSetWindowShouldClose(w, false);
            events.add(this::quit);
        });
    }

    /** Converte o código de tecla do GLFW para o código do java.awt.event.KeyEvent usado no jogo. */
    private static int vk(int key) {
        if ((key >= GLFW_KEY_A && key <= GLFW_KEY_Z) || (key >= GLFW_KEY_0 && key <= GLFW_KEY_9)) return key;
        switch (key) {
            case GLFW_KEY_SPACE: return KeyEvent.VK_SPACE;
            case GLFW_KEY_ESCAPE: return KeyEvent.VK_ESCAPE;
            case GLFW_KEY_ENTER: case GLFW_KEY_KP_ENTER: return KeyEvent.VK_ENTER;
            case GLFW_KEY_TAB: return KeyEvent.VK_TAB;
            case GLFW_KEY_BACKSPACE: return KeyEvent.VK_BACK_SPACE;
            case GLFW_KEY_LEFT_SHIFT: case GLFW_KEY_RIGHT_SHIFT: return KeyEvent.VK_SHIFT;
            case GLFW_KEY_LEFT_CONTROL: case GLFW_KEY_RIGHT_CONTROL: return KeyEvent.VK_CONTROL;
            case GLFW_KEY_F1: return KeyEvent.VK_F1;
            case GLFW_KEY_UP: return KeyEvent.VK_UP;
            case GLFW_KEY_DOWN: return KeyEvent.VK_DOWN;
            default: return -1;
        }
    }

    // =====================================================================
    // laço principal
    // =====================================================================
    /** -Dbench=1: sem limite de quadros nem VSync, e o FPS vai para o console (para medir otimizações). */
    private static final boolean BENCH = System.getProperty("bench") != null;
    /** Teste automático das flechas: ignora teclado e mouse de verdade e não toma o foco nem o cursor. */
    private static final boolean NO_INPUT = BENCH && (System.getProperty("bench.arrows") != null || System.getProperty("bench.drops") != null);

    void run() {
        if (BENCH) {
            glfwSwapInterval(0);
            settings.viewDist = Integer.getInteger("bench.view", settings.viewDist);
            if (System.getProperty("bench.world") != null && !worlds.isEmpty()) loadWorld(worlds.get(0));
            if (System.getProperty("bench.join") != null) { // teste de rede: entra sozinho no anfitrião
                fIp.append(System.getProperty("bench.join"));
                fJoinName.append("Teste");
                joinGame();
            }
        }
        long last = System.nanoTime();
        double acc = 0;
        int frames = 0;
        while (running) {
            long now = System.nanoTime();
            double dt = (now - last) / 1e9;
            last = now;
            glfwPollEvents();
            try {
                update(Math.min(dt, 0.05));
                if (!running) break;
                renderFrame();
                benchWorkNs += System.nanoTime() - now;
            } catch (Exception e) {
                e.printStackTrace();
                toast("Erro: " + e.getMessage());
            }
            frames++;
            acc += dt;
            if (acc >= 0.5) {
                fps = frames / acc; frames = 0; acc = 0;
                if (BENCH) System.out.printf(java.util.Locale.ROOT, "fps %.1f  trabalho %.2f ms/quadro%n", fps, (benchWorkNs - benchSwapNs) / 1e6 / Math.max(1, fps * 0.5));
                benchWorkNs = benchSwapNs = 0;
            }
            limitFrameRate(now);
        }
    }

    /**
     * Espera até a hora do próximo quadro, para não usar o computador à toa.
     * Com VSync ligado, a própria troca de quadros já espera o monitor.
     */
    private void limitFrameRate(long frameStart) {
        if (BENCH) return;
        int limit;
        if (!focused) limit = 15;                    // janela em segundo plano
        else if (state == State.PLAYING) limit = settings.fpsLimit();
        else limit = 60;                             // menus
        if (limit <= 0) return;
        long target = frameStart + 1_000_000_000L / limit;
        while (true) {
            long rem = target - System.nanoTime();
            if (rem <= 0) break;
            if (rem > 2_000_000) {
                try { Thread.sleep((rem - 1_000_000) / 1_000_000); } catch (InterruptedException e) { return; }
            } else {
                Thread.yield();
            }
        }
    }

    private void update(double dt) {
        Runnable ev;
        while ((ev = events.poll()) != null) ev.run();
        netUpdate(dt);
        tickWorldLoading(dt);

        toastTimer -= dt;
        hurtFlash = Math.max(0, hurtFlash - dt);
        if (BENCH && System.getProperty("bench.drops") != null && world != null && player != null && !warming && state != State.LOADING)
            benchDrops(dt);
        if (BENCH && System.getProperty("bench.arrows") != null && world != null && player != null && !warming && state != State.LOADING)
            benchArrows(dt);
        slotNameTimer -= dt;

        switch (state) {
            case LOBBY:
            case CREATE:
            case JOIN:
                lobbyTime += dt;
                break;
            case SETTINGS:
                if (world == null) lobbyTime += dt;
                break;
            case LOADING:
                if (loadingFrames >= 2 && loadingTask != null) {
                    Runnable t = loadingTask;
                    loadingTask = null;
                    try {
                        t.run();
                    } catch (Exception e) {
                        e.printStackTrace();
                        world = null;
                        enterLobby();
                        toast("Não foi possível abrir o mundo: " + e.getMessage());
                    }
                }
                break;
            case PLAYING:
                if (warming) {
                    // espera os pedaços em volta do jogador ficarem prontos antes de liberar o jogo
                    mdx = mdy = 0;
                    warmTime += dt;
                    if (renderer.pendingNear(player.x, player.z, 56) == 0 || warmTime > 25) warming = false;
                    break;
                }
                gameUpdate(dt);
                break;
            default:
                break;
        }
        // fornalhas assam com o jogo rodando (no inventário também); na LAN, mesmo com o menu de pausa aberto
        if (world != null && player != null && !warming && state != State.LOADING
                && (state == State.PLAYING || state == State.INVENTORY || multiplayer()))
            tickFurnaces(dt);
    }

    /**
     * Fornalha (enquanto a tela está aberta): com algo que assa na entrada e combustível, enche a seta e, a cada
     * smeltTime segundos, passa um item para o resultado. Cada combustível assa alguns itens (Items.fuel).
     */
    private void tickFurnace(Furnace fu, double dt, double smeltTime) {
        Inventory fi = fu.inv;
        fu.burning = false;
        int in = fi.id[0], out = Items.smelt(in);
        boolean room = fi.empty(2) || (fi.id[2] == out && fi.count[2] < Items.maxStack(out));
        if (fi.empty(0) || out == 0 || !room) { fu.progress = 0; return; }
        if (fu.heat <= 0) { // acende o próximo combustível
            int f = fi.empty(1) ? 0 : Items.fuel(fi.id[1]);
            if (f == 0) { fu.progress = 0; return; }
            fi.set(1, fi.id[1], fi.count[1] - 1, fi.wear[1]);
            fu.heat = fu.heatMax = f;
        }
        fu.burning = true;
        fu.progress += dt / smeltTime;
        if (fu.progress >= 1) {
            fu.progress = 0;
            fi.set(0, in, fi.count[0] - 1, fi.wear[0]);
            fi.set(2, out, (fi.empty(2) ? 0 : fi.count[2]) + 1);
            fu.heat -= 1;
            if (fu == furn && furnaceOpen) Sounds.play("clique", 0.35);
        }
    }

    /**
     * Todas as fornalhas assam o tempo todo (com a tela aberta ou não), e o bloco acende enquanto assa.
     * No mundo de um amigo, ele assa a que está aberta; as fechadas ficam com o anfitrião.
     */
    private void tickFurnaces(double dt) {
        if (world == null) return;
        if (toHost != null) { // amigo: assa a fornalha que está aberta; fechada, quem assa é o anfitrião
            if (!furnaceOpen) return;
            int b = world.get(furnaceX, furnaceY, furnaceZ);
            if (b != Block.FURNACE && b != Block.FURNACE_LIT) { // quebraram a fornalha: o anfitrião já espalhou os itens
                furn = new Furnace(); furnaceInv = furn.inv;
                closeInventory();
                return;
            }
            tickFurnace(furn, dt, smeltTime(b));
            showFurnaceFire(furnaceX, furnaceY, furnaceZ, furn.burning);
            return;
        }
        java.util.Iterator<java.util.Map.Entry<String, Furnace>> it = furnaces.entrySet().iterator();
        while (it.hasNext()) {
            java.util.Map.Entry<String, Furnace> e = it.next();
            String[] k = e.getKey().split(",");
            int x = Integer.parseInt(k[0]), y = Integer.parseInt(k[1]), z = Integer.parseInt(k[2]);
            if (!world.isLoaded(x, z)) continue; // pedaço longe e descarregado: espera
            int b = world.get(x, y, z);
            if (b != Block.FURNACE && b != Block.FURNACE_LIT) { it.remove(); continue; }
            Furnace fu = e.getValue();
            if (fu.heldBy != null && !fu.heldBy.closed) continue; // um amigo está com ela aberta
            fu.heldBy = null;
            tickFurnace(fu, dt, smeltTime(b));
            showFurnaceFire(x, y, z, fu.burning);
            if (fu != furn && fu.heldBy == null && fu.inv.empty(0) && fu.inv.empty(1) && fu.inv.empty(2) && fu.heat <= 0) it.remove(); // vazia: nada a guardar
        }
    }

    /** Troca o bloco entre fornalha apagada e acesa (mantendo a direção). */
    private void showFurnaceFire(int x, int y, int z, boolean lit) {
        if (world == null || y < 0) return;
        int cur = world.get(x, y, z);
        if (cur != Block.FURNACE && cur != Block.FURNACE_LIT) return;
        int want = lit ? Block.FURNACE_LIT : Block.FURNACE;
        if (cur != want) world.setRot(x, y, z, want, world.rotation(x, y, z));
    }

    /** A fornalha foi destruída: o que havia dentro cai no chão. */
    private void spillFurnace(int x, int y, int z) {
        if (toHost != null) return;
        Furnace fu = furnaces.remove(chestKey(x, y, z));
        if (fu == null) return;
        if (fu == furn && furnaceOpen) { furn = new Furnace(); furnaceInv = furn.inv; closeInventory(); }
        for (int i = 0; i < 3; i++)
            if (!fu.inv.empty(i)) drops.scatter(fu.inv.id[i], fu.inv.count[i], fu.inv.wear[i], x + 0.5, y + 0.5, z + 0.5);
    }

    private void tickWorldLoading(double dt) {
        if (world != null && player != null) {
            int radius = (int) Math.ceil((settings.viewDist + 24) / 16.0) + 2;
            List<double[]> who = new ArrayList<>();
            who.add(new double[] { player.x, player.z, radius });
            if (server != null) for (Remote r : remotes.values()) if (r.hasState) who.add(new double[] { r.body.x, r.body.z, 6 });
            world.updateLoading(who.toArray(new double[0][]), dt);
        } else if (world == null && lobbyWorld != null && lobbyCam != null) {
            int radius = (int) Math.ceil((settings.viewDist + 24) / 16.0) + 2;
            lobbyWorld.updateLoading(new double[][] { { lobbyCam.x, lobbyCam.z, radius } }, dt);
        }
    }

    /**
     * O mundo em si: relógio, criaturas e água. No multijogador o anfitrião continua simulando
     * mesmo com o menu aberto; o amigo só avança o relógio (o resto vem do anfitrião).
     */
    private void worldTick(double dt) {
        // relógio do mundo: um dia inteiro dura World.DAY_LENGTH segundos
        world.time += dt;
        if (world.time >= World.DAY_LENGTH) { world.time -= World.DAY_LENGTH; info.day++; }
        if (toHost != null) { // amigo: só o voo das flechas, para o desenho
            arrows.update(dt, world, false, arrowHooks);
            drops.update(dt, world, player, inv, null);
            return;
        }
        List<Player> everyone = new ArrayList<>();
        everyone.add(player);
        for (Remote r : remotes.values()) if (r.hasState) everyone.add(r.body);
        for (Mob m : mobs.list) if (m.tamed) m.owner = ownerOf(m.ownerName); // o lobo segue o dono, se ele estiver no mundo
        mobs.update(dt, world, everyone, player, !creative);
        for (Mob k : mobs.kills) { // monstros que os lobos derrubaram deixam o que tinham
            int[] loot = k.drops(rnd);
            for (int i = 0; i < loot.length; i += 2) drops.scatter(loot[i], loot[i + 1], 0, k.x, k.y + 0.4, k.z);
        }
        world.tickFluids(dt);
        world.tickFalling(dt);
        world.tickGrowth(dt, player.x, player.z, rnd);
        for (double[] e : mobs.explosions) explodeAt(e[0], e[1], e[2], e[3]);
        for (double[] s : mobs.shots) { // flechas dos esqueletos
            benchShots++;
            spawnArrow(Arrows.OWNER_MOB, (int) s[0], s[1], s[2], s[3], s[4], s[5], s[6], Mob.ARROW_DAMAGE, false);
        }
        arrows.update(dt, world, true, arrowHooks);
        collectArrows();
        drops.update(dt, world, player, inv, remotes.values());
        // folhas que apodreceram longe do tronco: às vezes deixam uma muda, uma maçã ou um graveto
        for (int[] ev : world.events) {
            if (ev[0] != World.EV_LEAF_DECAY) continue;
            particles.blockBits(ev[4], ev[1], ev[2], ev[3], 4);
            if (creative) continue;
            double roll = rnd.nextDouble();
            if (roll < 0.06) drops.spawn(ev[4] == Block.BIRCH_LEAVES ? Block.BIRCH_SAPLING : Block.SAPLING, ev[1], ev[2], ev[3]);
            else if (roll < 0.08 && ev[4] == Block.LEAVES) drops.spawn(Items.APPLE, ev[1], ev[2], ev[3]);
            else if (roll < 0.11) drops.spawn(Items.STICK, ev[1], ev[2], ev[3]);
        }
        world.events.clear();
        // golpes de monstros em amigos: avisa cada um
        for (Object[] h : mobs.hits)
            for (Remote r : remotes.values())
                if (h[0] == r.body && r.conn != null)
                    r.conn.send(new Net.Out(Net.DAMAGE).f((Double) h[1]).f((Double) h[2]).f((Double) h[3]));
    }

    private void gameUpdate(double dt) {
        time += dt;
        worldTick(dt);

        double ddx, ddy;
        ddx = mdx; ddy = mdy; mdx = mdy = 0;
        double sens = settings.mouseSens();
        player.yaw -= ddx * sens; // mouse para a direita gira para a direita
        player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - ddy * sens));

        player.update(dt,
                keys[KeyEvent.VK_W], keys[KeyEvent.VK_S], keys[KeyEvent.VK_A], keys[KeyEvent.VK_D],
                keys[KeyEvent.VK_SPACE], keys[KeyEvent.VK_SHIFT], keys[KeyEvent.VK_CONTROL], world);

        if (BENCH && !benchTested && time > 4 && System.getProperty("bench.test") != null) { benchTested = true; benchTest(); }
        footsteps(dt);
        particles.update(dt, world);
        tickPrimed(dt);
        if (creative) {
            player.health = Player.MAX_HEALTH;
            player.air = Player.MAX_AIR;
            player.food = Player.MAX_FOOD;
            player.landedFall = 0;
        } else {
            survival(dt);
            if (state != State.PLAYING) return; // morreu
        }

        double cp = Math.cos(player.pitch);
        double lx = Math.sin(player.yaw) * cp, ly = Math.sin(player.pitch), lz = Math.cos(player.yaw) * cp;
        double ex = player.x, ey = player.y + Player.EYE, ez = player.z;
        sel = world.raycast(ex, ey, ez, lx, ly, lz, creative ? 7 : 5);
        // criatura na mira (só se estiver mais perto que o bloco mirado)
        double blockDist = sel == null ? 99 : sel[6] / 1000.0;
        Mob target = mobs.raycast(ex, ey, ez, lx, ly, lz, Math.min(3.6, blockDist));
        if (target != null) sel = null;

        coolL -= dt;
        coolR -= dt;
        eatCd -= dt;
        swing = Math.max(0, swing - dt);
        int held = inv.empty(slot) ? 0 : inv.id[slot];

        if (held != Items.BOW) bowCharge = 0;
        // arco: segurar o botão esquerdo puxa a corda; soltar dispara
        if (held == Items.BOW) {
            tickBow(dt, lx, ly, lz);
            breakProgress = 0;
            breakY = -1;
        }
        // bater numa criatura
        else if (target != null && (lPending || (lHeld && coolL <= 0)) && toHost != null) {
            // amigo: quem calcula o golpe é o anfitrião (ele manda os itens de volta)
            double kx = target.x - player.x, kz = target.z - player.z, kl = Math.max(0.01, Math.sqrt(kx * kx + kz * kz));
            toHost.send(new Net.Out(Net.HIT_MOB).i(target.id).f(Items.damage(held)).f(kx / kl).f(kz / kl));
            Sounds.playAt("criatura_dano", target.x, target.y + 0.8, target.z, player, 0.9);
            if (!creative && inv.useTool(slot)) toast("Sua ferramenta quebrou!");
            target.hurt = 0.35;
            coolL = 0.45;
            swing = 0.3;
            breakProgress = 0;
        } else if (target != null && (lPending || (lHeld && coolL <= 0))) {
            if (target.hurt <= 0) {
                target.damage(Items.damage(held));
                Sounds.playAt("criatura_dano", target.x, target.y + 0.8, target.z, player, 0.9);
                Sounds.playAt(Mob.SOUNDS[target.type], target.x, target.y + 0.8, target.z, player, 0.6);
                double kx = target.x - player.x, kz = target.z - player.z, kl = Math.max(0.01, Math.sqrt(kx * kx + kz * kz));
                target.vx += kx / kl * 7;
                target.vz += kz / kl * 7;
                target.vy = 5;
                if (!creative && inv.useTool(slot)) toast("Sua ferramenta quebrou!");
                if (target.health <= 0) {
                    int[] d = target.drops(rnd);
                    for (int k = 0; k < d.length; k += 2) drops.scatter(d[k], d[k + 1], 0, target.x, target.y + 0.4, target.z);
                }
            }
            coolL = 0.45;
            swing = 0.3;
            breakProgress = 0;
        }
        // quebrar bloco
        else if (creative) {
            if (sel != null && (lPending || (lHeld && coolL <= 0)) && Block.hardness(world.get(sel[0], sel[1], sel[2])) >= 0) {
                int broken = world.get(sel[0], sel[1], sel[2]);
                Sounds.playAt(breakSound(broken), sel[0] + 0.5, sel[1] + 0.5, sel[2] + 0.5, player, 0.9);
                particles.blockBits(broken, sel[0], sel[1], sel[2], 14);
                world.set(sel[0], sel[1], sel[2], Block.AIR);
                breakOtherDoorHalf(broken, sel[0], sel[1], sel[2]);
                if (broken == Block.CHEST) spillChest(sel[0], sel[1], sel[2]);
                if (broken == Block.FURNACE || broken == Block.FURNACE_LIT) spillFurnace(sel[0], sel[1], sel[2]);
                coolL = 0.2;
                swing = 0.3;
            }
            breakProgress = 0;
        } else if (lHeld && sel != null) {
            if (sel[0] != breakX || sel[1] != breakY || sel[2] != breakZ) {
                breakX = sel[0]; breakY = sel[1]; breakZ = sel[2];
                breakProgress = 0;
            }
            int b = world.get(breakX, breakY, breakZ);
            double hard = Block.hardness(b);
            if (hard >= 0) {
                double[] mining = Items.mining(held, b);
                breakProgress += hard == 0 ? 1 : dt * mining[0] / hard;
                if (swing <= 0) swing = 0.3;
                hitSoundCd -= dt;
                if (hitSoundCd <= 0) {
                    hitSoundCd = 0.25;
                    Sounds.playAt(breakSound(b), breakX + 0.5, breakY + 0.5, breakZ + 0.5, player, 0.3);
                    particles.blockBits(b, breakX, breakY, breakZ, 3);
                }
                if (breakProgress >= 1) {
                    Sounds.playAt(breakSound(b), breakX + 0.5, breakY + 0.5, breakZ + 0.5, player, 0.9);
                    particles.blockBits(b, breakX, breakY, breakZ, 16);
                    world.set(breakX, breakY, breakZ, Block.AIR);
                    breakOtherDoorHalf(b, breakX, breakY, breakZ);
                    if (b == Block.CHEST) spillChest(breakX, breakY, breakZ);
                    if (b == Block.FURNACE || b == Block.FURNACE_LIT) spillFurnace(breakX, breakY, breakZ);
                    if (mining[1] > 0) {
                        // o que o bloco solta vira miniatura no chão, coletada quando o jogador chega perto
                        int drop = Block.drop(b);
                        if (b == Block.GRAVEL && rnd.nextDouble() < 0.1) drop = Items.FLINT; // às vezes o cascalho dá sílex
                        boolean dropped = false;
                        if (drop != Block.AIR) { drops.spawn(drop, breakX, breakY, breakZ); dropped = true; }
                        if (Block.isMixedSlab(b)) { drops.spawn(Block.slab(Block.mixedUpper(b), 0), breakX, breakY, breakZ); dropped = true; } // a outra laje
                        if (b == Block.LEAVES && rnd.nextDouble() < 0.08) { drops.spawn(Items.APPLE, breakX, breakY, breakZ); dropped = true; }
                        if (Block.isLeaves(b) && rnd.nextDouble() < 0.07) { drops.spawn(b == Block.LEAVES ? Block.SAPLING : Block.BIRCH_SAPLING, breakX, breakY, breakZ); dropped = true; }
                        if (b == Block.TALL_GRASS && rnd.nextDouble() < 0.05) { drops.spawn(Items.STICK, breakX, breakY, breakZ); dropped = true; }
                        if (b == Block.TALL_GRASS && rnd.nextDouble() < 0.15) { drops.spawn(Items.SEEDS, breakX, breakY, breakZ); dropped = true; }
                        if (b == Block.WHEAT + 2) { // trigo maduro: além da semente, dá o trigo e às vezes mais sementes
                            drops.spawn(Items.WHEAT, breakX, breakY, breakZ);
                            for (int k = rnd.nextInt(3); k > 0; k--) drops.spawn(Items.SEEDS, breakX, breakY, breakZ);
                        }
                        if (dropped) Sounds.playAt("drop", breakX + 0.5, breakY + 0.5, breakZ + 0.5, player, 0.8);
                    } else if (Block.requiredTier(b) >= 0) {
                        toast("Precisa de uma picareta " + (Block.requiredTier(b) == 0 ? "" : Block.requiredTier(b) == 1 ? "de pedra " : "de ferro ") + "para coletar isso");
                    }
                    if (Block.material(b) != Block.M_PLANT && hard > 0 && inv.useTool(slot)) toast("Sua ferramenta quebrou!");
                    breakProgress = 0;
                    breakY = -1;
                }
            }
        } else {
            breakProgress = 0;
            breakY = -1;
        }

        // botão direito: abrir bancada/fornalha, comer ou colocar bloco
        if (rPending || (rHeld && coolR <= 0)) {
            coolR = 0.25;
            int aimed = sel == null ? Block.AIR : world.get(sel[0], sel[1], sel[2]);
            if (rPending && target != null && target.type == Mob.WOLF) {
                useOnMob(target, held); // osso doma; carne cura; mão vazia faz sentar/levantar
                swing = 0.3;
            } else if (rPending && Items.isEgg(held) && sel != null) {
                // ovo de criatura: nasce na célula de frente para o bloco mirado
                spawnFromEgg(Items.eggMob(held), sel[3] + 0.5, sel[4], sel[5] + 0.5, player.yaw + Math.PI);
                if (!creative) inv.set(slot, held, inv.count[slot] - 1);
                swing = 0.3;
            } else if (rPending && aimed == Block.TABLE && !keys[KeyEvent.VK_SHIFT]) {
                openCrafting(3); // bancada: grade 3x3
            } else if (rPending && (aimed == Block.FURNACE || aimed == Block.FURNACE_LIT) && !keys[KeyEvent.VK_SHIFT]) {
                openFurnace(sel[0], sel[1], sel[2]);
            } else if (rPending && aimed == Block.BED && !keys[KeyEvent.VK_SHIFT]) {
                useBed(sel[0], sel[1], sel[2]);
                swing = 0.3;
            } else if (rPending && aimed == Block.CHEST && !keys[KeyEvent.VK_SHIFT]) {
                openChest(sel[0], sel[1], sel[2]);
            } else if (rPending && aimed == Block.TNT && held == Items.FLINT_STEEL) {
                prime(sel[0], sel[1], sel[2], 3.0, true);
                if (!creative && inv.useTool(slot)) toast("Sua pederneira acabou!");
                swing = 0.3;
            } else if (rPending && aimed == Block.TNT && !Items.isBlock(held) && Items.food(held) == 0) {
                toast("Use uma pederneira para acender a dinamite");
            } else if (rPending && Block.isDoor(aimed) && !keys[KeyEvent.VK_SHIFT]) {
                toggleDoor(sel[0], sel[1], sel[2]);
                swing = 0.3;
            } else if (Items.food(held) > 0) {
                if (eatCd <= 0 && (player.food < Player.MAX_FOOD || creative)) {
                    player.food = Math.min(Player.MAX_FOOD, player.food + Items.food(held));
                    if (!creative) inv.set(slot, held, inv.count[slot] - 1);
                    toast("Nham! " + Items.name(held));
                    Sounds.play("comer", 0.8);
                    eatCd = 0.8;
                    swing = 0.3;
                }
            } else if (rPending && Items.isArmor(held)) {
                equipHeld();
            } else if (rPending && held == Items.BONE && sel != null && Block.isWheat(aimed) && aimed < Block.WHEAT + 2) {
                world.set(sel[0], sel[1], sel[2], aimed + 1); // osso como adubo: o trigo cresce uma fase
                particles.hitBits(sel[0] + 0.5, sel[1] + 0.4, sel[2] + 0.5, 0xE8F0D8, 8);
                if (!creative) inv.set(slot, held, inv.count[slot] - 1);
                swing = 0.3;
            } else if (Items.isHoe(held) && sel != null && (aimed == Block.GRASS || aimed == Block.DIRT)) {
                till(sel[0], sel[1], sel[2]);
            } else if (held == Items.SEEDS && sel != null && aimed == Block.FARMLAND && world.get(sel[0], sel[1] + 1, sel[2]) == Block.AIR) {
                world.set(sel[0], sel[1] + 1, sel[2], Block.WHEAT);
                Sounds.playAt("colocar", sel[0] + 0.5, sel[1] + 1.2, sel[2] + 0.5, player, 0.6);
                if (!creative) inv.set(slot, held, inv.count[slot] - 1);
                swing = 0.3;
            } else if (rPending && held == Items.SEEDS && sel != null && aimed != Block.FARMLAND) {
                toast("Sementes só crescem em terra arada: use a enxada na terra");
            } else if (sel != null && Items.isBlock(held)) {
                placeBlock(held, lx, ly, lz);
            }
        }
        lPending = rPending = false;
    }

    /**
     * Coloca o bloco segurado na célula antes do bloco mirado. Escadas olham para onde você olha
     * (e ficam invertidas se você clicar na metade de cima), lajes vão em cima ou embaixo conforme
     * o ponto clicado (laje sobre laje igual vira bloco inteiro), portas ocupam dois blocos.
     */
    private void placeBlock(int held, double lx, double ly, double lz) {
        int hx = sel[0], hy = sel[1], hz = sel[2];
        int bx = sel[3], by = sel[4], bz = sel[5];
        // ponto exato do clique e a face clicada
        double t = sel[6] / 1000.0;
        double hitY = player.y + Player.EYE + ly * t;
        boolean clickedTop = by > hy, clickedBottom = by < hy;
        boolean upperHalf = clickedBottom || (!clickedTop && hitY - Math.floor(hitY) > 0.5);
        int target = world.get(hx, hy, hz);

        // laje sobre laje (pela face livre): mesmo material vira bloco inteiro; materiais diferentes ficam empilhados
        if (Block.isSlab(held) && Block.isSlab(target)
                && ((clickedTop && !Block.slabTop(target)) || (clickedBottom && Block.slabTop(target)))) {
            int a = Block.slabMat(target), m = Block.slabMat(held);
            int result = a == m ? Block.SHAPE_MATS[m] : Block.slabTop(target) ? Block.mixedSlab(m, a) : Block.mixedSlab(a, m);
            setAndPay(hx, hy, hz, result, held);
            return;
        }
        // laje vertical encostando na outra metade de uma laje vertical igual: bloco inteiro
        if (Block.isVSlab(held) && Block.isVSlab(target) && Block.vslabMat(target) == Block.vslabMat(held)) {
            int f = Block.vslabFacing(target);
            if (bx == hx - Block.DIR_X[f] && bz == hz - Block.DIR_Z[f] && by == hy) {
                setAndPay(hx, hy, hz, Block.SHAPE_MATS[Block.vslabMat(held)], held);
                return;
            }
        }

        boolean free = isReplaceable(bx, by, bz);
        if (!free) return;
        int place = held;
        int facing = Block.facingFromYaw(player.yaw);
        boolean sideClick = by == hy && (bx != hx || bz != hz);
        int towardHit = sideClick ? dirIndex(hx - bx, hz - bz) : -1; // direção da nova célula para o bloco clicado
        if (held == Block.TORCH && sideClick) {
            if (!Block.solid(target) || Block.shape(target) == Block.MODEL) return; // precisa de parede firme
            setAndPay(bx, by, bz, Block.WALL_TORCH_BASE + towardHit, held);
            return;
        }
        if (Block.isVSlab(held)) place = Block.vslab(Block.vslabMat(held), sideClick ? towardHit : facing);
        else if (Block.isSlab(held)) place = Block.slab(Block.slabMat(held), upperHalf ? 1 : 0);
        else if (Block.isStair(held)) place = Block.stair(Block.stairMat(held), facing, upperHalf ? 1 : 0);
        else if (Block.isDoor(held)) {
            if (!isReplaceable(bx, by + 1, bz) || !Block.solid(world.get(bx, by - 1, bz))) return;
            if (player.intersects(bx, by, bz) || player.intersects(bx, by + 1, bz)) return;
            int wood = Block.doorWood(held);
            world.set(bx, by + 1, bz, Block.door(wood, 1, facing, 0));
            setAndPay(bx, by, bz, Block.door(wood, 0, facing, 0), held);
            return;
        }
        boolean supported = !Block.needsSupport(place) || Block.solid(world.get(bx, by - 1, bz));
        if (!supported || (Block.solid(place) && player.intersects(bx, by, bz)) || mobBlocks(bx, by, bz, place)) return;
        // blocos com "frente" (fornalha, bancada, baú, cama...) ficam com a frente virada para quem os colocou
        setAndPay(bx, by, bz, place, held, Block.rotatable(place) ? (facing + 2) & 3 : 0);
    }

    private static int dirIndex(int dx, int dz) {
        for (int f = 0; f < 4; f++) if (Block.DIR_X[f] == dx && Block.DIR_Z[f] == dz) return f;
        return 0;
    }

    private boolean isReplaceable(int x, int y, int z) {
        if (!World.inBounds(x, y, z)) return false;
        int b = world.get(x, y, z);
        return b == Block.AIR || Block.shape(b) == Block.LIQUID || Block.shape(b) == Block.CROSS;
    }

    private void setAndPay(int x, int y, int z, int b, int item) {
        setAndPay(x, y, z, b, item, 0);
    }

    private void setAndPay(int x, int y, int z, int b, int item, int rot) {
        if (b == Block.CHEST && toHost == null) chests.put(chestKey(x, y, z), new Inventory()); // baú novo começa vazio (mesmo no lugar do baú de um iglu)
        world.setRot(x, y, z, b, rot);
        Sounds.playAt("colocar", x + 0.5, y + 0.5, z + 0.5, player, 0.8);
        if (!creative) inv.set(slot, item, inv.count[slot] - 1);
        swing = 0.3;
    }

    /** Abre/fecha as duas metades da porta. */
    private void toggleDoor(int x, int y, int z) {
        int b = world.get(x, y, z);
        int lowerY = Block.doorHalf(b) == 0 ? y : y - 1;
        int lower = world.get(x, lowerY, z);
        if (!Block.isDoor(lower)) return;
        int f = Block.doorFacing(lower), open = Block.doorOpen(lower) ? 0 : 1, wood = Block.doorWood(lower);
        world.set(x, lowerY, z, Block.door(wood, 0, f, open));
        if (Block.isDoor(world.get(x, lowerY + 1, z))) world.set(x, lowerY + 1, z, Block.door(wood, 1, f, open));
        Sounds.playAt("quebrar_madeira", x + 0.5, lowerY + 1, z + 0.5, player, 0.5);
    }

    /** Ao quebrar metade de uma porta, a outra metade sai junto. */
    private void breakOtherDoorHalf(int b, int x, int y, int z) {
        if (!Block.isDoor(b)) return;
        int oy = Block.doorHalf(b) == 0 ? y + 1 : y - 1;
        if (Block.isDoor(world.get(x, oy, z))) world.set(x, oy, z, Block.AIR);
    }

    // ----------------------------------------------------------------- arco e flechas

    private void tickBow(double dt, double lx, double ly, double lz) {
        boolean hasArrow = creative || inv.countOf(Items.ARROW) > 0;
        if (lHeld && hasArrow) {
            if (bowCharge == 0) Sounds.play("arco_tensao", 0.6);
            bowCharge += dt;
        } else if (lPending && !hasArrow) {
            toast("Você não tem flechas");
        } else if (!lHeld && bowCharge > 0) {
            if (bowCharge >= 0.15) fireBow(Math.min(1, bowCharge / BOW_FULL), lx, ly, lz);
            bowCharge = 0;
        }
    }

    /** Solta a flecha: quanto mais puxado (power 0..1), mais rápida e mais forte. O amigo pede o disparo ao anfitrião. */
    private void fireBow(double power, double lx, double ly, double lz) {
        double speed = 9 + 31 * power, dmg = 2 + 7 * power;
        double x = player.x + lx * 0.4, y = player.y + Player.EYE - 0.12 + ly * 0.4, z = player.z + lz * 0.4;
        boolean pickup = !creative;
        if (!creative) {
            inv.remove(Items.ARROW, 1);
            if (inv.useTool(slot)) toast("Seu arco quebrou!");
        }
        Sounds.play("arco_disparo", 0.8);
        swing = 0.2;
        if (toHost != null) toHost.send(new Net.Out(Net.SHOOT).f(x).f(y).f(z).f(lx * speed).f(ly * speed).f(lz * speed).f(dmg).b(pickup));
        else spawnArrow(0, -1, x, y, z, lx * speed, ly * speed, lz * speed, dmg, pickup);
    }

    /** Anfitrião (ou jogo sozinho): põe a flecha no mundo e avisa os amigos. owner 0 = este jogador. */
    private Arrows.Arrow spawnArrow(int owner, int mob, double x, double y, double z, double vx, double vy, double vz, double dmg, boolean pickup) {
        Arrows.Arrow a = arrows.spawn(owner, mob, x, y, z, vx, vy, vz, dmg, pickup);
        if (owner != 0) Sounds.playAt("arco_disparo", x, y, z, player, 0.8);
        if (server != null) server.broadcast(arrowPacket(a, true), null);
        return a;
    }

    private static Net.Out arrowPacket(Arrows.Arrow a, boolean sound) {
        return new Net.Out(Net.ARROW).i(a.id).i(a.owner).f(a.x).f(a.y).f(a.z).f(a.vx).f(a.vy).f(a.vz).b(sound);
    }

    private static Net.Out stuckPacket(Arrows.Arrow a) {
        return new Net.Out(Net.ARROW_STUCK).i(a.id).f(a.x).f(a.y).f(a.z).f(a.dx).f(a.dy).f(a.dz).i(a.bx).i(a.by).i(a.bz);
    }

    private final Arrows.Listener arrowHooks = new Arrows.Listener() {
        @Override public boolean hitEntity(Arrows.Arrow a, double ux, double uy, double uz, double len) { return arrowHit(a, ux, uy, uz, len); }
        @Override public void stuck(Arrows.Arrow a, int block) {
            arrowStuckSound(a, block);
            if (server != null) server.broadcast(stuckPacket(a), null);
        }
        @Override public void expired(Arrows.Arrow a) {
            if (server != null) server.broadcast(new Net.Out(Net.ARROW_GONE).i(a.id).i(0).f(a.x).f(a.y).f(a.z), null);
        }
    };

    /** A flecha acertou uma criatura ou um jogador no trecho que ia percorrer? (só o anfitrião decide) */
    private boolean arrowHit(Arrows.Arrow a, double ux, double uy, double uz, double len) {
        Mob mob = null;
        Remote rem = null;
        boolean me = false;
        double best = len;
        for (Mob m : mobs.list) {
            if (m.id == a.shooterMob || m.health <= 0) continue;
            double t = m.rayHit(a.x, a.y, a.z, ux, uy, uz);
            if (t >= 0 && t <= best) { best = t; mob = m; }
        }
        if (!creative) { // jogadores: nunca o próprio dono da flecha
            if (a.owner != 0 && player.health > 0 && state != State.DEAD) {
                double t = player.rayHit(a.x, a.y, a.z, ux, uy, uz);
                if (t >= 0 && t <= best) { best = t; me = true; mob = null; }
            }
            for (Remote r : remotes.values()) {
                if (r.id == a.owner || !r.hasState || r.conn == null) continue;
                double t = r.body.rayHit(a.x, a.y, a.z, ux, uy, uz);
                if (t >= 0 && t <= best) { best = t; rem = r; me = false; mob = null; }
            }
        }
        if (mob == null && rem == null && !me) return false;
        double hx = a.x + ux * best, hy = a.y + uy * best, hz = a.z + uz * best;
        if (mob != null) {
            mob.damage(a.damage);
            mob.vx += ux * 5; mob.vz += uz * 5; mob.vy = Math.max(mob.vy, 3.5);
            if (Mob.SOUNDS[mob.type] != null) Sounds.playAt(Mob.SOUNDS[mob.type], mob.x, mob.y + 0.8, mob.z, player, 0.6);
            if (mob.health <= 0) { // o que a criatura solta vai para quem atirou
                int[] d = mob.drops(rnd);
                for (int k = 0; k < d.length; k += 2) drops.scatter(d[k], d[k + 1], 0, mob.x, mob.y + 0.4, mob.z);
            }
        } else if (me) {
            hit(a.damage);
            player.vx += ux * 6; player.vz += uz * 6; player.vy = 4;
        } else {
            rem.conn.send(new Net.Out(Net.DAMAGE).f(a.damage).f(hx - ux * 2).f(hz - uz * 2));
        }
        arrowHitEffects(hx, hy, hz);
        if (server != null) server.broadcast(new Net.Out(Net.ARROW_GONE).i(a.id).i(1).f(hx).f(hy).f(hz), null);
        return true;
    }

    private void arrowHitEffects(double x, double y, double z) {
        Sounds.playAt("flecha_criatura", x, y, z, player, 0.9);
        particles.hitBits(x, y, z, 0xB02020, 10);
    }

    private void arrowStuckSound(Arrows.Arrow a, int block) {
        boolean hard = Block.material(block) == Block.M_ROCK || block == Block.GLASS || block == Block.GLASS_PANE;
        Sounds.playAt(hard ? "flecha_pedra" : "flecha_madeira", a.x, a.y, a.z, player, 0.7);
    }

    /** Anfitrião: quem encosta numa flecha presa a recolhe (a do amigo vai como item solto aos pés dele). */
    private void collectArrows() {
        for (java.util.Iterator<Arrows.Arrow> it = arrows.list.iterator(); it.hasNext(); ) {
            Arrows.Arrow a = it.next();
            if (!a.stuck || !a.pickup || a.stuckAge < 0.4) continue;
            boolean taken = false;
            if (player.health > 0 && nearArrow(player, a) && inv.add(Items.ARROW, 1) == 0) {
                Sounds.play("coletar", 0.7);
                taken = true;
            }
            if (!taken)
                for (Remote r : remotes.values())
                    if (r.hasState && r.conn != null && nearArrow(r.body, a)) {
                        drops.spawn(Items.ARROW, 1, 0, r.body.x, r.body.y + 1, r.body.z, 0, 2, 0, 0); // cai aos pés dele e ele pega
                        taken = true;
                        break;
                    }
            if (!taken) continue;
            it.remove();
            if (server != null) server.broadcast(new Net.Out(Net.ARROW_GONE).i(a.id).i(0).f(a.x).f(a.y).f(a.z), null);
        }
    }

    private static boolean nearArrow(Player p, Arrows.Arrow a) {
        double dx = a.x - p.x, dz = a.z - p.z;
        return dx * dx + dz * dz < 1.4 * 1.4 && a.y > p.y - 0.6 && a.y < p.y + 2.3;
    }

    private static String chestKey(int x, int y, int z) {
        return x + "," + y + "," + z;
    }

    /** Abre o baú. No mundo de um amigo o conteúdo fica com o anfitrião: pede a ele e abre quando chegar. */
    private void openChest(int x, int y, int z) {
        if (toHost != null) { toHost.send(new Net.Out(Net.CHEST_OPEN).i(x).i(y).i(z)); return; }
        String key = chestKey(x, y, z);
        showChest(key, chestFor(x, y, z));
    }

    /** O conteúdo do baú; um baú de iglu ainda não aberto vem com os itens do iglu. */
    private Inventory chestFor(int x, int y, int z) {
        String key = chestKey(x, y, z);
        Inventory c = chests.get(key);
        if (c == null) {
            c = new Inventory();
            if (world.iglooChest(x, y, z)) fillIglooLoot(c, x, y, z);
            chests.put(key, c);
        }
        return c;
    }

    /** O que se acha no baú do iglu (sempre o mesmo para cada iglu). */
    private static void fillIglooLoot(Inventory c, int x, int y, int z) {
        java.util.Random r = new java.util.Random(x * 341873128712L + z * 132897987541L + y);
        int[][] loot = { { Items.COAL, 3 + r.nextInt(5) }, { Items.RAW_FISH, 2 + r.nextInt(4) }, { Items.COOKED_FISH, 1 + r.nextInt(3) },
                { Items.BREAD, 1 + r.nextInt(2) }, { Items.LEATHER, 1 + r.nextInt(3) }, { Items.STRING, r.nextInt(3) },
                { Items.IRON_INGOT, r.nextInt(3) }, { Items.APPLE, r.nextInt(3) }, { Block.WOOL, r.nextInt(2) } };
        java.util.List<Integer> slots = new java.util.ArrayList<>();
        for (int i = 0; i < Inventory.CHEST; i++) slots.add(i);
        java.util.Collections.shuffle(slots, r);
        int k = 0;
        for (int[] it : loot) if (it[1] > 0) c.set(slots.get(k++), it[0], it[1]);
    }

    private void showChest(String key, Inventory c) {
        chest = c;
        chestKey = key;
        Sounds.play("quebrar_madeira", 0.4);
        openInventory();
    }

    /** O baú foi destruído: o que havia dentro cai no chão. (Para um amigo, quem manda os itens é o anfitrião.) */
    private void spillChest(int x, int y, int z) {
        if (toHost != null) return;
        Inventory c = chests.remove(chestKey(x, y, z));
        if (c == null) return;
        if (c == chest) { chest = null; chestKey = null; }
        for (int i = 0; i < Inventory.CHEST; i++)
            if (!c.empty(i)) drops.scatter(c.id[i], c.count[i], c.wear[i], x + 0.5, y + 0.5, z + 0.5);
    }

    /** Enxada: transforma grama ou terra em terra arada, onde as sementes crescem. */
    private void till(int x, int y, int z) {
        int above = world.get(x, y + 1, z);
        if (above != Block.AIR && Block.shape(above) != Block.CROSS) return;
        if (above != Block.AIR) world.set(x, y + 1, z, Block.AIR);
        world.set(x, y, z, Block.FARMLAND);
        Sounds.playAt("quebrar_terra", x + 0.5, y + 1, z + 0.5, player, 0.7);
        particles.blockBits(Block.DIRT, x, y + 1, z, 6);
        if (!creative && inv.useTool(slot)) toast("Sua ferramenta quebrou!");
        swing = 0.3;
    }

    /** Botão direito com uma peça de armadura na mão: veste (trocando com a que já estava). */
    private void equipHeld() {
        int item = inv.id[slot], w = inv.wear[slot], a = Inventory.SIZE + Items.armorPiece(item);
        boolean had = !inv.empty(a);
        int oldId = inv.id[a], oldW = inv.wear[a];
        inv.set(a, item, 1, w);
        inv.set(slot, had ? oldId : 0, had ? 1 : 0, oldW);
        Sounds.play("colocar", 0.7);
        toast("Vestiu: " + Items.name(item));
        swing = 0.3;
    }

    /** Dano que a armadura absorve em parte (golpes, explosões, espinhos): cada ponto de defesa tira 4%. */
    private void hit(double n) {
        int pts = inv.armorPoints();
        if (n > 0 && pts > 0) {
            n = Math.max(0.5, n * (1 - pts * 0.04));
            if (inv.wearArmor()) toast("Uma peça da sua armadura quebrou!");
        }
        damage(n);
    }

    /** Cama: define onde você renasce e, de noite, faz o tempo pular para a manhã. */
    private void useBed(int x, int y, int z) {
        info.spawnX = x + 0.5; info.spawnY = y + 0.6; info.spawnZ = z + 0.5;
        boolean night = world.daylight() < 0.35;
        if (!night) { toast("Ponto de renascimento definido. Só dá para dormir à noite."); return; }
        if (toHost != null) { toast("Ponto de renascimento definido. Só o anfitrião faz a noite passar."); return; }
        for (Mob m : mobs.list)
            if (m.hostile() && Math.abs(m.x - player.x) < 8 && Math.abs(m.z - player.z) < 8 && Math.abs(m.y - player.y) < 5) {
                toast("Você não pode dormir agora: há monstros por perto.");
                return;
            }
        if (world.time > World.DAY_LENGTH * 0.5) info.day++;
        world.time = World.DAY_LENGTH * 0.27;
        if (server != null) server.broadcast(new Net.Out(Net.TIME).dbl(world.time).i(info.day), null);
        mobs.list.removeIf(Mob::hostile);
        toast("Você dormiu. Bom dia!  (dia " + info.day + ")");
        saveAsync();
    }

    /** Acende uma dinamite. hasBlock: o bloco ainda está no mundo (falso nas que voaram de outra explosão). */
    private void prime(int x, int y, int z, double seconds, boolean hasBlock) {
        for (double[] p : primed) if ((int) p[0] == x && (int) p[1] == y && (int) p[2] == z) return;
        primed.add(new double[] { x, y, z, seconds, hasBlock ? 1 : 0 });
        Sounds.playAt("pavio", x + 0.5, y + 0.5, z + 0.5, player, 0.9);
    }

    private void tickPrimed(double dt) {
        if (primed.isEmpty()) return;
        List<double[]> ready = new ArrayList<>();
        for (java.util.Iterator<double[]> it = primed.iterator(); it.hasNext(); ) {
            double[] p = it.next();
            int x = (int) p[0], y = (int) p[1], z = (int) p[2];
            if (p[4] > 0 && world.get(x, y, z) != Block.TNT) { it.remove(); continue; } // alguém quebrou antes
            p[3] -= dt;
            if (rnd.nextDouble() < dt * 20) particles.smoke(x + 0.5, y + 1.05, z + 0.5);
            if (p[3] <= 0) { it.remove(); ready.add(p); }
        }
        for (double[] p : ready) {
            int x = (int) p[0], y = (int) p[1], z = (int) p[2];
            if (p[4] > 0) world.set(x, y, z, Block.AIR);
            explodeAt(x + 0.5, y + 0.5, z + 0.5, TNT_POWER);
        }
    }

    /** Explosão num ponto: abre o buraco, solta parte dos blocos como itens, machuca e empurra quem está perto. */
    private void explodeAt(double x, double y, double z, double power) {
        List<int[]> gone = world.explode(x, y, z, power, rnd);
        for (int[] g : gone) {
            if (g[3] == Block.CHEST) spillChest(g[0], g[1], g[2]);
            if (g[3] == Block.FURNACE || g[3] == Block.FURNACE_LIT) spillFurnace(g[0], g[1], g[2]);
            if (g[3] == Block.TNT) prime(g[0], g[1], g[2], 0.25 + rnd.nextDouble() * 0.5, false); // reação em cadeia
            else if (!creative && rnd.nextDouble() < 0.3) drops.spawn(Block.drop(g[3]), g[0], g[1], g[2]);
        }
        if (toHost == null) mobs.blast(x, y, z, power);
        drops.blast(x, y, z, power);
        blastEffects(x, y, z, power);
        if (server != null) server.broadcast(new Net.Out(Net.EXPLODE).f(x).f(y).f(z).f(power), null);
    }

    /** Som, fumaça e o dano da explosão no jogador desta tela. */
    private void blastEffects(double x, double y, double z, double power) {
        Sounds.playAt("explosao", x, y, z, player, 1.0);
        particles.explosion(x, y, z, power);
        double dx = player.x - x, dy = player.y + 0.9 - y, dz = player.z - z;
        double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > power * 2 || creative || state != State.PLAYING) return;
        double k = 1 - dist / (power * 2);
        hit(Math.floor(k * power * 5));
        double l = Math.max(0.3, dist);
        player.vx += dx / l * k * 12; player.vz += dz / l * k * 12; player.vy += 4 + k * 5;
    }

    /** Tecla Q: joga na frente um item do espaço selecionado (com Ctrl, a pilha toda). */
    private void dropHeld(boolean all) {
        if (inv.empty(slot)) return;
        int item = inv.id[slot], n = all ? inv.count[slot] : 1, w = inv.wear[slot];
        inv.set(slot, item, inv.count[slot] - n, w); // também no criativo: o item sai da mão (não duplica)
        double cp = Math.cos(player.pitch);
        double lx = Math.sin(player.yaw) * cp, ly = Math.sin(player.pitch), lz = Math.cos(player.yaw) * cp;
        drops.spawn(item, n, w, player.x + lx * 0.3, player.y + Player.EYE - 0.3, player.z + lz * 0.3,
                lx * 6 + player.vx, ly * 6 + 1.5, lz * 6 + player.vz, 1.5);
        swing = 0.3;
    }

    private boolean mobBlocks(int bx, int by, int bz, int b) {
        if (!Block.solid(b)) return false;
        for (Mob m : mobs.list) if (m.intersects(bx, by, bz)) return true;
        return false;
    }

    private void survival(double dt) {
        if (player.landedFall > 3.5) damage(Math.floor(player.landedFall - 3));
        player.landedFall = 0;

        if (player.headInWater) {
            player.air -= dt;
            if (player.air <= 0) {
                player.air = 0;
                drownTimer += dt;
                if (drownTimer >= 1) { drownTimer = 0; damage(2); }
            }
        } else {
            player.air = Math.min(Player.MAX_AIR, player.air + dt * 4);
            drownTimer = 0;
        }

        // lava e cacto machucam
        hazardCd -= dt;
        if (hazardCd <= 0) {
            if (player.inLava) { damage(4); hazardCd = 0.5; }
            else if (player.touching(world, Block.CACTUS)) { hit(1); hazardCd = 0.6; }
        }

        // ataques das criaturas
        double[] from = new double[2];
        double mobDamage = mobs.damageTo(player, from) + netDamage;
        if (netDamage > 0) { from[0] = netDamageX; from[1] = netDamageZ; }
        netDamage = 0;
        if (mobDamage > 0) {
            hit(mobDamage);
            double kx = player.x - from[0], kz = player.z - from[1], kl = Math.max(0.01, Math.sqrt(kx * kx + kz * kz));
            player.vx += kx / kl * 8;
            player.vz += kz / kl * 8;
            player.vy = 5;
        }

        // fome: cai devagar, mais rápido correndo; com a barra alta a vida se recupera
        player.food = Math.max(0, player.food - dt * (player.sprinting ? 1 / 12.0 : 1 / 45.0));
        if (player.food >= 16 && time - lastHurt > 4 && player.health < Player.MAX_HEALTH) {
            player.health = Math.min(Player.MAX_HEALTH, player.health + dt * 0.6);
            player.food = Math.max(0, player.food - dt * 0.15);
        }
        if (player.food <= 0) {
            starveTimer += dt;
            if (starveTimer >= 4) { starveTimer = 0; if (player.health > 1) damage(1); }
        } else starveTimer = 0;
        if (player.health <= 0) die();
    }

    private void damage(double n) {
        if (n <= 0) return;
        player.health -= n;
        Sounds.play("dano", 0.8);
        lastHurt = time;
        hurtFlash = 0.45;
    }

    private void die() {
        // como no Minecraft: tudo o que você carregava cai onde você morreu
        if (!creative) {
            for (int i = 0; i < Inventory.TOTAL; i++)
                if (!inv.empty(i)) drops.scatter(inv.id[i], inv.count[i], inv.wear[i], player.x, player.y + 0.8, player.z);
            inv.clear();
            cursorId = cursorCount = cursorWear = 0;
        }
        player.health = 0;
        state = State.DEAD;
        releaseMouse();
    }

    /** Som de quebrar/bater conforme o material do bloco. */
    private static String breakSound(int b) {
        if (b == Block.GLASS || b == Block.ICE) return "quebrar_vidro";
        if (b == Block.SAND || b == Block.GRAVEL || b == Block.SNOW) return "quebrar_areia";
        if (b == Block.WOOL) return "quebrar_planta";
        switch (Block.material(b)) {
            case Block.M_WOOD: return "quebrar_madeira";
            case Block.M_PLANT: return "quebrar_planta";
            case Block.M_SOIL: return "quebrar_terra";
            default: return "quebrar_pedra";
        }
    }

    private static String stepSound(int b) {
        if (b == Block.SAND || b == Block.GRAVEL || b == Block.SNOW) return "passo_areia";
        switch (Block.material(b)) {
            case Block.M_WOOD: return "passo_madeira";
            case Block.M_SOIL: case Block.M_PLANT: return "passo_grama";
            default: return b == Block.WOOL ? "passo_grama" : "passo_pedra";
        }
    }

    /** Passos (a cada ~1,9 bloco andado no chão) e respingo ao cair na água. */
    private void footsteps(double dt) {
        if (player.inWater && !wasInWater && player.vy < -2.5) Sounds.play("respingo", 0.7);
        wasInWater = player.inWater;
        if (!player.onGround || player.flying || player.inWater) return;
        stepAcc += Math.sqrt(player.vx * player.vx + player.vz * player.vz) * dt;
        if (stepAcc < 1.9) return;
        stepAcc = 0;
        int below = world.get((int) Math.floor(player.x), (int) Math.floor(player.y - 0.1), (int) Math.floor(player.z));
        if (below != Block.AIR) Sounds.play(stepSound(below), 0.4);
    }

    private void respawn() {
        world.ensureAround(info.spawnX, info.spawnZ, 1); // o ponto de renascimento pode estar longe, num pedaço descarregado
        player.x = info.spawnX; player.y = info.spawnY; player.z = info.spawnZ;
        player.vx = player.vy = player.vz = 0;
        player.health = Player.MAX_HEALTH;
        player.air = Player.MAX_AIR;
        player.food = Player.MAX_FOOD;
        player.fallDist = player.landedFall = 0;
        hurtFlash = 0;
        resume();
    }

    // =====================================================================
    // transições de tela
    // =====================================================================
    private void enterLobby() {
        if (lastGameWorld != null) { lastGameWorld.close(); lastGameWorld = null; }
        state = State.LOBBY;
        renderer.setWorld(lobbyWorld);
        renderer.breakProgress = 0;
        worlds = Saves.list();
        selected = Math.max(0, Math.min(selected, worlds.size() - 1));
        listScroll = 0;
        confirmDelete = false;
        releaseMouse();
    }

    private void startCreate() {
        fWorld.setLength(0);
        fWorld.append("Novo mundo ").append(worlds.size() + 1);
        fSeed.setLength(0);
        draft = Persona.random(new Random());
        fChar.setLength(0);
        fChar.append(draft.name);
        draftCreative = false;
        focus = 1;
        state = State.CREATE;
    }

    private void createWorld() {
        String name = fWorld.toString().trim();
        if (name.isEmpty()) name = "Mundo sem nome";
        String seedText = fSeed.toString().trim();
        int seed;
        if (seedText.isEmpty()) seed = new Random().nextInt();
        else {
            try { seed = Integer.parseInt(seedText); } catch (NumberFormatException e) { seed = seedText.hashCode(); }
        }
        final Saves.Info i = new Saves.Info();
        i.id = Saves.newId(name);
        i.name = name;
        i.seed = seed;
        i.creative = draftCreative;
        i.created = i.lastPlayed = System.currentTimeMillis();
        draft.name = fChar.toString().trim().isEmpty() ? "Explorador" : fChar.toString().trim();
        i.persona = draft;
        final int s = seed;
        startLoading("Gerando o mundo \"" + name + "\"...", () -> {
            World w = new World(s, Saves.chunkStore(i));
            double[] sp = w.findSpawn();
            i.hasPlayer = true;
            i.spawnX = i.px = sp[0];
            i.spawnY = i.py = sp[1];
            i.spawnZ = i.pz = sp[2];
            i.health = Player.MAX_HEALTH;
            enterWorld(i, w);
            saveSync();
            toast("Mundo criado! Pressione E para abrir o inventário.");
        });
    }

    private void loadWorld(final Saves.Info i) {
        startLoading("Carregando \"" + i.name + "\"...", () -> {
            try {
                // mundos das versões antigas (512 x 512 fixos) viram pedaços e passam a poder crescer
                if (Saves.migrateLegacy(i)) System.out.println("Mundo antigo convertido em pedaços: " + i.name);
            } catch (java.io.IOException e) {
                throw new RuntimeException(e.getMessage(), e);
            }
            World w = new World(i.seed, Saves.chunkStore(i));
            if (!i.hasPlayer) {
                double[] sp = w.findSpawn();
                i.hasPlayer = true;
                i.spawnX = i.px = sp[0];
                i.spawnY = i.py = sp[1];
                i.spawnZ = i.pz = sp[2];
            }
            i.lastPlayed = System.currentTimeMillis();
            enterWorld(i, w);
        });
    }

    private void startLoading(String text, Runnable task) {
        loadingText = text;
        loadingTask = task;
        loadingFrames = 0;
        state = State.LOADING;
    }

    private World lastGameWorld;

    private void enterWorld(Saves.Info i, World w) {
        chatLines.clear();
        closeChat();
        if (lastGameWorld != null && lastGameWorld != w) lastGameWorld.close();
        lastGameWorld = w;
        lobbyWorld.clear(); // o cenário do lobby não precisa ficar na memória enquanto se joga
        w.ensureAround(i.px, i.pz, 2); // o jogador nunca nasce sem chão
        world = w;
        info = i;
        creative = i.creative;
        if (BENCH && System.getProperty("bench.survival") != null) creative = false; // teste: força a sobrevivência
        player = new Player();
        player.x = i.px; player.y = i.py; player.z = i.pz;
        player.yaw = i.yaw; player.pitch = i.pitch;
        player.health = i.health <= 0 ? Player.MAX_HEALTH : i.health;
        player.food = i.food <= 0 ? Player.MAX_FOOD : i.food;
        player.flying = creative && i.flying;
        w.time = i.time;
        inv.deserialize(i.inventory, i.inventoryFormat < 2);
        i.inventoryFormat = 2;
        if (creative && i.inventory.isEmpty())
            for (int k = 0; k < Block.HOTBAR.length; k++) inv.set(k, Block.HOTBAR[k], Inventory.MAX);
        mobs.clear();
        for (String s : i.wolves) { // os lobos domesticados voltam onde estavam
            String[] p = s.split(";", 6);
            if (p.length < 6) continue;
            try {
                Mob m = new Mob(Mob.WOLF, Double.parseDouble(p[0]), Double.parseDouble(p[1]), Double.parseDouble(p[2]));
                m.tamed = true;
                m.sitting = p[3].equals("1");
                m.health = Math.max(1, Math.min(Mob.TAMED_HP, Double.parseDouble(p[4])));
                m.ownerName = p[5];
                mobs.list.add(m);
            } catch (NumberFormatException ignored) {
            }
        }
        mobs.loadAll(i.mobs); // os bichos voltam quando o pedaço deles carregar
        drops.clear();
        particles.clear();
        primed.clear();
        arrows.clear();
        bowCharge = 0;
        chests.clear();
        chest = null;
        chestKey = null;
        for (java.util.Map.Entry<String, String> e : i.chests.entrySet()) {
            Inventory c = new Inventory();
            c.deserialize(e.getValue(), false);
            chests.put(e.getKey(), c);
        }
        furnaces.clear();
        for (java.util.Map.Entry<String, String> e : i.furnaces.entrySet()) furnaces.put(e.getKey(), Furnace.parse(e.getValue()));
        furn = new Furnace();
        furnaceInv = furn.inv;
        cursorId = cursorCount = cursorWear = 0;
        recipeScroll = paletteScroll = 0;
        slot = 0;
        time = 0;
        lastHurt = -100;
        hurtFlash = 0;
        breakProgress = 0;
        breakY = -1;
        renderer.setWorld(w);
        warming = true; // o terreno em volta é gerado e montado antes de liberar o jogo
        warmTime = 0;
        resume();
    }

    private void openChat(char skip) {
        chatOpen = true;
        chatSkip = skip;
        chatInput.setLength(0);
        java.util.Arrays.fill(keys, false);
        lHeld = rHeld = lPending = rPending = false;
    }

    private void closeChat() {
        chatOpen = false;
        chatInput.setLength(0);
    }

    /** Envia o que foi digitado: aparece aqui e vai para todos pela rede. */
    private void sendChat() {
        String text = chatInput.toString().trim();
        closeChat();
        if (text.isEmpty()) return;
        String me = info != null && info.persona != null ? info.persona.name : "Eu";
        addChat("<" + me + "> " + text, new Color(255, 255, 160));
        if (server != null) server.broadcast(new Net.Out(Net.CHAT).s(me).s(text), null);
        else if (toHost != null) toHost.send(new Net.Out(Net.CHAT).s(me).s(text));
        else addChat("(você está sozinho: abra o mundo para LAN no menu de pausa para conversar)", new Color(190, 190, 190));
    }

    private void addChat(String text, Color color) {
        addChatLine(text, color, null);
    }

    private void addChatLine(String text, Color color, BufferedImage img) {
        chatLines.add(new ChatLine(text, color, img));
        while (chatLines.size() > 50) chatLines.remove(0);
        Sounds.play("clique", 0.4);
    }

    private static final Color CHAT_GRAY = new Color(190, 190, 190), CHAT_RED = new Color(255, 150, 150);

    /** Ctrl+O no chat: abre a janela do Windows para escolher uma foto (o jogo continua rodando por trás). */
    private void pickPhoto() {
        if (pickingFile) return;
        if (!System.getProperty("os.name", "").toLowerCase().contains("win")) {
            addChat("(escolher arquivo só funciona no Windows: arraste a foto para a janela do jogo)", CHAT_GRAY);
            return;
        }
        pickingFile = true;
        photoPool.submit(() -> {
            String path = "";
            try {
                String script = "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; "
                        + "Add-Type -AssemblyName System.Windows.Forms; "
                        + "$o = New-Object System.Windows.Forms.Form; $o.TopMost = $true; "
                        + "$f = New-Object System.Windows.Forms.OpenFileDialog; "
                        + "$f.Title = 'Escolha uma foto para o chat'; "
                        + "$f.Filter = 'Imagens|*.png;*.jpg;*.jpeg;*.gif;*.bmp|Todos os arquivos|*.*'; "
                        + "if ($f.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($f.FileName) }";
                // caminho completo: o PATH de quem abriu o jogo pode não incluir a pasta do PowerShell
                String root = System.getenv("SystemRoot");
                if (root == null) root = System.getenv("windir");
                java.io.File ps = root == null ? null : new java.io.File(root, "System32\\WindowsPowerShell\\v1.0\\powershell.exe");
                String exe = ps != null && ps.isFile() ? ps.getPath() : "powershell";
                Process pr = new ProcessBuilder(exe, "-NoProfile", "-STA", "-NonInteractive", "-Command", script).start();
                java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[1024];
                int n;
                try (java.io.InputStream in = pr.getInputStream()) {
                    while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                }
                pr.waitFor();
                path = new String(bos.toByteArray(), "UTF-8").replace("﻿", "").trim();
            } catch (Exception e) {
                final String msg = String.valueOf(e.getMessage());
                events.add(() -> addChat("Não consegui abrir a janela de escolher arquivo: " + msg, CHAT_RED));
            }
            final String chosen = path;
            events.add(() -> {
                pickingFile = false;
                if (!chosen.isEmpty()) sendPhoto(new java.io.File(chosen));
            });
        });
    }

    /** Prepara a foto (reduz e comprime) em segundo plano e, pronta, mostra no chat e manda para os amigos. */
    private void sendPhoto(java.io.File f) {
        if (world == null) return;
        long now = System.currentTimeMillis();
        if (now - lastPhotoSent < 1500) { addChat("(espere um instante antes de mandar outra foto)", CHAT_GRAY); return; }
        lastPhotoSent = now;
        addChat("Preparando a foto " + f.getName() + "...", CHAT_GRAY);
        photoPool.submit(() -> {
            try {
                byte[] jpg = ChatImage.prepare(f);
                BufferedImage img = ChatImage.decode(jpg); // a mesma imagem que os amigos vão ver
                events.add(() -> postPhoto(jpg, img));
            } catch (java.io.IOException | RuntimeException e) {
                final String msg = String.valueOf(e.getMessage());
                events.add(() -> addChat("Não consegui mandar a foto: " + msg, CHAT_RED));
            }
        });
    }

    private void postPhoto(byte[] jpg, BufferedImage img) {
        String me = info != null && info.persona != null ? info.persona.name : "Eu";
        addChatLine("<" + me + "> enviou uma foto:", new Color(255, 255, 160), img);
        if (server != null) server.broadcast(new Net.Out(Net.CHAT_IMAGE).s(me).raw(jpg), null);
        else if (toHost != null) toHost.send(new Net.Out(Net.CHAT_IMAGE).s(me).raw(jpg));
        else addChat("(você está sozinho: abra o mundo para LAN no menu de pausa para os amigos verem)", CHAT_GRAY);
    }

    /** Foto que chegou pela rede: confere o tamanho, abre e mostra no chat. Retorna os bytes se for válida (para repassar). */
    private byte[] receivePhoto(java.io.DataInputStream d, String from) throws java.io.IOException {
        int n = d.readInt();
        if (n <= 0 || n > ChatImage.MAX_BYTES) return null;
        byte[] data = new byte[n];
        d.readFully(data);
        try {
            BufferedImage img = ChatImage.decode(data);
            addChatLine("<" + from + "> enviou uma foto:", Color.WHITE, img);
            return data;
        } catch (java.io.IOException | RuntimeException e) {
            System.out.println("Foto recebida ilegível: " + e.getMessage());
            return null;
        }
    }

    private void pause() {
        if (world == null) return;
        closeChat();
        state = State.PAUSED;
        releaseMouse();
        saveAsync();
    }

    private void resume() {
        state = State.PLAYING;
        lPending = rPending = lHeld = rHeld = false;
        bowCharge = 0;
        capture();
    }

    // ----------------------------- lobo domesticável -----------------------------

    /** Ovo de criatura: no multijogador quem cria a criatura é o anfitrião (ele cuida de todas). */
    private void spawnFromEgg(int type, double x, double y, double z, double yaw) {
        if (type < 0 || type >= Mob.TYPES) return;
        if (toHost != null) {
            toHost.send(new Net.Out(Net.MOB_SPAWN).i(type).f(x).f(y).f(z).f(yaw));
            return;
        }
        Mob m = new Mob(type, x, y + 0.01, z);
        m.yaw = yaw;
        mobs.list.add(m);
        Sounds.playAt(Mob.SOUNDS[type] != null ? Mob.SOUNDS[type] : "colocar", x, y + 0.5, z, player, 0.8);
        particles.blockBits(Block.WOOL, (int) Math.floor(x), (int) Math.floor(y), (int) Math.floor(z), 8);
    }

    private Player ownerOf(String name) {
        if (name == null || name.isEmpty() || player == null) return null;
        if (info != null && name.equals(info.persona.name)) return player;
        for (Remote r : remotes.values()) if (r.hasState && r.name.equals(name)) return r.body;
        return null;
    }

    private static boolean isMeat(int id) {
        return id == Items.RAW_MEAT || id == Items.COOKED_MEAT || id == Items.RAW_PORK || id == Items.COOKED_PORK
                || id == Items.RAW_MUTTON || id == Items.COOKED_MUTTON || id == Items.RAW_CHICKEN || id == Items.COOKED_CHICKEN
                || id == Items.RAW_FISH || id == Items.COOKED_FISH;
    }

    /** Botão direito num lobo, por este jogador. No multijogador quem decide é o anfitrião. */
    private void useOnMob(Mob m, int held) {
        boolean eats = (!m.tamed && held == Items.BONE) || (m.tamed && isMeat(held));
        if (eats && !creative) inv.set(slot, held, inv.count[slot] - 1, inv.wear[slot]); // o osso/a carne é gasto
        if (toHost != null) {
            toHost.send(new Net.Out(Net.MOB_USE).i(m.id).i(held));
            return;
        }
        String msg = mobUse(m, held, info.persona.name);
        if (msg != null) toast(msg);
    }

    /**
     * O que acontece quando `user` usa `held` no lobo m (roda no anfitrião). Osso: 1 chance em 3 de domar
     * (ele senta e passa a ser de quem deu o osso). Carne: cura o lobo domesticado. Mão vazia (do dono): senta/levanta.
     */
    private String mobUse(Mob m, int held, String user) {
        if (m.type != Mob.WOLF) return null;
        if (!m.tamed) {
            if (held != Items.BONE) return m.angry > 0 ? "O lobo está bravo!" : "Lobos gostam de osso...";
            if (rnd.nextInt(3) == 0) {
                m.tamed = true;
                m.ownerName = user;
                m.sitting = true;
                m.health = Mob.TAMED_HP;
                m.angry = 0;
                m.target = null;
                Sounds.playAt("domar", m.x, m.y + 0.6, m.z, player, 1.0);
                particles.blockBits(Block.WOOL, (int) Math.floor(m.x), (int) Math.floor(m.y + 0.5), (int) Math.floor(m.z), 12);
                return "O lobo agora é seu! Clique nele com a mão vazia para ele sentar ou te seguir.";
            }
            Sounds.playAt("lobo", m.x, m.y + 0.6, m.z, player, 0.8);
            return "O lobo cheirou o osso... tente de novo";
        }
        if (isMeat(held)) {
            m.health = Math.min(Mob.TAMED_HP, m.health + Math.max(2, Items.food(held)));
            Sounds.playAt("comer", m.x, m.y + 0.6, m.z, player, 0.7);
            return "O lobo comeu (" + (int) m.health + "/" + (int) Mob.TAMED_HP + " de vida)";
        }
        if (!m.ownerName.equals(user)) return "Esse lobo é de " + m.ownerName;
        m.sitting = !m.sitting;
        m.target = null;
        return m.sitting ? "Lobo: senta!" : "Lobo: vem comigo!";
    }

    /** Tecla E: inventário com a grade de criação 2x2. */
    private void openInventory() {
        openCrafting(2);
    }

    /** Inventário com a grade de criação (3 = bancada). */
    private void openCrafting(int size) {
        craftSize = size;
        furnaceOpen = false;
        state = State.INVENTORY;
        releaseMouse();
    }

    /** Abre a fornalha. No mundo de um amigo ela fica com o anfitrião: pede o conteúdo e abre quando chegar. */
    private void openFurnace(int x, int y, int z) {
        if (toHost != null) { toHost.send(new Net.Out(Net.FURNACE_OPEN).i(x).i(y).i(z)); return; }
        String key = chestKey(x, y, z);
        Furnace f = furnaces.get(key);
        if (f == null) { f = new Furnace(); furnaces.put(key, f); }
        showFurnace(x, y, z, f);
    }

    private void showFurnace(int x, int y, int z, Furnace f) {
        furnaceX = x; furnaceY = y; furnaceZ = z;
        furn = f;
        furnaceInv = furn.inv;
        furnaceOpen = true;
        state = State.INVENTORY;
        releaseMouse();
    }

    private void closeInventory() {
        if (chest != null && chestKey != null && toHost != null) { // amigo: devolve o conteúdo ao anfitrião
            String[] k = chestKey.split(",");
            toHost.send(new Net.Out(Net.CHEST_SET).i(Integer.parseInt(k[0])).i(Integer.parseInt(k[1])).i(Integer.parseInt(k[2]))
                    .s(chest.serialize(Inventory.CHEST)));
        }
        chest = null;
        chestKey = null;
        // o que ficou na grade, na fornalha ou preso no mouse volta para a mochila (se não couber, cai no chão)
        for (int i = 0; i < 9; i++) giveBack(craftGrid, i, true);
        if (furnaceOpen && toHost != null) sendFurnaceBack();
        furnaceOpen = false;
        if (cursorCount > 0) {
            int left = returnCursor();
            if (left > 0) dropNearPlayer(cursorId, left, cursorWear);
            cursorId = cursorCount = cursorWear = 0;
        }
        dragFrom = null;
        invRightDown = false;
        resume();
    }

    /** Devolve o conteúdo de um espaço (da grade ou da fornalha) à mochila; o que não couber cai no chão (ou some). */
    private void giveBack(Inventory src, int i, boolean dropRest) {
        if (src.empty(i)) return;
        int id = src.id[i], n = src.count[i], w = src.wear[i];
        src.set(i, 0, 0);
        int left = inv.addRange(id, n, w, 0, Inventory.SIZE);
        if (left > 0 && dropRest && world != null && player != null) dropNearPlayer(id, left, w);
    }

    private void dropNearPlayer(int id, int n, int w) {
        if (world == null || player == null || n <= 0) return;
        drops.spawn(id, n, w, player.x, player.y + 1.2, player.z, Math.sin(player.yaw) * 2, 2, Math.cos(player.yaw) * 2, 1.0);
        toast(n + " " + Items.name(id) + " caiu no chão: inventário cheio");
    }

    /** Devolve o item preso no mouse ao inventário (mantendo o desgaste de ferramentas). Retorna o que sobrou. */
    private int returnCursor() {
        if (cursorCount <= 0) return 0;
        if (Items.isDurable(cursorId)) {
            for (int i = 0; i < Inventory.SIZE; i++)
                if (inv.empty(i)) { inv.set(i, cursorId, 1, cursorWear); return 0; }
            return 1;
        }
        return inv.add(cursorId, cursorCount);
    }

    private void quitToLobby() {
        closeCursorItem();
        closeNet("O anfitrião saiu do mundo");
        saveSync();
        world = null;
        player = null;
        info = null;
        enterLobby();
    }

    /** Amigo: a fornalha fechada volta para o anfitrião, com o que tem dentro e o fogo como estão. */
    private void sendFurnaceBack() {
        toHost.send(new Net.Out(Net.FURNACE_SET).i(furnaceX).i(furnaceY).i(furnaceZ).s(furn.serialize()));
        toHost.flush();
    }

    private void closeCursorItem() {
        if (cursorCount > 0 && world != null) returnCursor();
        cursorId = cursorCount = cursorWear = 0;
        if (world != null) { // saindo com a grade ou a fornalha cheias: os itens voltam para a mochila antes de salvar
            for (int i = 0; i < 9; i++) giveBack(craftGrid, i, false);
            if (furnaceOpen && toHost != null) sendFurnaceBack();
        }
        furnaceOpen = false;
        craftGrid.clear();
        furn = new Furnace(); // a do mundo fica guardada em furnaces (e é salva)
        furnaceInv = furn.inv;
    }

    private void quit() {
        if (world != null) {
            closeCursorItem();
            closeNet("O anfitrião fechou o jogo");
            saveSync();
        }
        waitForSaves();
        running = false;
        System.exit(0);
    }

    // =====================================================================
    // multijogador
    // =====================================================================

    /** Anfitrião: abre o mundo atual para amigos entrarem pela LAN/Radmin. */
    private void openToLan() {
        if (world == null || server != null || toHost != null) return;
        try {
            server = new Net.Server(Net.PORT, netInbox);
            world.listener = this::onLocalBlock;
            List<String> ips = Net.localAddresses();
            toast("Aberto na LAN! Seu IP: " + (ips.isEmpty() ? "?" : ips.get(0)) + "  porta " + Net.PORT);
        } catch (java.io.IOException e) {
            server = null;
            toast("Não consegui abrir na porta " + Net.PORT + ": " + e.getMessage());
        }
    }

    /** Um bloco mudou neste jogo: o anfitrião repassa a todos; o amigo avisa o anfitrião. */
    private void onLocalBlock(int x, int y, int z, int b) {
        Net.Out o = new Net.Out(Net.BLOCK).i(x).i(y).i(z).i(b | world.rotation(x, y, z) << 8); // bloco + direção
        if (server != null) server.broadcast(o, null);
        else if (toHost != null && !applyingRemote) toHost.send(o);
    }

    private boolean multiplayer() {
        return server != null || toHost != null;
    }

    /** Fecha a rede: o anfitrião avisa e desconecta todos; o amigo salva seu progresso no anfitrião e sai. */
    private void closeNet(String reason) {
        if (server != null) {
            server.broadcast(new Net.Out(Net.BYE).s(reason), null);
            server.close();
            server = null;
        }
        if (toHost != null) {
            sendSaveState();
            toHost.send(new Net.Out(Net.BYE).s("saiu"));
            toHost.flush();
            toHost.close();
            toHost = null;
        }
        remotes.clear();
        if (world != null) world.listener = null;
    }

    /** Amigo: conecta no anfitrião, recebe o mundo e entra. */
    private void joinGame() {
        final String ip = fIp.toString().trim();
        String nm = fJoinName.toString().trim();
        final String name = nm.isEmpty() ? "Amigo" : nm;
        if (ip.isEmpty()) { toast("Digite o IP do anfitrião"); return; }
        settings.lanIp = ip;
        settings.lanName = name;
        settings.lanPersona = joinPersona.skin + "," + joinPersona.hair + "," + joinPersona.shirt + "," + joinPersona.pants;
        settings.save();
        joinPersona.name = name;
        startLoading("Conectando a " + ip + "...", () -> {
            String host = ip;
            int port = Net.PORT;
            int colon = ip.lastIndexOf(':');
            if (colon > 0) { host = ip.substring(0, colon); port = Integer.parseInt(ip.substring(colon + 1).trim()); }
            host = host.replace(" (Radmin)", "").trim();
            Net.Connection c;
            Net.Packet w;
            try {
                java.net.Socket s = new java.net.Socket();
                s.connect(new java.net.InetSocketAddress(host, port), 6000);
                s.setSoTimeout(60000);
                c = new Net.Connection(s, netInbox);
                c.send(new Net.Out(Net.HELLO).i(Net.VERSION).s(name)
                        .i(joinPersona.skin).i(joinPersona.hair).i(joinPersona.shirt).i(joinPersona.pants));
                c.flush();
                w = c.readPacket();
                s.setSoTimeout(0);
            } catch (Exception e) {
                throw new RuntimeException("não consegui conectar em " + host + ":" + port + " (" + e.getMessage()
                        + "). Confira o IP, se o mundo foi aberto para LAN e o firewall.", e);
            }
            try {
                java.io.DataInputStream d = w.in();
                if (w.type == Net.BYE) throw new RuntimeException(d.readUTF());
                if (w.type != Net.WELCOME) throw new RuntimeException("resposta inesperada do anfitrião");
                Saves.Info i = new Saves.Info();
                i.name = "LAN: " + d.readUTF();
                i.seed = d.readInt();
                i.creative = d.readBoolean();
                i.time = d.readDouble();
                i.day = d.readInt();
                i.spawnX = d.readFloat(); i.spawnY = d.readFloat(); i.spawnZ = d.readFloat();
                myId = d.readInt();
                String state = d.readUTF();
                // o amigo gera o terreno sozinho (mesma semente = mesmo mundo); o anfitrião manda só o que foi modificado
                byte[] changed = new byte[d.readInt()];
                d.readFully(changed);
                World.MemoryStore changedChunks = World.importModified(changed);
                i.persona = joinPersona;
                i.hasPlayer = true;
                i.px = i.spawnX; i.py = i.spawnY; i.pz = i.spawnZ;
                applyState(i, state);
                World world2 = new World(i.seed, changedChunks);
                toHost = c;
                enterWorld(i, world2);
                world2.listener = this::onLocalBlock;
                c.startReading();
                toast("Conectado! Mundo do anfitrião carregado.");
            } catch (java.io.IOException e) {
                c.close();
                throw new RuntimeException("conexão interrompida: " + e.getMessage(), e);
            } catch (RuntimeException e) {
                c.close();
                throw e;
            }
        });
    }

    /** Lê o estado salvo de um jogador (Remote.stateString) para dentro de um Saves.Info. */
    private static void applyState(Saves.Info i, String s) {
        if (s == null || s.isEmpty()) return;
        String[] p = s.split(";", 8);
        try {
            i.px = Double.parseDouble(p[0]); i.py = Double.parseDouble(p[1]); i.pz = Double.parseDouble(p[2]);
            i.yaw = Double.parseDouble(p[3]); i.pitch = Double.parseDouble(p[4]);
            i.health = Double.parseDouble(p[5]); i.food = Double.parseDouble(p[6]);
            i.inventory = p.length > 7 ? p[7] : "";
        } catch (Exception ignored) {
        }
    }

    private void sendSaveState() {
        if (toHost == null || player == null) return;
        toHost.send(new Net.Out(Net.SAVE_STATE).s(Remote.stateString(player.x, player.y, player.z, player.yaw, player.pitch,
                player.health, player.food, inv.serialize())));
    }

    /** Roda todo quadro (em qualquer tela) enquanto há rede: trata mensagens e manda o estado. */
    private void netUpdate(double dt) {
        if (!multiplayer()) return;
        Net.Packet p;
        while ((p = netInbox.poll()) != null) {
            try {
                if (server != null) hostPacket(p);
                else clientPacket(p);
            } catch (java.io.IOException e) {
                System.out.println("Pacote inválido: " + e.getMessage());
            }
            if (!multiplayer()) return;
        }
        for (Remote r : remotes.values()) r.update(dt);
        if (world == null || player == null) return;

        // anfitrião continua simulando o mundo com o menu aberto
        if (server != null && state != State.PLAYING && state != State.LOADING) worldTick(dt);

        netStateTimer -= dt;
        if (netStateTimer <= 0) {
            netStateTimer = 0.05; // 20 vezes por segundo
            Net.Out o = new Net.Out(Net.STATE).i(myId).f(player.x).f(player.y).f(player.z).f(player.yaw).f(player.pitch)
                    .b(swing > 0.2).i(inv.empty(slot) ? 0 : inv.id[slot]);
            if (server != null) server.broadcast(o, null); else toHost.send(o);
        }
        if (server != null) {
            netTimeTimer -= dt;
            if (netTimeTimer <= 0) {
                netTimeTimer = 2;
                server.broadcast(new Net.Out(Net.TIME).dbl(world.time).i(info.day), null);
            }
            netDropTimer -= dt;
            if (netDropTimer <= 0) { // itens que estão caindo ou deslizando
                netDropTimer = 0.2;
                List<Drops.Drop> moving = drops.takeMoving();
                if (!moving.isEmpty()) {
                    Net.Out o = new Net.Out(Net.DROP_SYNC).i(Math.min(moving.size(), 200));
                    for (int k = 0; k < moving.size() && k < 200; k++) {
                        Drops.Drop dr = moving.get(k);
                        o.i(dr.id).f(dr.x).f(dr.y).f(dr.z).f(dr.vx).f(dr.vy).f(dr.vz);
                    }
                    server.broadcast(o, null);
                }
            }
            netMobTimer -= dt;
            if (netMobTimer <= 0) {
                netMobTimer = 0.1;
                Net.Out o = new Net.Out(Net.MOBS).i(mobs.list.size());
                for (Mob m : mobs.list)
                    o.i(m.id).i(m.type).f(m.x).f(m.y).f(m.z).f(m.yaw).f(m.walk).b(m.hurt > 0)
                            .f(m.netAnim()); // pavio, arco, ou o estado do lobo/urso/pássaro
                server.broadcast(o, null);
            }
            server.flushAll();
        } else {
            netSaveTimer -= dt;
            if (netSaveTimer <= 0) { netSaveTimer = 10; sendSaveState(); }
            toHost.flush();
        }
    }

    /** Mensagens que o anfitrião recebe dos amigos. */
    private void hostPacket(Net.Packet p) throws java.io.IOException {
        java.io.DataInputStream d = p.in();
        Remote r = (Remote) p.from.tag;
        switch (p.type) {
            case Net.HELLO: {
                int version = d.readInt();
                String name = d.readUTF();
                Persona pe = new Persona();
                pe.skin = Math.floorMod(d.readInt(), Persona.SKIN.length);
                pe.hair = Math.floorMod(d.readInt(), Persona.HAIR.length);
                pe.shirt = Math.floorMod(d.readInt(), Persona.SHIRT.length);
                pe.pants = Math.floorMod(d.readInt(), Persona.PANTS.length);
                if (version != Net.VERSION) {
                    p.from.send(new Net.Out(Net.BYE).s("Versões diferentes do jogo: atualize os dois para a mesma versão."));
                    p.from.flush();
                    p.from.close();
                    return;
                }
                String unique = name;
                for (int n = 2; nameTaken(unique); n++) unique = name + " " + n;
                pe.name = unique;
                Remote nr = new Remote(nextRemoteId++, unique, pe);
                nr.conn = p.from;
                p.from.tag = nr;
                // manda os pedaços modificados (o terreno o amigo gera sozinho pela semente) e o estado salvo desse amigo
                p.from.send(new Net.Out(Net.WELCOME).s(info.name).i(info.seed).b(creative).dbl(world.time).i(info.day)
                        .f(info.spawnX).f(info.spawnY).f(info.spawnZ).i(nr.id).s(info.lanPlayers.getOrDefault(unique, ""))
                        .raw(world.exportModified()));
                // quem já está no mundo (o anfitrião e os outros amigos)
                p.from.send(joinPacket(0, info.persona.name, info.persona));
                for (Remote o : remotes.values()) p.from.send(joinPacket(o.id, o.name, o.persona));
                for (Drops.Drop dr : drops.all()) p.from.send(dropPacket(dr)); // itens que já estão no chão
                for (Arrows.Arrow a : arrows.list) { // flechas que já estão no mundo
                    p.from.send(arrowPacket(a, false));
                    if (a.stuck) p.from.send(stuckPacket(a));
                }
                server.broadcast(joinPacket(nr.id, unique, pe), p.from);
                remotes.put(nr.id, nr);
                toast(unique + " entrou no mundo"); addChat(unique + " entrou no mundo", new Color(255, 230, 120));
                break;
            }
            case Net.STATE: {
                if (r == null) return;
                d.readInt();
                float x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), yaw = d.readFloat(), pitch = d.readFloat();
                boolean sw = d.readBoolean();
                int held = d.readInt();
                r.setTarget(x, y, z, yaw, pitch, sw, held);
                server.broadcast(new Net.Out(Net.STATE).i(r.id).f(x).f(y).f(z).f(yaw).f(pitch).b(sw).i(held), p.from);
                break;
            }
            case Net.BLOCK: {
                if (r == null) return;
                int x = d.readInt(), y = d.readInt(), z = d.readInt(), v = d.readInt();
                int b = v & 0xFF, rot = (v >> 8) & 3;
                if (World.inBounds(x, y, z) && b < Block.COUNT) {
                    world.ensureChunk(x >> 4, z >> 4); // o amigo mexeu longe daqui: carrega o pedaço para valer a mudança
                    if (world.get(x, y, z) == Block.CHEST && b != Block.CHEST) { // baú quebrado por um amigo: o conteúdo cai no chão
                        Inventory c = chests.remove(chestKey(x, y, z));
                        if (c != null) {
                            if (c == chest) { chest = null; chestKey = null; }
                            for (int k = 0; k < Inventory.CHEST; k++)
                                if (!c.empty(k)) drops.scatter(c.id[k], c.count[k], c.wear[k], x + 0.5, y + 0.5, z + 0.5);
                        }
                    }
                    int was = world.get(x, y, z);
                    if ((was == Block.FURNACE || was == Block.FURNACE_LIT) && b != Block.FURNACE && b != Block.FURNACE_LIT) spillFurnace(x, y, z);
                    world.setRot(x, y, z, b, rot); // repassa a todos pelo listener
                }
                break;
            }
            case Net.SHOOT: { // um amigo soltou uma flecha: ela nasce aqui e vai para todos
                if (r == null) return;
                float x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), vx = d.readFloat(), vy = d.readFloat(), vz = d.readFloat();
                float dmg = d.readFloat();
                boolean pickup = d.readBoolean();
                double sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
                if (!(sp <= 42) || !(dmg >= 0 && dmg <= 9.5)) return; // fora do que o arco consegue
                spawnArrow(r.id, -1, x, y, z, vx, vy, vz, dmg, pickup && !creative);
                break;
            }
            case Net.DROP_REQ: { // um amigo soltou um item: o anfitrião cria e avisa todos
                if (r == null) return;
                int item = d.readInt(), count = d.readInt(), wear = d.readInt();
                double x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), vx = d.readFloat(), vy = d.readFloat(), vz = d.readFloat();
                double delay = d.readFloat();
                if (!Items.exists(item) || count < 1 || count > Items.maxStack(item) || wear < 0 || !(delay >= 0 && delay <= 3)) return;
                if (!(Math.abs(vx) < 30 && Math.abs(vy) < 30 && Math.abs(vz) < 30)) return;
                if (r.hasState && (Math.abs(x - r.body.x) > 40 || Math.abs(z - r.body.z) > 40)) return; // longe demais de quem pediu
                drops.spawn(item, count, wear, x, y, z, vx, vy, vz, delay);
                break;
            }
            case Net.DROP_TAKEN: { // resposta do amigo a uma oferta: o que não coube continua no chão
                if (r == null) return;
                int id = d.readInt(), left = d.readInt();
                Drops.Drop dr = drops.byId(id);
                if (dr == null) return;
                if (left <= 0) { drops.removeById(id); server.broadcast(new Net.Out(Net.DROP_GONE).i(id), null); }
                else {
                    if (left < dr.count) { dr.count = left; server.broadcast(new Net.Out(Net.DROP_SET).i(id).i(left), null); }
                    dr.pending = 2.0; // inventário cheio: não insiste por um tempo
                }
                break;
            }
            case Net.CHEST_OPEN: {
                if (r == null) return;
                int x = d.readInt(), y = d.readInt(), z = d.readInt();
                if (world.get(x, y, z) != Block.CHEST) return;
                Inventory c = chestFor(x, y, z);
                p.from.send(new Net.Out(Net.CHEST_DATA).i(x).i(y).i(z).s(c.serialize(Inventory.CHEST)));
                break;
            }
            case Net.FURNACE_OPEN: {
                if (r == null) return;
                int x = d.readInt(), y = d.readInt(), z = d.readInt();
                int fb = world.get(x, y, z);
                if (fb != Block.FURNACE && fb != Block.FURNACE_LIT) return;
                String key = chestKey(x, y, z);
                Furnace f = furnaces.get(key);
                if (f == null) { f = new Furnace(); furnaces.put(key, f); }
                if (f == furn && furnaceOpen) { p.from.send(new Net.Out(Net.TOAST).s("O anfitrião está usando essa fornalha")); return; }
                if (f.heldBy != null && !f.heldBy.closed && f.heldBy != p.from) { p.from.send(new Net.Out(Net.TOAST).s("Outro jogador está usando essa fornalha")); return; }
                f.heldBy = p.from;
                p.from.send(new Net.Out(Net.FURNACE_DATA).i(x).i(y).i(z).s(f.serialize()));
                break;
            }
            case Net.FURNACE_SET: {
                if (r == null) return;
                int x = d.readInt(), y = d.readInt(), z = d.readInt();
                String data = d.readUTF();
                String key = chestKey(x, y, z);
                Furnace f = furnaces.get(key);
                if (f == null || f.heldBy != p.from) return; // só quem abriu devolve
                int fb = world.get(x, y, z);
                if (fb != Block.FURNACE && fb != Block.FURNACE_LIT) return;
                Furnace got = Furnace.parse(data);
                for (int k = 0; k < 3; k++) f.inv.set(k, got.inv.id[k], got.inv.count[k], got.inv.wear[k]);
                f.heat = got.heat; f.heatMax = got.heatMax; f.progress = got.progress;
                f.heldBy = null;
                break;
            }
            case Net.CHEST_SET: {
                if (r == null) return;
                int x = d.readInt(), y = d.readInt(), z = d.readInt();
                String data = d.readUTF();
                if (world.get(x, y, z) != Block.CHEST) return;
                Inventory c = chests.get(chestKey(x, y, z));
                if (c == null) { c = new Inventory(); chests.put(chestKey(x, y, z), c); }
                c.deserialize(data, false);
                break;
            }
            case Net.HIT_MOB: {
                if (r == null) return;
                Mob m = mobs.byId(d.readInt());
                double dmg = d.readFloat(), kx = d.readFloat(), kz = d.readFloat();
                if (m == null || m.hurt > 0) return;
                m.damage(dmg);
                m.vx += kx * 7; m.vz += kz * 7; m.vy = 5;
                Sounds.playAt("criatura_dano", m.x, m.y + 0.8, m.z, player, 0.9);
                if (m.health <= 0) { // o que a criatura solta cai no chão para todos verem (como quando o anfitrião a mata)
                    int[] loot = m.drops(rnd);
                    for (int k = 0; k < loot.length; k += 2) drops.scatter(loot[k], loot[k + 1], 0, m.x, m.y + 0.4, m.z);
                }
                break;
            }
            case Net.SAVE_STATE:
                if (r != null) info.lanPlayers.put(r.name, d.readUTF());
                break;
            case Net.CHAT: {
                if (r == null) return;
                d.readUTF(); // o nome vem do anfitrião (o mesmo das etiquetas)
                String text = d.readUTF();
                if (text.length() > 100) text = text.substring(0, 100);
                addChat("<" + r.name + "> " + text, Color.WHITE);
                server.broadcast(new Net.Out(Net.CHAT).s(r.name).s(text), p.from);
                break;
            }
            case Net.MOB_SPAWN: { // um amigo usou um ovo de criatura
                if (r == null) return;
                int type = d.readInt();
                float x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), yaw = d.readFloat();
                if (world.isLoaded((int) Math.floor(x), (int) Math.floor(z)) && y > -5 && y < World.SY + 20) spawnFromEgg(type, x, y, z, yaw);
                break;
            }
            case Net.MOB_USE: { // um amigo usou um item num lobo
                if (r == null) return;
                Mob m = mobs.byId(d.readInt());
                int held = d.readInt();
                if (m == null) return;
                String msg = mobUse(m, held, r.name);
                if (msg != null) p.from.send(new Net.Out(Net.TOAST).s(msg));
                break;
            }
            case Net.CHAT_IMAGE: { // foto de um amigo: aparece aqui e vai para os outros
                if (r == null) return;
                d.readUTF();
                byte[] photo = receivePhoto(d, r.name);
                if (photo != null) server.broadcast(new Net.Out(Net.CHAT_IMAGE).s(r.name).raw(photo), p.from);
                break;
            }
            case Net.BYE:
            case Net.CLOSED:
                if (r != null && remotes.remove(r.id) != null) {
                    server.broadcast(new Net.Out(Net.LEAVE).i(r.id), p.from);
                    { toast(r.name + " saiu do mundo"); addChat(r.name + " saiu do mundo", new Color(255, 230, 120)); }
                }
                p.from.close();
                server.clients.remove(p.from);
                break;
            default:
                break;
        }
    }

    private boolean nameTaken(String n) {
        if (info != null && info.persona.name.equalsIgnoreCase(n)) return true;
        for (Remote r : remotes.values()) if (r.name.equalsIgnoreCase(n)) return true;
        return false;
    }

    private static Net.Out joinPacket(int id, String name, Persona pe) {
        return new Net.Out(Net.JOIN).i(id).s(name).i(pe.skin).i(pe.hair).i(pe.shirt).i(pe.pants);
    }

    /** Mensagens que o amigo recebe do anfitrião. */
    private void clientPacket(Net.Packet p) throws java.io.IOException {
        java.io.DataInputStream d = p.in();
        switch (p.type) {
            case Net.JOIN: {
                int id = d.readInt();
                String name = d.readUTF();
                Persona pe = new Persona();
                pe.name = name;
                pe.skin = Math.floorMod(d.readInt(), Persona.SKIN.length);
                pe.hair = Math.floorMod(d.readInt(), Persona.HAIR.length);
                pe.shirt = Math.floorMod(d.readInt(), Persona.SHIRT.length);
                pe.pants = Math.floorMod(d.readInt(), Persona.PANTS.length);
                remotes.put(id, new Remote(id, name, pe));
                if (id != 0) { toast(name + " entrou no mundo"); addChat(name + " entrou no mundo", new Color(255, 230, 120)); }
                break;
            }
            case Net.LEAVE: {
                Remote r = remotes.remove(d.readInt());
                if (r != null) { toast(r.name + " saiu do mundo"); addChat(r.name + " saiu do mundo", new Color(255, 230, 120)); }
                break;
            }
            case Net.STATE: {
                Remote r = remotes.get(d.readInt());
                float x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), yaw = d.readFloat(), pitch = d.readFloat();
                boolean sw = d.readBoolean();
                int held = d.readInt();
                if (r != null) r.setTarget(x, y, z, yaw, pitch, sw, held);
                break;
            }
            case Net.BLOCK: {
                int x = d.readInt(), y = d.readInt(), z = d.readInt(), v = d.readInt();
                int b = v & 0xFF, rot = (v >> 8) & 3;
                if (world != null && World.inBounds(x, y, z) && b < Block.COUNT) {
                    applyingRemote = true;
                    world.ensureChunk(x >> 4, z >> 4); // pode ser longe do amigo: o pedaço precisa existir para a mudança valer
                    world.setRot(x, y, z, b, rot);
                    applyingRemote = false;
                }
                break;
            }
            case Net.TIME:
                if (world != null) { world.time = d.readDouble(); info.day = d.readInt(); }
                break;
            case Net.MOBS: {
                int n = d.readInt();
                java.util.Set<Integer> seen = new java.util.HashSet<>();
                for (int k = 0; k < n; k++) {
                    int id = d.readInt(), type = d.readInt();
                    float x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), yaw = d.readFloat(), walk = d.readFloat();
                    boolean hurt = d.readBoolean();
                    float anim = d.readFloat();
                    Mob m = mobs.byId(id);
                    if (m == null) { m = new Mob(type, x, y, z); m.id = id; mobs.list.add(m); }
                    m.vx = (x - m.x) * 10; m.vz = (z - m.z) * 10; // para a animação das pernas
                    m.x = x; m.y = y; m.z = z; m.yaw = yaw; m.walk = walk;
                    if (hurt) m.hurt = 0.1;
                    m.applyNetAnim(anim);
                    seen.add(id);
                }
                mobs.list.removeIf(m -> !seen.contains(m.id));
                break;
            }
            case Net.EXPLODE: {
                float x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), power = d.readFloat();
                if (world != null && player != null) { drops.blast(x, y, z, power); blastEffects(x, y, z, power); }
                break;
            }
            case Net.ARROW: {
                int id = d.readInt(), owner = d.readInt();
                float x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), vx = d.readFloat(), vy = d.readFloat(), vz = d.readFloat();
                boolean sound = d.readBoolean();
                if (world == null || player == null) break;
                arrows.mirror(id, owner, x, y, z, vx, vy, vz);
                if (sound && owner != myId) Sounds.playAt("arco_disparo", x, y, z, player, 0.8);
                break;
            }
            case Net.ARROW_STUCK: {
                Arrows.Arrow a = arrows.byId(d.readInt());
                float x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), dx = d.readFloat(), dy = d.readFloat(), dz = d.readFloat();
                int bx = d.readInt(), by = d.readInt(), bz = d.readInt();
                if (a == null || world == null) break;
                boolean was = a.stuck;
                Arrows.stick(a, x, y, z, dx, dy, dz, bx, by, bz);
                if (!was) arrowStuckSound(a, by == Integer.MIN_VALUE ? Block.STONE : world.get(bx, by, bz));
                break;
            }
            case Net.ARROW_GONE: {
                Arrows.Arrow a = arrows.byId(d.readInt());
                int kind = d.readInt();
                float x = d.readFloat(), y = d.readFloat(), z = d.readFloat();
                if (a != null) arrows.list.remove(a);
                if (kind == 1 && world != null && player != null) arrowHitEffects(x, y, z);
                break;
            }
            case Net.FURNACE_DATA: {
                int x = d.readInt(), y = d.readInt(), z = d.readInt();
                String data = d.readUTF();
                if (world == null || state != State.PLAYING) { // não dá para abrir agora: devolve na hora
                    toHost.send(new Net.Out(Net.FURNACE_SET).i(x).i(y).i(z).s(data));
                    break;
                }
                showFurnace(x, y, z, Furnace.parse(data));
                break;
            }
            case Net.CHEST_DATA: {
                int x = d.readInt(), y = d.readInt(), z = d.readInt();
                String data = d.readUTF();
                if (world == null || state != State.PLAYING) break;
                Inventory c = new Inventory();
                c.deserialize(data, false);
                showChest(chestKey(x, y, z), c);
                break;
            }
            case Net.DROP_NEW: {
                int id = d.readInt(), item = d.readInt(), count = d.readInt(), wear = d.readInt();
                double x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), vx = d.readFloat(), vy = d.readFloat(), vz = d.readFloat();
                double phase = d.readFloat();
                if (world != null) drops.mirrorAdd(id, item, count, wear, x, y, z, vx, vy, vz, phase);
                break;
            }
            case Net.DROP_GONE:
                drops.removeById(d.readInt());
                break;
            case Net.DROP_SET: {
                Drops.Drop dr = drops.byId(d.readInt());
                int count = d.readInt();
                if (dr != null && count > 0) dr.count = count;
                break;
            }
            case Net.DROP_SYNC: {
                int n = d.readInt();
                for (int k = 0; k < n; k++) {
                    Drops.Drop dr = drops.byId(d.readInt());
                    double x = d.readFloat(), y = d.readFloat(), z = d.readFloat(), vx = d.readFloat(), vy = d.readFloat(), vz = d.readFloat();
                    if (dr == null) continue;
                    double off = Math.abs(dr.x - x) + Math.abs(dr.y - y) + Math.abs(dr.z - z);
                    if (off > 0.4) { dr.x = x; dr.y = y; dr.z = z; } // perto: deixa a queda local; longe: encaixa
                    dr.vx = vx; dr.vy = vy; dr.vz = vz;
                }
                break;
            }
            case Net.DROP_OFFER: { // o anfitrião diz que chegamos perto de um item: pega se couber
                int id = d.readInt(), item = d.readInt(), count = d.readInt(), wear = d.readInt();
                int left = count;
                if (player != null && player.health > 0 && state != State.DEAD && Items.exists(item)) {
                    if (Items.maxStack(item) == 1) left = inv.addTool(item, wear) ? 0 : count;
                    else left = inv.add(item, count);
                    if (left < count) Sounds.play("coletar", 0.7);
                }
                if (toHost != null) toHost.send(new Net.Out(Net.DROP_TAKEN).i(id).i(left));
                break;
            }
            case Net.DAMAGE:
                if (!creative && state != State.DEAD) {
                    netDamage += d.readFloat();
                    netDamageX = d.readFloat();
                    netDamageZ = d.readFloat();
                }
                break;
            case Net.GIVE: {
                int item = d.readInt(), count = d.readInt();
                String from = d.readUTF();
                inv.add(item, count);
                toast(from + ": +" + count + " " + Items.name(item));
                break;
            }
            case Net.CHAT: {
                String from = d.readUTF(), text = d.readUTF();
                addChat("<" + from + "> " + text, Color.WHITE);
                break;
            }
            case Net.CHAT_IMAGE: {
                String from = d.readUTF();
                receivePhoto(d, from);
                break;
            }
            case Net.TOAST:
                toast(d.readUTF());
                break;
            case Net.BYE:
                netError = d.readUTF();
                disconnectToLobby();
                break;
            case Net.CLOSED:
                netError = "Conexão com o anfitrião perdida";
                disconnectToLobby();
                break;
            default:
                break;
        }
    }

    private void disconnectToLobby() {
        if (toHost != null) { toHost.close(); toHost = null; }
        remotes.clear();
        String msg = netError;
        world = null;
        player = null;
        info = null;
        mobs.clear();
        drops.clear();
        enterLobby();
        if (msg != null) toast(msg);
        netError = null;
    }

    // =====================================================================
    // salvamento
    // =====================================================================
    private void snapshotInfo() {
        info.hasPlayer = true;
        info.px = player.x; info.py = player.y; info.pz = player.z;
        info.yaw = player.yaw; info.pitch = player.pitch;
        info.health = player.health;
        info.food = player.food;
        info.flying = player.flying;
        info.time = world.time;
        info.inventory = inv.serialize();
        info.chests.clear();
        for (java.util.Map.Entry<String, Inventory> e : chests.entrySet()) {
            String[] k = e.getKey().split(",");
            if (world.get(Integer.parseInt(k[0]), Integer.parseInt(k[1]), Integer.parseInt(k[2])) == Block.CHEST)
                info.chests.put(e.getKey(), e.getValue().serialize(Inventory.CHEST));
        }
        info.furnaces.clear();
        for (java.util.Map.Entry<String, Furnace> e : furnaces.entrySet()) {
            String[] k = e.getKey().split(",");
            int fx = Integer.parseInt(k[0]), fy = Integer.parseInt(k[1]), fz = Integer.parseInt(k[2]);
            int fb = world.get(fx, fy, fz);
            if (fb == Block.FURNACE || fb == Block.FURNACE_LIT || !world.isLoaded(fx, fz))
                info.furnaces.put(e.getKey(), e.getValue().serialize());
        }
        info.lastPlayed = System.currentTimeMillis();
        info.mobs.clear();
        info.mobs.addAll(mobs.saveAll());
        info.wolves.clear(); // lobos domesticados ficam salvos com o mundo
        for (Mob m : mobs.list)
            if (m.type == Mob.WOLF && m.tamed && m.health > 0)
                info.wolves.add(String.format(java.util.Locale.ROOT, "%.2f;%.2f;%.2f;%d;%.1f;%s", m.x, m.y, m.z, m.sitting ? 1 : 0, m.health, m.ownerName));
    }

    private void waitForSaves() {
        if (lastSave != null) {
            try { lastSave.get(); } catch (Exception e) { System.out.println("Falha ao salvar: " + e.getMessage()); }
            lastSave = null;
        }
    }

    private void saveSync() {
        if (world == null || info == null || toHost != null) return; // amigo não salva: o mundo é do anfitrião
        waitForSaves();
        snapshotInfo();
        try {
            Saves.saveMeta(info);
            world.saveAll(); // só os pedaços que mudaram desde o último salvamento
        } catch (Exception e) {
            e.printStackTrace();
            toast("Erro ao salvar: " + e.getMessage());
        }
    }

    /** Salva em segundo plano (cópia dos blocos), para não travar o jogo. */
    private void saveAsync() {
        if (world == null || info == null || toHost != null) return;
        waitForSaves();
        snapshotInfo();
        try {
            Saves.saveMeta(info);
        } catch (Exception e) {
            toast("Erro ao salvar: " + e.getMessage());
            return;
        }
        final java.util.List<Chunk> changed = world.snapshotModified(); // cópias: o jogo continua mexendo nos originais
        final World.Store target = world.store;
        lastSave = saver.submit(() -> {
            if (target != null) for (Chunk c : changed) target.write(c.cx, c.cz, c.toBytes());
            return null;
        });
    }

    private void toast(String s) {
        toast = s;
        toastTimer = 3.5;
    }

    // =====================================================================
    // desenho
    // =====================================================================
    private boolean benchTested;
    private double dT;
    private int dPhase, dX, dZ;
    private boolean shotDone;

    private static void say2(String s) {
        System.out.println("teste: " + s);
    }

    private String dropDump() {
        StringBuilder sb = new StringBuilder(drops.all().size() + " item(ns)");
        for (Drops.Drop d : drops.all())
            sb.append(String.format(java.util.Locale.ROOT, " [#%d %s x%d em %.1f,%.1f,%.1f]", d.id, Items.name(d.item), d.count, d.x, d.y, d.z));
        return sb.toString();
    }

    /** Põe o jogador num ponto, de pé, olhando para yaw, sem velocidade. */
    private void benchPut(double x, double y, double z, double yaw) {
        player.x = x; player.y = y; player.z = z; player.yaw = yaw; player.pitch = 0;
        player.vx = player.vy = player.vz = 0; player.fallDist = player.landedFall = 0; player.flying = false;
    }

    /**
     * Teste automático de direção dos blocos e de itens no chão (-Dbench.drops, com -Dbench.survival e -Dbench.shot).
     * O anfitrião monta um palco, coloca blocos virados para lados diferentes (como se o jogador os colocasse),
     * salva, solta um item e abre para a LAN. O amigo (-Dbench.join) confere as direções que
     * recebeu, vê e pega o item do anfitrião, solta outro item e o anfitrião o pega.
     */
    private void benchDrops(double dt) {
        dT += dt;
        if (toHost != null) { benchDropsClient(); return; }
        int x = dX, z = dZ;
        if (dPhase == 1 && !shotDone && dT > 3.5) { shotName = "blocos"; shotDone = true; }
        if (dPhase == 0 && dT > 1.5) {
            dPhase = 1;
            dT = 0;
            x = dX = (int) player.x; z = dZ = (int) player.z;
            for (int dx = -5; dx <= 5; dx++)
                for (int dz = -3; dz <= 14; dz++) {
                    world.set(x + dx, 60, z + dz, Block.STONE);
                    for (int y = 61; y <= 63; y++) world.set(x + dx, y, z + dz, Block.AIR);
                }
            world.time = World.DAY_LENGTH * 0.3;
            player.health = Player.MAX_HEALTH;
            state = State.PLAYING;
            inv.clear();
            slot = 0;
            // como se o jogador colocasse: olhando para +Z (yaw 0), -X (yaw 3π/2), +X (yaw π/2) e -Z (yaw π)
            benchPut(x + 0.5, 61.01, z + 0.5, 0);
            inv.set(0, Block.FURNACE, 4);
            sel = new int[] { x, 60, z + 2, x, 61, z + 2, 1000 };
            placeBlock(Block.FURNACE, 0, 0, 1);
            say2("fornalha colocada olhando para +Z: direcao " + world.rotation(x, 61, z + 2) + " (esperado 2: a frente aponta para o jogador)");
            benchPut(x + 0.5, 61.01, z + 0.5, Math.PI / 2);
            inv.set(0, Block.CHEST, 4);
            sel = new int[] { x + 2, 60, z + 2, x + 2, 61, z + 2, 1000 };
            placeBlock(Block.CHEST, 0, 0, 1);
            say2("bau colocado olhando para +X: direcao " + world.rotation(x + 2, 61, z + 2) + " (esperado 1)");
            benchPut(x + 0.5, 61.01, z + 0.5, 3 * Math.PI / 2);
            inv.set(0, Block.BED, 4);
            sel = new int[] { x - 2, 60, z + 2, x - 2, 61, z + 2, 1000 };
            placeBlock(Block.BED, 0, 0, 1);
            say2("cama colocada olhando para -X: direcao " + world.rotation(x - 2, 61, z + 2) + " (esperado 3)");
            inv.set(0, Block.TABLE, 4);
            benchPut(x + 0.5, 61.01, z + 0.5, Math.PI);
            sel = new int[] { x + 4, 60, z + 2, x + 4, 61, z + 2, 1000 };
            placeBlock(Block.TABLE, 0, 0, 1);
            say2("bancada colocada olhando para -Z: direcao " + world.rotation(x + 4, 61, z + 2) + " (esperado 0)");
            benchPut(x + 0.5, 61.01, z + 0.5, 0);
            inv.clear();
            // salvar e reler
            saveSync();
            World w2 = new World(info.seed, Saves.chunkStore(info)); // lê de volta do disco
            w2.ensureAround(x, z, 1);
            say2("salvo e relido do arquivo: fornalha = " + w2.rotation(x, 61, z + 2) + " (esperado 2)");
            say2("mundo recarregado: fornalha " + w2.rotation(x, 61, z + 2) + ", bau " + w2.rotation(x + 2, 61, z + 2) + ", cama " + w2.rotation(x - 2, 61, z + 2));
            // quebrar um bloco limpa a direção
            world.set(x + 4, 61, z + 2, Block.AIR);
            say2("bancada quebrada: direcao " + world.rotation(x + 4, 61, z + 2) + " (esperado 0)");
            world.setRot(x + 4, 61, z + 2, Block.STONE, 2);
            world.set(x + 4, 61, z + 2, Block.AIR);
            if (System.getProperty("bench.host") != null) { openToLan(); say2("aberto para LAN: " + (server != null)); }
        } else if (dPhase == 1 && !remotes.isEmpty() && dT > 3) {
            dPhase = 2;
            dT = 0;
            world.setRot(x + 3, 61, z + 5, Block.CHEST, 2); // depois do amigo entrar: vai pelo pacote de bloco
            drops.spawn(Block.COBBLE, 5, 0, x + 0.5, 61.5, z + 7.5, 0, 0, 0, 0.5);
            say2("anfitriao soltou 5 pedregulhos; " + dropDump());
        } else if (dPhase == 2 && dT > 28) {
            dPhase = 3;
            dT = 0;
            say2("anfitriao ve: " + dropDump());
            Drops.Drop sand = null;
            for (Drops.Drop d : drops.all()) if (d.item == Block.SAND) sand = d;
            if (sand != null) { benchPut(sand.x, 61.01, sand.z, 0); say2("anfitriao foi ate a areia do amigo"); }
            else say2("ERRO: a areia do amigo nao chegou no anfitriao");
        } else if (dPhase == 3 && dT > 2.5) {
            dPhase = 4;
            say2("FIM anfitriao: areia no inventario " + inv.countOf(Block.SAND) + " (esperado 3); " + dropDump());
        }
    }

    /** Lado do amigo no teste de itens no chão. */
    private void benchDropsClient() {
        if (dPhase == 0 && dT > 2) {
            dPhase = 1;
            dX = -1;
            if (world.store != null) for (int[] ck : world.store.list()) world.ensureChunk(ck[0], ck[1]); // os pedaços que o anfitrião mexeu
            for (int cx = (int) player.x - 300; cx < (int) player.x + 300 && dX < 0; cx++)
                for (int cz = (int) player.z - 300; cz < (int) player.z + 300; cz++)
                    if (world.get(cx, 61, cz) == Block.FURNACE && world.get(cx + 2, 61, cz) == Block.CHEST) { dX = cx; dZ = cz - 2; break; }
            if (dX < 0) { say2("AMIGO: nao achei o palco"); dPhase = 99; return; }
            int x = dX, z = dZ;
            benchPut(x + 3.5, 61.01, z + 0.5, 0);
            inv.clear();
            say2("AMIGO recebeu as direcoes: fornalha " + world.rotation(x, 61, z + 2) + " (esperado 2), bau " + world.rotation(x + 2, 61, z + 2)
                    + " (esperado 1), cama " + world.rotation(x - 2, 61, z + 2) + " (esperado 3)");
        } else if (dPhase == 1 && dT > 3) {
            int x = dX, z = dZ;
            if (world.get(x + 3, 61, z + 5) == Block.CHEST) {
                dPhase = 2;
                dT = 0;
                say2("AMIGO ve o bau que o anfitriao colocou depois: direcao " + world.rotation(x + 3, 61, z + 5) + " (esperado 2)");
            }
        } else if (dPhase == 2 && dT > 0.3) {
            boolean seen = false;
            for (Drops.Drop d : drops.all()) if (d.item == Block.COBBLE) seen = true;
            if (seen || dT > 6) {
                dPhase = 3;
                dT = 0;
                say2("AMIGO ve o item do anfitriao: " + seen + "; " + dropDump());
                benchPut(dX + 3.5, 61.01, dZ + 0.5, Math.atan2(-3.0, 7.0)); // olha para o item
            }
        } else if (dPhase == 3 && dT > 1.2) {
            if (shotName == null && !shotDone) { shotName = "amigo"; shotDone = true; dT = 1.0; return; }
            dPhase = 33;
            dT = 0;
            benchPut(dX + 0.5, 61.01, dZ + 7.5 - 0.2, 0); // vai até o item
        } else if (dPhase == 33 && dT > 2.5) {
            dPhase = 4;
            dT = 0;
            say2("AMIGO pegou: " + inv.countOf(Block.COBBLE) + " pedregulhos no inventario (esperado 5); " + dropDump());
            int x = dX, z = dZ;
            benchPut(x + 3.5, 61.01, z + 0.5, 0);
            drops.spawn(Block.SAND, 3, 0, x + 0.5, 61.5, z + 4.5, 0, 0, 0, 0.5); // o amigo solta areia (pelo anfitriao)
        } else if (dPhase == 4 && dT > 3) {
            dPhase = 5;
            say2("AMIGO: a areia que ele soltou aparece para ele? " + dropDump());
        }
    }

    private double benchT;
    private int benchPhase, benchShots, benchX, benchZ, benchMark;
    private Mob benchPig;

    private static void say(String s) {
        System.out.println("flechas: " + s);
    }

    private String arrowDump() {
        StringBuilder sb = new StringBuilder(arrows.list.size() + " flecha(s)");
        for (Arrows.Arrow a : arrows.list)
            sb.append(String.format(java.util.Locale.ROOT, " [#%d dono %d %s %.1f,%.1f,%.1f%s]", a.id, a.owner, a.stuck ? "presa" : "voando",
                    a.x, a.y, a.z, a.pickup ? " recolhivel" : ""));
        return sb.toString();
    }

    private void aimAndFire(double tx, double ty, double tz) {
        double ex = player.x, ey = player.y + Player.EYE - 0.12, ez = player.z;
        double dx = tx - ex, dy = ty - ey, dz = tz - ez, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
        fireBow(1.0, dx / l, dy / l, dz / l);
    }

    /**
     * Teste automático da atualização do arco (-Dbench.arrows, com -Dbench.survival): monta um palco no alto,
     * fabrica arco e flechas, atira num porco e na parede, põe um esqueleto para atirar, recolhe a flecha,
     * confere que o esqueleto não atira através de parede e salva. Com -Dbench.host abre para a LAN;
     * o jogo que entra (-Dbench.join) atira, recolhe e mexe no baú pelo lado do amigo.
     */
    private void benchArrows(double dt) {
        benchT += dt;
        if (toHost != null) { benchArrowsClient(); return; }
        int x = benchX, z = benchZ;
        if (benchPhase == 0 && benchT > 1.5) {
            benchPhase = 1;
            x = benchX = (int) player.x; z = benchZ = (int) player.z;
            for (int dx = -4; dx <= 4; dx++)
                for (int dz = -3; dz <= 14; dz++) {
                    world.set(x + dx, 60, z + dz, Block.STONE);
                    for (int y = 61; y <= 63; y++) world.set(x + dx, y, z + dz, dz == 14 ? Block.PLANKS : Block.AIR);
                }
            player.x = x + 0.5; player.y = 61.01; player.z = z + 0.5;
            player.vx = player.vy = player.vz = 0; player.flying = false; player.fallDist = player.landedFall = 0;
            player.health = Player.MAX_HEALTH;
            world.time = World.DAY_LENGTH * 0.75; // meia-noite: o esqueleto não queima
            state = State.PLAYING;
            inv.clear();
            inv.add(Items.STICK, 5); inv.add(Items.STRING, 3); inv.add(Items.FLINT, 2); inv.add(Items.FEATHER, 2);
            boolean okBow = false, okArrow = false;
            for (Items.Recipe r : Items.RECIPES) {
                if (r.out == Items.BOW) okBow = inv.craft(r);
                if (r.out == Items.ARROW) okArrow = inv.craft(r) & inv.craft(r);
            }
            say("fabricou arco=" + okBow + " flechas=" + okArrow + " -> " + inv.countOf(Items.BOW) + " arco, " + inv.countOf(Items.ARROW)
                    + " flechas, sobraram " + inv.countOf(Items.STICK) + " gravetos");
            for (int i = 0; i < Inventory.SIZE; i++)
                if (inv.id[i] == Items.BOW && i != 0) { int oi = inv.id[0], oc = inv.count[0]; inv.set(0, Items.BOW, 1, 0); inv.set(i, oi, oc); }
            slot = 0;
            world.set(x - 3, 61, z + 1, Block.CHEST);
            Inventory c = new Inventory();
            c.addRange(Items.BREAD, 5, 0, 0, Inventory.CHEST);
            chests.put(chestKey(x - 3, 61, z + 1), c);
            if (System.getProperty("bench.host") != null) { openToLan(); say("aberto para LAN: " + (server != null)); }
        } else if (benchPhase == 1 && benchT > 3) {
            benchPhase = 2;
            benchPig = new Mob(Mob.PIG, x + 0.5, 61.01, z + 5.5);
            mobs.list.add(benchPig);
            aimAndFire(benchPig.x, 61.5, benchPig.z);
            say("1a flecha no porco (vida " + benchPig.health + "); " + arrowDump());
        } else if (benchPhase == 2 && benchT > 3.6) {
            benchPhase = 3;
            say("porco depois da 1a flecha: vida " + benchPig.health + " (era 10; flecha cheia tira 9)");
            aimAndFire(benchPig.x, benchPig.y + 0.5, benchPig.z);
            aimAndFire(x + 3.5, 62.6, z + 14.5); // esta vai para a parede de tábuas
        } else if (benchPhase == 3 && benchT > 5) {
            benchPhase = 4;
            say("porco depois da 2a: vida " + benchPig.health + ", ainda no mundo=" + mobs.list.contains(benchPig) + "; flechas no inventario "
                    + inv.countOf(Items.ARROW) + "; " + arrowDump());
            mobs.list.add(new Mob(Mob.SKELETON, x + 0.5, 61.01, z + 10.5));
            benchMark = benchShots;
        } else if (benchPhase == 4 && benchT > 12) {
            benchPhase = 5;
            Mob sk = null;
            for (Mob m : mobs.list) if (m.type == Mob.SKELETON && Math.abs(m.y - 61) < 2) sk = m;
            say("esqueleto em 7 s: " + (benchShots - benchMark) + " disparo(s); vida do jogador " + player.health + "/20; esqueleto "
                    + (sk == null ? "sumiu" : String.format(java.util.Locale.ROOT, "a %.1f blocos", Math.abs(sk.z - player.z))) + "; " + arrowDump());
            for (Arrows.Arrow a : arrows.list)
                if (a.stuck && a.pickup) { player.x = a.x; player.z = a.z - 0.8; break; }
            benchMark = inv.countOf(Items.ARROW);
        } else if (benchPhase == 5 && benchT > 13) {
            benchPhase = 6;
            say("recolher flecha presa: " + benchMark + " -> " + inv.countOf(Items.ARROW) + " flechas");
            player.x = x + 0.5; player.z = z + 0.5;
            for (int dx = -4; dx <= 4; dx++) for (int y = 61; y <= 63; y++) world.set(x + dx, y, z + 6, Block.STONE); // parede no meio
            benchMark = benchShots;
        } else if (benchPhase == 6 && benchT > 20) {
            benchPhase = 7;
            say("com parede no meio, em 7 s: " + (benchShots - benchMark) + " disparo(s) (esperado 0)");
            for (int dx = -4; dx <= 4; dx++) for (int y = 61; y <= 63; y++) world.set(x + dx, y, z + 6, Block.AIR);
            saveSync();
            for (Saves.Info s : Saves.list())
                if (s.id.equals(info.id)) say("salvo e relido: arco no inventario=" + s.inventory.contains(Items.BOW + ":1") + ", flecha="
                        + s.inventory.contains(Items.ARROW + ":") + ", baus=" + s.chests.size());
        } else if (benchPhase == 7 && benchT > 36 && !remotes.isEmpty()) {
            benchPhase = 8;
            for (Remote r : remotes.values()) if (r.hasState) { aimAndFire(r.body.x, r.body.y + 1, r.body.z); say("anfitriao atirou no amigo " + r.name); }
        } else if (benchPhase >= 7 && benchPhase < 9 && benchT > 42) {
            benchPhase = 9;
            Inventory c = chests.get(chestKey(x - 3, 61, z + 1));
            say("FIM anfitriao: jogadores remotos=" + remotes.size() + ", vida " + player.health + ", pao no bau=" + (c == null ? -1 : c.countOf(Items.BREAD))
                    + ", disparos de esqueleto=" + benchShots + "; " + arrowDump());
        }
    }

    /** Lado do amigo no teste de rede. */
    private void benchArrowsClient() {
        if (benchPhase == 0 && benchT > 2) {
            benchPhase = 1;
            benchX = -1;
            if (world.store != null) for (int[] ck : world.store.list()) world.ensureChunk(ck[0], ck[1]); // os pedaços que o anfitrião mexeu
            for (int cx = (int) player.x - 300; cx < (int) player.x + 300 && benchX < 0; cx++)
                for (int cz = (int) player.z - 300; cz < (int) player.z + 300; cz++)
                    if (world.get(cx, 61, cz) == Block.CHEST) { benchX = cx + 3; benchZ = cz - 1; break; }
            if (benchX < 0) { say("AMIGO: nao achei o palco do anfitriao"); benchPhase = 99; return; }
            player.x = benchX + 2.5; player.y = 61.01; player.z = benchZ + 1.5;
            player.vx = player.vy = player.vz = 0; player.fallDist = player.landedFall = 0;
            inv.clear();
            inv.set(0, Items.BOW, 1, 0); inv.set(1, Items.ARROW, 10);
            slot = 0;
            int sk = 0;
            for (Mob m : mobs.list) if (m.type == Mob.SKELETON) sk++;
            say("AMIGO entrou: modo " + (creative ? "criativo" : "sobrevivencia") + ", ve " + remotes.size() + " jogador(es), " + mobs.list.size()
                    + " criaturas (" + sk + " esqueleto), " + arrowDump());
        } else if (benchPhase == 1 && benchT > 3) {
            benchPhase = 2;
            aimAndFire(benchX + 3.5, 62.6, benchZ + 5.5);
            Remote h = remotes.get(0);
            if (h != null && h.hasState) aimAndFire(h.body.x, h.body.y + 1, h.body.z); // uma no anfitrião
            say("AMIGO atirou 2; flechas no inventario " + inv.countOf(Items.ARROW));
        } else if (benchPhase == 2 && benchT > 5) {
            benchPhase = 3;
            say("AMIGO depois de 2 s: vida " + player.health + "; " + arrowDump());
            openChest(benchX - 3, 61, benchZ + 1);
        } else if (benchPhase == 3 && benchT > 6) {
            benchPhase = 4;
            if (chest == null) say("AMIGO: BAU NAO ABRIU");
            else {
                say("AMIGO abriu o bau: " + chest.countOf(Items.BREAD) + " paes");
                quickMove(chest, 0);
                closeInventory();
                say("AMIGO pegou: " + inv.countOf(Items.BREAD) + " paes no inventario");
            }
            benchMark = inv.countOf(Items.ARROW);
        } else if (benchPhase == 4 && benchT > 7 && benchT < 20) {
            for (Arrows.Arrow a : arrows.list)
                if (a.stuck && a.owner == myId) { player.x = a.x; player.z = a.z - 0.8; player.y = Math.max(61.01, Math.floor(a.y) + 0.01); benchPhase = 5; benchT = 20; break; }
        } else if (benchPhase == 5 && benchT > 23) {
            benchPhase = 6;
            say("amigo: recolher flecha " + benchMark + " -> " + inv.countOf(Items.ARROW) + "; " + arrowDump());
            player.x = benchX + 2.5; player.z = benchZ + 1.5; player.y = 61.01;
            Remote h = remotes.get(0);
            if (h != null && h.hasState) { aimAndFire(h.body.x, h.body.y + 1, h.body.z); say(String.format(java.util.Locale.ROOT, "amigo atirou no anfitriao que esta em %.1f,%.1f,%.1f", h.body.x, h.body.y, h.body.z)); }
        } else if (benchPhase == 6 && benchT > 31) {
            benchPhase = 7;
            say("FIM amigo: recolher flecha " + benchMark + " -> " + inv.countOf(Items.ARROW) + "; vida " + player.health + "; " + arrowDump());
        }
    }

    /** Teste automático (-Dbench.test): mexe em tudo o que é novo perto do jogador, para ver se nada quebra. */
    private void benchTest() {
        int x = (int) player.x, y = (int) player.y, z = (int) player.z;
        System.out.println("teste: jogador em " + x + "," + y + "," + z + " modo " + (creative ? "criativo" : "sobrevivencia"));
        for (int i = 0; i < 6; i++) world.set(x + 3, Math.min(World.SY - 1, y + 6 + i), z, i % 2 == 0 ? Block.SAND : Block.GRAVEL);
        world.set(x - 3, y + 1, z, Block.TNT); world.set(x - 4, y + 1, z, Block.TNT);
        prime(x - 3, y + 1, z, 2.0, true);
        world.set(x, y + 8, z + 4, Block.LEAVES);
        drops.scatter(Block.COBBLE, 40, 0, player.x + 2, player.y + 1, player.z + 2);
        drops.scatter(Items.tool(Items.PICK, 2), 1, 17, player.x + 2, player.y + 1, player.z - 2);
        drops.spawn(Block.BED, x, y + 2, z + 1); drops.spawn(Block.SAPLING, x, y + 2, z + 1); drops.spawn(Items.GUNPOWDER, x, y + 2, z + 1);
        for (int t = 0; t < Mob.TYPES; t++) mobs.list.add(new Mob(t, player.x + 4 + t, player.y + 3, player.z + 5));
        particles.blockBits(Block.GRASS, x, y, z, 30);
        dropHeld(false);
        // baú, plantação, armadura, itens novos e as telas (salvas em PNG se -Dbench.shot=pasta)
        world.set(x + 5, y + 3, z, Block.FARMLAND);
        world.set(x + 5, y + 4, z, Block.WHEAT + 2);
        world.set(x + 2, y + 1, z + 2, Block.CHEST);
        Inventory c = new Inventory();
        c.addRange(Items.BREAD, 70, 0, 0, Inventory.CHEST);
        c.addRange(Items.armor(Items.CHESTPLATE, 2), 1, 40, 0, Inventory.CHEST);
        c.addRange(Items.FLINT_STEEL, 1, 9, 0, Inventory.CHEST);
        chests.put(chestKey(x + 2, y + 1, z + 2), c);
        int n = 0;
        for (int i = Items.FIRST_ITEM; i <= Items.LAST; i++)
            if (Items.exists(i)) { n++; if (Items.icon(i) == null || Items.name(i).equals("?")) System.out.println("teste: ITEM SEM ICONE/NOME " + i); }
        for (Items.Recipe r : Items.RECIPES) if (!Items.exists(r.out)) System.out.println("teste: RECEITA INVALIDA " + r.out);
        inv.set(Inventory.SIZE, Items.armor(Items.HELMET, 0), 1, 0);
        inv.set(Inventory.SIZE + 1, Items.armor(Items.CHESTPLATE, 1), 1, 30);
        inv.set(Inventory.SIZE + 3, Items.armor(Items.BOOTS, 2), 1, 0);
        inv.set(3, Items.tool(Items.HOE, 2), 1, 0); inv.set(4, Items.SEEDS, 12); inv.set(5, Items.RAW_PORK, 3); inv.set(6, Items.COOKED_CHICKEN, 2);
        inv.set(7, Items.FLINT_STEEL, 1, 0); inv.set(8, Block.CHEST, 2); inv.set(9, Items.RAW_MUTTON, 2); inv.set(10, Items.LEATHER, 5);
        inv.set(11, Items.WHEAT, 5); inv.set(12, Items.FLINT, 5); inv.set(13, Items.armor(Items.LEGGINGS, 1), 1, 0);
        double before = player.health;
        hit(5);
        System.out.println("teste: " + n + " itens; defesa " + inv.armorPoints() + "; golpe de 5 tirou " + (before - player.health));
        till(x + 6, y + 3, z);
        quickMove(inv, 13);
        String shot = System.getProperty("bench.shot");
        if (shot != null) {
            try {
                BufferedImage img = new BufferedImage(1280, 720, BufferedImage.TYPE_INT_ARGB);
                Graphics2D g = img.createGraphics();
                g.setColor(new Color(90, 130, 170)); g.fillRect(0, 0, 1280, 720);
                chest = c; chestKey = chestKey(x + 2, y + 1, z + 2);
                drawInventory(g, 1280, 720);
                javax.imageio.ImageIO.write(img, "png", new java.io.File(shot, "bau.png"));
                chest = null; chestKey = null;
                g.setColor(new Color(90, 130, 170)); g.fillRect(0, 0, 1280, 720);
                drawInventory(g, 1280, 720);
                javax.imageio.ImageIO.write(img, "png", new java.io.File(shot, "inventario.png"));
                g.setColor(new Color(90, 130, 170)); g.fillRect(0, 0, 1280, 720);
                drawHud(g, 1280, 720, true);
                javax.imageio.ImageIO.write(img, "png", new java.io.File(shot, "hud.png"));
                g.setColor(new Color(60, 60, 70)); g.fillRect(0, 0, 1280, 720);
                int k = 0;
                for (int i = Items.FIRST_ITEM; i <= Items.LAST; i++)
                    if (Items.exists(i)) { g.drawImage(Items.icon(i), 10 + (k % 16) * 78, 10 + (k / 16) * 78, 64, 64, null); k++; }
                int[] nb = { Block.CHEST, Block.FARMLAND, Block.WHEAT, Block.WHEAT + 1, Block.WHEAT + 2, Block.TNT };
                for (int b : nb) { g.drawImage(Items.icon(b), 10 + (k % 16) * 78, 10 + (k / 16) * 78, 64, 64, null); k++; }
                javax.imageio.ImageIO.write(img, "png", new java.io.File(shot, "icones.png"));
                g.dispose();
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        spillChest(x + 2, y + 1, z + 2);
        System.out.println("teste: itens novos " + Items.name(Block.TNT) + ", " + Items.name(Block.BED) + ", " + Items.name(Items.GUNPOWDER)
                + "; icones " + (Items.icon(Block.BED) != null) + (Items.icon(Block.SAPLING) != null) + (Items.icon(Items.GUNPOWDER) != null));
    }

    private long lastUiDraw, benchSwapNs, benchWorkNs;

    private String shotName;

    /** Teste: guarda o quadro 3D atual (antes da troca de buffers) num PNG da pasta -Dbench.shot. */
    private void saveShot(String name) {
        int w = fbW, h = fbH;
        java.nio.ByteBuffer buf = org.lwjgl.system.MemoryUtil.memAlloc(w * h * 4);
        org.lwjgl.opengl.GL11.glReadPixels(0, 0, w, h, org.lwjgl.opengl.GL11.GL_RGBA, org.lwjgl.opengl.GL11.GL_UNSIGNED_BYTE, buf);
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                int i = ((h - 1 - y) * w + x) * 4;
                img.setRGB(x, y, (buf.get(i) & 255) << 16 | (buf.get(i + 1) & 255) << 8 | (buf.get(i + 2) & 255));
            }
        org.lwjgl.system.MemoryUtil.memFree(buf);
        try {
            javax.imageio.ImageIO.write(img, "png", new java.io.File(System.getProperty("bench.shot", "."), name + ".png"));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void swapBuffers() {
        if (shotName != null) { saveShot(shotName); shotName = null; }
        long t = System.nanoTime();
        glfwSwapBuffers(window);
        benchSwapNs += System.nanoTime() - t;
    }

    private void renderFrame() {
        int cw = fbW, ch = fbH;
        if (cw <= 0 || ch <= 0) return; // janela minimizada

        // 1) mundo 3D na placa de vídeo
        renderer.configure(settings);
        boolean inWorld = world != null && player != null;
        boolean playing = state == State.PLAYING && !warming;
        if (inWorld) {
            renderer.breakProgress = playing ? breakProgress : 0;
            mobs.buildMesh(renderer, world, player.x, player.z, settings.viewDist);
            drops.buildMesh(renderer, world, player.x, player.z, settings.viewDist, time);
            arrows.buildMesh(renderer, world, player.x, player.z, settings.viewDist);
            particles.buildMesh(renderer, world, player);
            appendRemotePlayers();
            if (playing) {
                // luz no lugar do jogador, para a mão escurecer à noite e em cavernas
                int bx = (int) Math.floor(player.x), by = (int) Math.floor(player.y + Player.EYE), bz = (int) Math.floor(player.z);
                double sky = world.skyLight(bx, by, bz) / 15.0 * (0.13 + 0.87 * world.daylight());
                double blk = Math.pow(world.blockLightAt(bx, by, bz) / 15.0, 1.5);
                double light = Math.min(1.0, Math.max(sky, blk) * 0.92 + 0.08);
                int[] n = new int[1];
                renderer.handVerts = Hand.build(renderer.handVerts, n, info.persona, inv.empty(slot) ? 0 : inv.id[slot],
                        player.walkDist, swing, light, bowCharge / BOW_FULL);
                renderer.handVertCount = n[0];
            } else renderer.handVertCount = 0;
            renderer.render(player, playing ? sel : null, time, cw, ch, playing);
        } else {
            orbitLobbyCamera();
            renderer.breakProgress = 0;
            renderer.entityVertCount = 0;
            renderer.handVertCount = 0;
            renderer.render(lobbyCam, null, lobbyTime, cw, ch, false);
        }

        // 2) menus e HUD em Java2D, numa imagem transparente por cima.
        // Jogando, o HUD muda pouco: é redesenhado 30 vezes por segundo e, nos outros quadros, só recomposto.
        long uiNow = System.nanoTime();
        boolean sameSize = uiImg != null && uiImg.getWidth() == cw && uiImg.getHeight() == ch;
        if (playing && sameSize && remotes.isEmpty() && uiNow - lastUiDraw < 33_000_000L) {
            renderer.drawUi(null, cw, ch);
            swapBuffers();
            return;
        }
        lastUiDraw = uiNow;
        if (uiImg == null || uiImg.getWidth() != cw || uiImg.getHeight() != ch) {
            uiImg = new BufferedImage(cw, ch, BufferedImage.TYPE_INT_ARGB_PRE); // mais rápido de compor
            uiPx = ((DataBufferInt) uiImg.getRaster().getDataBuffer()).getData();
        }
        Arrays.fill(uiPx, 0);
        Graphics2D g = uiImg.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        ui.begin();
        tooltip = null;
        switch (state) {
            case LOBBY: drawLobby(g, cw, ch); break;
            case CREATE: drawCreate(g, cw, ch); break;
            case JOIN: drawJoin(g, cw, ch); break;
            case LOADING: drawLoading(g, cw, ch); break;
            case PLAYING:
                if (warming) { loadingText = "Montando o mundo..."; drawLoading(g, cw, ch); }
                else drawHud(g, cw, ch, true);
                break;
            case PAUSED: drawHud(g, cw, ch, false); drawPause(g, cw, ch); break;
            case SETTINGS: drawSettings(g, cw, ch); break;
            case INVENTORY: drawInventory(g, cw, ch); break; // a tela já mostra a barra rápida
            case DEAD: drawDead(g, cw, ch); break;
        }
        String soundWarning = Sounds.takeWarning();
        if (soundWarning != null) { toast = soundWarning; toastTimer = 8; }
        if (toast != null && toastTimer > 0) {
            g.setFont(Ui.BIG);
            int w = g.getFontMetrics().stringWidth(toast) + 40;
            int a = (int) (220 * Math.min(1, toastTimer));
            g.setColor(new Color(0, 0, 0, Math.min(170, a)));
            g.fillRoundRect((cw - w) / 2, 60, w, 40, 14, 14);
            Ui.centered(g, Ui.BIG, toast, cw / 2, 87, new Color(255, 255, 255, a));
        }
        g.dispose();
        renderer.drawUi(uiPx, cw, ch);
        swapBuffers();
        if (state == State.LOADING) loadingFrames++;
    }

    private void orbitLobbyCamera() {
        double a = lobbyTime * 0.04, r = 46;
        double cx = 256, cz = 256; // o cenário de sempre (o terreno é o mesmo em qualquer ponto da semente)
        lobbyCam.x = cx + Math.sin(a) * r;
        lobbyCam.z = cz + Math.cos(a) * r;
        lobbyCam.y = Math.max(World.SEA, lobbyWorld.heightAt((int) lobbyCam.x, (int) lobbyCam.z)) + 22;
        lobbyCam.yaw = Math.atan2(cx - lobbyCam.x, cz - lobbyCam.z);
        lobbyCam.pitch = -0.32;
    }

    // ----------------------------- HUD -----------------------------
    private void drawHud(Graphics2D g, int cw, int ch, boolean active) {
        int cx = cw / 2;
        if (hurtFlash > 0) {
            g.setColor(new Color(200, 0, 0, (int) (hurtFlash / 0.45 * 110)));
            g.fillRect(0, 0, cw, ch);
        }
        // a mira e a mão 3D são desenhadas pela placa de vídeo

        // barra rápida: moldura de pedra, espaços afundados e o escolhido com borda dourada
        int n = Inventory.HOTBAR, size = 52, fr = 6;
        int x0 = (cw - n * size) / 2, y0 = ch - size - 14;
        Ui.hotbarFrame(g, x0 - fr, y0 - fr, n * size + fr * 2 - 4, size + fr * 2 - 4);
        for (int i = 0; i < n; i++) {
            int x = x0 + i * size;
            Ui.slot(g, x, y0, size - 4, false, false);
            drawItem(g, inv.id[i], inv.count[i], inv.wear[i], x + 5, y0 + 5, size - 14, true); // quantidade também no criativo
            g.setFont(Ui.SMALL);
            g.setColor(new Color(255, 255, 255, 70));
            g.drawString(String.valueOf(i + 1), x + 4, y0 + 13);
        }
        int sx0 = x0 + slot * size;
        g.setColor(new Color(0, 0, 0, 160));
        g.setStroke(new BasicStroke(5f));
        g.drawRect(sx0 - 3, y0 - 3, size + 1, size + 1);
        g.setColor(new Color(240, 200, 100));
        g.setStroke(new BasicStroke(3f));
        g.drawRect(sx0 - 3, y0 - 3, size + 1, size + 1);
        g.setColor(new Color(255, 245, 200, 90));
        g.setStroke(new BasicStroke(1f));
        g.drawRect(sx0 - 1, y0 - 1, size - 3, size - 3);
        int top = y0 - fr; // topo da moldura: o resto do HUD fica acima dela
        if (slotNameTimer > 0 && !inv.empty(slot)) {
            int a = (int) (255 * Math.min(1, slotNameTimer));
            String nm = Items.name(inv.id[slot]);
            Font f = new Font(Font.SERIF, Font.BOLD, 17);
            g.setFont(f);
            int tw = g.getFontMetrics().stringWidth(nm) + 24, ty = top - (creative ? 12 : 62);
            g.setColor(new Color(10, 10, 14, (int) (120 * a / 255.0)));
            g.fillRoundRect(cx - tw / 2, ty - 18, tw, 25, 10, 10);
            Ui.centered(g, f, nm, cx, ty, new Color(245, 232, 205, a));
        }

        // vida, fome e ar (sobrevivência)
        if (!creative) {
            int rowY = top - 24;
            for (int i = 0; i < 10; i++) {
                double f = Math.max(0, Math.min(1, (player.health - i * 2) / 2));
                f = f >= 1 ? 1 : (f > 0 ? 0.5 : 0);
                Ui.heart(g, x0 + i * 21, rowY, 18, f);
            }
            int armor = inv.armorPoints(); // barra de armadura: 10 ícones = 20 pontos
            for (int i = 0; i < 10 && armor > 0; i++)
                drawArmorIcon(g, x0 + i * 21, rowY - 21, armor >= i * 2 + 2 ? 1 : armor > i * 2 ? 0.5 : 0);
            int right = x0 + n * size - 4;
            for (int i = 0; i < 10; i++) {
                double f = Math.max(0, Math.min(1, (player.food - i * 2) / 2));
                drawFood(g, right - 20 - i * 21, rowY, f >= 1 ? 1 : (f > 0 ? 0.5 : 0));
            }
            if (player.headInWater || player.air < Player.MAX_AIR) {
                int bubbles = (int) Math.ceil(player.air);
                for (int i = 0; i < 10; i++) {
                    int bx = right - 18 - i * 21;
                    if (i < bubbles) {
                        g.setColor(new Color(120, 190, 255, 230));
                        g.fillOval(bx, rowY - 22, 16, 16);
                        g.setColor(Color.WHITE);
                        g.fillOval(bx + 4, rowY - 18, 4, 4);
                    }
                    g.setColor(new Color(0, 40, 90, 200));
                    g.drawOval(bx, rowY - 22, 16, 16);
                }
            }
        }

        drawChat(g, cw, ch);

        // informações: duas linhas numa caixa escura no canto
        if (active) drawNameTags(g);
        int px = (int) Math.floor(player.x), pz = (int) Math.floor(player.z);
        int biome = world.biomeAt(px, pz, world.heightAt(px, pz) - 1);
        String lan = server != null ? "  ·  LAN: anfitrião, " + (remotes.size() + 1) + " jogadores" : toHost != null ? "  ·  LAN: " + (remotes.size() + 1) + " jogadores" : "";
        String l1 = String.format("%s  ·  %s  ·  %s%s", info.name, info.persona.name, creative ? "Criativo" : "Sobrevivência", lan);
        String l2 = String.format("Dia %d, %s  ·  %s  ·  X %.0f  Y %.0f  Z %.0f%s  ·  %.0f FPS", info.day, clock(), World.BIOME_NAMES[biome],
                player.x, player.y, player.z, player.flying ? "  ·  voando" : "", fps);
        Font infoFont = new Font(Font.SANS_SERIF, Font.BOLD, 13);
        g.setFont(infoFont);
        java.awt.FontMetrics fm = g.getFontMetrics();
        int bw = Math.max(fm.stringWidth(l1), fm.stringWidth(l2)) + 20;
        Ui.hudBox(g, 8, 8, bw, 44);
        Ui.shadow(g, l1, 18, 26, new Color(245, 232, 205));
        Ui.shadow(g, l2, 18, 44, new Color(220, 220, 225));
        if (help && active) {
            String[][] lines = {
                    { "WASD", "mover" }, { "Espaço", creative ? "pular  ·  2x voa" : "pular / nadar" }, { "Ctrl", "correr" },
                    { "E", "inventário e criação" }, { "Dir. na bancada", "grade 3x3" }, { "Dir. na fornalha", "assar" },
                    { creative ? "Meio" : "Segure esq.", creative ? "copiar bloco" : "quebrar" }, { "Dir.", "colocar / comer / vestir" },
                    { "Q", "jogar fora (Ctrl+Q: a pilha)" }, { "T", "chat" }, { "Esc", "pausar" }, { "F1", "esconder esta ajuda" } };
            g.setFont(Ui.SMALL);
            fm = g.getFontMetrics();
            int kw = 0, vw = 0;
            for (String[] l : lines) { kw = Math.max(kw, fm.stringWidth(l[0])); vw = Math.max(vw, fm.stringWidth(l[1])); }
            int hy = 60, hh = lines.length * 17 + 12;
            Ui.hudBox(g, 8, hy, kw + vw + 34, hh);
            int yy = hy + 19;
            for (String[] l : lines) {
                Ui.shadow(g, l[0], 18, yy, new Color(240, 200, 110));
                Ui.shadow(g, l[1], 18 + kw + 12, yy, new Color(225, 225, 230));
                yy += 17;
            }
        }
    }

    private static final Font CHAT_FONT = new Font(Font.SANS_SERIF, Font.PLAIN, 15);

    /** Mensagens no canto de baixo à esquerda (somem depois de 10 s) e a caixa de digitar. */
    private void drawChat(Graphics2D g, int cw, int ch) {
        g.setFont(CHAT_FONT);
        java.awt.FontMetrics fm = g.getFontMetrics();
        int w = Math.min(560, cw / 2 - 30), lh = 20, x = 10;
        int y = ch - 150; // acima da barra rápida, da vida e da armadura
        if (chatOpen) {
            g.setColor(new Color(0, 0, 0, 170));
            g.fillRect(x, y, w, 24);
            String s = chatInput.toString();
            while (s.length() > 0 && fm.stringWidth(s) > w - 20) s = s.substring(1);
            boolean caret = (System.currentTimeMillis() / 500) % 2 == 0;
            g.setColor(Color.WHITE);
            g.drawString(s + (caret ? "_" : ""), x + 6, y + 17);
            if (chatInput.length() == 0) {
                g.setColor(new Color(255, 255, 255, 110));
                g.drawString("   Enter envia   Ctrl+O escolhe uma foto (ou arraste o arquivo para a janela)   Esc cancela", x + 6, y + 17);
            }
        }
        long now = System.currentTimeMillis();
        int shown = 0;
        int by = y - 6;
        for (int i = chatLines.size() - 1; i >= 0 && shown < (chatOpen ? 12 : 8); i--) {
            ChatLine l = chatLines.get(i);
            double age = (now - l.time) / 1000.0;
            double alpha = chatOpen ? 1 : age < 8 ? 1 : age < 10 ? (10 - age) / 2 : 0;
            if (alpha <= 0) break;
            // a foto, se houver, fica embaixo do texto da mensagem
            int imgH = 0;
            if (l.img != null) {
                int iw = l.img.getWidth(), ih = l.img.getHeight();
                double k = Math.min(Math.min((w - 12.0) / iw, 190.0 / ih), 1.0);
                int dw = Math.max(1, (int) (iw * k)), dh = Math.max(1, (int) (ih * k));
                if (by - dh - lh < 175) break; // não cobre o texto de ajuda lá em cima
                by -= dh + 6;
                imgH = dh;
                java.awt.Composite oldC = g.getComposite();
                Object oldI = g.getRenderingHint(RenderingHints.KEY_INTERPOLATION);
                g.setComposite(AlphaComposite.SrcOver.derive((float) alpha));
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                g.setColor(new Color(0, 0, 0, 150));
                g.fillRect(x, by - 3, dw + 12, dh + 6);
                g.drawImage(l.img, x + 6, by, dw, dh, null);
                g.setComposite(oldC);
                if (oldI != null) g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, oldI);
            }
            // quebra mensagens compridas em várias linhas
            java.util.List<String> parts = new java.util.ArrayList<>();
            String rest = l.text;
            while (!rest.isEmpty()) {
                int n = rest.length();
                while (n > 1 && fm.stringWidth(rest.substring(0, n)) > w - 12) n--;
                if (n < rest.length()) { int sp = rest.lastIndexOf(' ', n); if (sp > n / 2) n = sp + 1; }
                parts.add(rest.substring(0, n));
                rest = rest.substring(n);
            }
            for (int k = parts.size() - 1; k >= 0; k--) {
                if (by - lh < 165) break; // não invade o texto de ajuda lá em cima
                by -= lh;
                g.setColor(new Color(0, 0, 0, (int) (120 * alpha)));
                g.fillRect(x, by, w, lh);
                Color c = l.color;
                g.setColor(new Color(0, 0, 0, (int) (200 * alpha)));
                g.drawString(parts.get(k), x + 7, by + 15);
                g.setColor(new Color(c.getRed(), c.getGreen(), c.getBlue(), (int) (255 * alpha)));
                g.drawString(parts.get(k), x + 6, by + 14);
            }
            shown++;
        }
    }

    /** Hora do dia em relógio de 24h (o dia começa às 6h com o nascer do sol). */
    private String clock() {
        double h = (world.time / World.DAY_LENGTH * 24 + 6) % 24;
        return String.format("%02d:%02d", (int) h, (int) ((h - (int) h) * 60));
    }

    /** Ícone de comida (coxa) para a barra de fome. */
    private static void drawFood(Graphics2D g, int x, int y, double fill) {
        Color meat = fill > 0 ? new Color(196, 110, 52) : new Color(60, 30, 15, 200);
        g.setColor(new Color(0, 0, 0, 170));
        g.fillOval(x + 1, y + 1, 13, 12);
        g.setColor(meat);
        g.fillOval(x + 2, y + 2, 11, 10);
        if (fill > 0 && fill < 1) { g.setColor(new Color(60, 30, 15, 220)); g.fillRect(x + 2, y + 2, 5, 10); }
        g.setColor(new Color(240, 236, 220));
        g.fillRect(x + 11, y + 11, 6, 3);
        g.fillOval(x + 15, y + 9, 4, 4);
    }

    /** Ícone de armadura (peitoral) para a barra de defesa. */
    private static void drawArmorIcon(Graphics2D g, int x, int y, double fill) {
        g.setColor(new Color(0, 0, 0, 170));
        g.fillRect(x, y, 17, 7);
        g.fillRect(x + 3, y + 7, 11, 9);
        Color on = new Color(214, 214, 222), off = new Color(70, 70, 78, 230);
        g.setColor(fill > 0 ? on : off);
        g.fillRect(x + 1, y + 1, 15, 5);
        g.fillRect(x + 4, y + 6, 9, 9);
        if (fill > 0 && fill < 1) {
            g.setColor(off);
            g.fillRect(x + 9, y + 1, 7, 5);
            g.fillRect(x + 9, y + 6, 4, 9);
        }
    }

    private static void drawItem(Graphics2D g, int id, int count, int wear, int x, int y, int s, boolean showCount) {
        if (id == Block.AIR || count <= 0) return;
        g.drawImage(Items.icon(id), x, y, s, s, null);
        if (Items.isDurable(id) && wear > 0) { // barra de desgaste
            double left = 1 - wear / (double) Items.durability(id);
            g.setColor(new Color(0, 0, 0, 200));
            g.fillRect(x + 3, y + s - 4, s - 6, 4);
            g.setColor(Color.getHSBColor((float) (left * 0.33), 0.9f, 0.9f));
            g.fillRect(x + 3, y + s - 4, (int) ((s - 6) * left), 3);
        }
        if (showCount && count > 1) {
            g.setFont(Ui.COUNT);
            String t = String.valueOf(count);
            int tw = g.getFontMetrics().stringWidth(t);
            Ui.shadow(g, t, x + s - tw, y + s, Color.WHITE);
        }
    }

    // ----------------------------- lobby -----------------------------
    private void drawLobby(Graphics2D g, int cw, int ch) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0, 0, 0, 70));
        g.fillRect(0, 0, cw, ch);
        Ui.centered(g, new Font(Font.SANS_SERIF, Font.BOLD, 46), "Mundo de Blocos", cw / 2, 72, Color.WHITE);

        int top = 105, bottom = ch - 95;
        int lw = 540, rw = 380, gap = 24;
        int lx = (cw - lw - rw - gap) / 2, rx = lx + lw + gap;

        // lista de mundos
        Ui.panel(g, lx, top, lw, bottom - top);
        g.setFont(Ui.BIG);
        Ui.shadow(g, "Seus mundos", lx + 20, top + 34, Color.WHITE);
        int itemH = 78, listY = top + 50, listH = bottom - top - 60;
        int visible = Math.max(1, listH / itemH);
        listScroll = Math.max(0, Math.min(listScroll, Math.max(0, worlds.size() - visible)));
        if (worlds.isEmpty()) {
            Ui.centered(g, Ui.LABEL, "Nenhum mundo ainda.", lx + lw / 2, listY + 70, Ui.TEXT_DIM);
            Ui.centered(g, Ui.LABEL, "Clique em \"Criar novo mundo\" para começar!", lx + lw / 2, listY + 96, Ui.TEXT_DIM);
        }
        for (int v = 0; v < visible && listScroll + v < worlds.size(); v++) {
            final int i = listScroll + v;
            Saves.Info w = worlds.get(i);
            int y = listY + v * itemH;
            Rectangle r = new Rectangle(lx + 12, y, lw - 24, itemH - 8);
            boolean sel = i == selected, hv = ui.hover(r);
            g.setColor(sel ? new Color(70, 120, 55, 210) : hv ? new Color(255, 255, 255, 30) : new Color(255, 255, 255, 12));
            g.fillRoundRect(r.x, r.y, r.width, r.height, 12, 12);
            if (sel) {
                g.setColor(new Color(170, 240, 140));
                g.drawRoundRect(r.x, r.y, r.width, r.height, 12, 12);
            }
            w.persona.draw(g, r.x + 12, r.y + 3, 2);
            g.setFont(Ui.BIG);
            Ui.shadow(g, w.name, r.x + 58, r.y + 26, Color.WHITE);
            g.setFont(Ui.SMALL);
            Ui.shadow(g, (w.creative ? "Criativo" : "Sobrevivência") + "  ·  personagem: " + w.persona.name,
                    r.x + 58, r.y + 46, new Color(220, 230, 220));
            Ui.shadow(g, "Jogado em " + DATE.format(new Date(w.lastPlayed)), r.x + 58, r.y + 63, Ui.TEXT_DIM);
            ui.region(r, (b, s) -> {
                if (b != 1) return;
                long now = System.currentTimeMillis();
                if (i == lastListIndex && now - lastListClick < 400) loadWorld(worlds.get(i));
                lastListIndex = i;
                lastListClick = now;
                if (selected != i) confirmDelete = false;
                selected = i;
            });
        }
        if (worlds.size() > visible) {
            g.setFont(Ui.SMALL);
            Ui.shadow(g, "role o mouse para ver mais (" + worlds.size() + " mundos)", lx + 20, bottom - 8, Ui.TEXT_DIM);
        }

        // detalhes do mundo selecionado
        Ui.panel(g, rx, top, rw, bottom - top);
        if (!worlds.isEmpty()) {
            final Saves.Info w = worlds.get(selected);
            int u = Math.max(3, Math.min(6, (bottom - top - 260) / 32));
            w.persona.draw(g, rx + rw / 2 - 8 * u, top + 30, u);
            int ty = top + 30 + 32 * u + 34;
            Ui.centered(g, Ui.BIG, w.name, rx + rw / 2, ty, Color.WHITE);
            Ui.centered(g, Ui.LABEL, w.persona.name + "  ·  " + (w.creative ? "Criativo" : "Sobrevivência"),
                    rx + rw / 2, ty + 24, new Color(220, 235, 215));
            Ui.centered(g, Ui.SMALL, "Semente: " + w.seed, rx + rw / 2, ty + 44, Ui.TEXT_DIM);
            int by = bottom - 112;
            ui.button(g, rx + 30, by, rw - 60, 44, "Jogar", true, true, () -> loadWorld(w));
            ui.button(g, rx + 30, by + 54, rw - 60, 40, confirmDelete ? "Clique de novo para apagar" : "Excluir mundo",
                    true, false, () -> {
                        if (!confirmDelete) { confirmDelete = true; return; }
                        Saves.delete(w);
                        toast("Mundo \"" + w.name + "\" apagado");
                        worlds = Saves.list();
                        selected = Math.max(0, Math.min(selected, worlds.size() - 1));
                        confirmDelete = false;
                    });
        } else {
            Ui.centered(g, Ui.LABEL, "Selecione ou crie um mundo", rx + rw / 2, top + (bottom - top) / 2, Ui.TEXT_DIM);
        }

        int bw = 210, by = ch - 75;
        int bx = (cw - bw * 4 - 60) / 2;
        ui.button(g, bx, by, bw, 46, "Criar novo mundo", true, true, this::startCreate);
        ui.button(g, bx + bw + 20, by, bw, 46, "Jogar em LAN", true, false, this::startJoin);
        ui.button(g, bx + 2 * (bw + 20), by, bw, 46, "Configurações", () -> { settingsReturn = State.LOBBY; state = State.SETTINGS; });
        ui.button(g, bx + 3 * (bw + 20), by, bw, 46, "Sair", this::quit);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
    }

    // ----------------------------- criação -----------------------------
    private void drawCreate(Graphics2D g, int cw, int ch) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0, 0, 0, 90));
        g.fillRect(0, 0, cw, ch);
        int pw = 820, ph = 600;
        int px = (cw - pw) / 2, py = Math.max(8, (ch - ph) / 2);
        Ui.panel(g, px, py, pw, ph);
        Ui.centered(g, Ui.TITLE, "Criar novo mundo", px + pw / 2, py + 48, Color.WHITE);

        boolean caret = (System.currentTimeMillis() / 500) % 2 == 0;
        int x = px + 32, fw = 500, labelW = 190, y = py + 78, row = 46;
        final Persona d = draft;

        label(g, "Nome do mundo", x, y + 26);
        ui.textField(g, x + labelW, y, fw - labelW, 36, fWorld.toString(), "Meu mundo", focus == 1, caret, () -> focus = 1);
        y += row;
        label(g, "Semente (opcional)", x, y + 26);
        ui.textField(g, x + labelW, y, fw - labelW, 36, fSeed.toString(), "aleatória", focus == 2, caret, () -> focus = 2);
        y += row;
        ui.selector(g, x, y, fw, "Modo de jogo", draftCreative ? "Criativo" : "Sobrevivência", null,
                () -> draftCreative = !draftCreative, () -> draftCreative = !draftCreative);
        y += 40;
        g.setFont(Ui.SMALL);
        Ui.shadow(g, draftCreative ? "Blocos infinitos, voo (tecla F) e nenhum dano."
                        : "Colete blocos para construir. Cuidado com quedas e com a água!",
                x, y + 12, new Color(200, 230, 190));
        y += 30;

        g.setColor(new Color(255, 255, 255, 50));
        g.fillRect(x, y, fw, 1);
        g.setFont(Ui.BIG);
        Ui.shadow(g, "Personagem", x, y + 30, Color.WHITE);
        y += 44;
        label(g, "Nome", x, y + 26);
        ui.textField(g, x + labelW, y, fw - labelW, 36, fChar.toString(), "Explorador", focus == 3, caret, () -> focus = 3);
        y += row;
        ui.selector(g, x, y, fw, "Pele", (d.skin + 1) + "/" + Persona.SKIN.length, new Color(Persona.SKIN[d.skin]),
                () -> d.skin = Math.floorMod(d.skin - 1, Persona.SKIN.length), () -> d.skin = (d.skin + 1) % Persona.SKIN.length);
        y += 42;
        ui.selector(g, x, y, fw, "Cabelo", (d.hair + 1) + "/" + Persona.HAIR.length, new Color(Persona.HAIR[d.hair]),
                () -> d.hair = Math.floorMod(d.hair - 1, Persona.HAIR.length), () -> d.hair = (d.hair + 1) % Persona.HAIR.length);
        y += 42;
        ui.selector(g, x, y, fw, "Camisa", (d.shirt + 1) + "/" + Persona.SHIRT.length, new Color(Persona.SHIRT[d.shirt]),
                () -> d.shirt = Math.floorMod(d.shirt - 1, Persona.SHIRT.length), () -> d.shirt = (d.shirt + 1) % Persona.SHIRT.length);
        y += 42;
        ui.selector(g, x, y, fw, "Calça", (d.pants + 1) + "/" + Persona.PANTS.length, new Color(Persona.PANTS[d.pants]),
                () -> d.pants = Math.floorMod(d.pants - 1, Persona.PANTS.length), () -> d.pants = (d.pants + 1) % Persona.PANTS.length);

        // prévia do personagem
        int prevX = px + 32 + fw + 30, prevW = pw - (prevX - px) - 32;
        g.setColor(new Color(255, 255, 255, 14));
        g.fillRoundRect(prevX, py + 78, prevW, 380, 14, 14);
        int u = 9;
        d.draw(g, prevX + prevW / 2 - 8 * u, py + 100, u);
        String nm = fChar.toString().trim().isEmpty() ? "Explorador" : fChar.toString().trim();
        Ui.centered(g, Ui.BIG, nm, prevX + prevW / 2, py + 100 + 33 * u + 10, Color.WHITE);
        ui.button(g, prevX + 20, py + 470, prevW - 40, 38, "Personagem aleatório", () -> {
            Persona r = Persona.random(new Random());
            d.skin = r.skin; d.hair = r.hair; d.shirt = r.shirt; d.pants = r.pants;
            fChar.setLength(0);
            fChar.append(r.name);
        });

        int by = py + ph - 64;
        ui.button(g, px + pw / 2 - 250, by, 240, 46, "Criar mundo", true, true, this::createWorld);
        ui.button(g, px + pw / 2 + 10, by, 240, 46, "Cancelar", this::enterLobby);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
    }

    private void startJoin() {
        fIp.setLength(0);
        fIp.append(settings.lanIp);
        fJoinName.setLength(0);
        fJoinName.append(settings.lanName.isEmpty() ? "Amigo" : settings.lanName);
        joinPersona = Persona.random(new Random());
        String[] pp = settings.lanPersona.split(",");
        if (pp.length == 4) {
            try {
                joinPersona.skin = Math.floorMod(Integer.parseInt(pp[0]), Persona.SKIN.length);
                joinPersona.hair = Math.floorMod(Integer.parseInt(pp[1]), Persona.HAIR.length);
                joinPersona.shirt = Math.floorMod(Integer.parseInt(pp[2]), Persona.SHIRT.length);
                joinPersona.pants = Math.floorMod(Integer.parseInt(pp[3]), Persona.PANTS.length);
            } catch (NumberFormatException ignored) {
            }
        }
        focus = fIp.length() == 0 ? 1 : 2;
        state = State.JOIN;
    }

    /** Tela para entrar no mundo de um amigo (LAN ou Radmin). */
    private void drawJoin(Graphics2D g, int cw, int ch) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0, 0, 0, 90));
        g.fillRect(0, 0, cw, ch);
        int pw = 820, ph = 560;
        int px = (cw - pw) / 2, py = Math.max(8, (ch - ph) / 2);
        Ui.panel(g, px, py, pw, ph);
        Ui.centered(g, Ui.TITLE, "Jogar em LAN", px + pw / 2, py + 48, Color.WHITE);
        boolean caret = (System.currentTimeMillis() / 500) % 2 == 0;
        int x = px + 32, fw = 500, labelW = 190, y = py + 80, row = 46;
        final Persona d = joinPersona;

        label(g, "IP do anfitrião", x, y + 26);
        ui.textField(g, x + labelW, y, fw - labelW, 36, fIp.toString(), "ex.: 26.12.34.56", focus == 1, caret, () -> focus = 1);
        y += row;
        g.setFont(Ui.SMALL);
        Ui.shadow(g, "Pelo Radmin, use o IP do anfitrião que começa com 26. (ele aparece no menu de pausa dele).",
                x, y + 4, new Color(200, 230, 190));
        y += 24;
        label(g, "Seu nome", x, y + 26);
        ui.textField(g, x + labelW, y, fw - labelW, 36, fJoinName.toString(), "Amigo", focus == 2, caret, () -> focus = 2);
        y += row + 10;
        g.setFont(Ui.BIG);
        Ui.shadow(g, "Seu personagem", x, y + 20, Color.WHITE);
        y += 34;
        ui.selector(g, x, y, fw, "Pele", (d.skin + 1) + "/" + Persona.SKIN.length, new Color(Persona.SKIN[d.skin]),
                () -> d.skin = Math.floorMod(d.skin - 1, Persona.SKIN.length), () -> d.skin = (d.skin + 1) % Persona.SKIN.length);
        y += 42;
        ui.selector(g, x, y, fw, "Cabelo", (d.hair + 1) + "/" + Persona.HAIR.length, new Color(Persona.HAIR[d.hair]),
                () -> d.hair = Math.floorMod(d.hair - 1, Persona.HAIR.length), () -> d.hair = (d.hair + 1) % Persona.HAIR.length);
        y += 42;
        ui.selector(g, x, y, fw, "Camisa", (d.shirt + 1) + "/" + Persona.SHIRT.length, new Color(Persona.SHIRT[d.shirt]),
                () -> d.shirt = Math.floorMod(d.shirt - 1, Persona.SHIRT.length), () -> d.shirt = (d.shirt + 1) % Persona.SHIRT.length);
        y += 42;
        ui.selector(g, x, y, fw, "Calça", (d.pants + 1) + "/" + Persona.PANTS.length, new Color(Persona.PANTS[d.pants]),
                () -> d.pants = Math.floorMod(d.pants - 1, Persona.PANTS.length), () -> d.pants = (d.pants + 1) % Persona.PANTS.length);

        int prevX = px + 32 + fw + 30, prevW = pw - (prevX - px) - 32;
        g.setColor(new Color(255, 255, 255, 14));
        g.fillRoundRect(prevX, py + 80, prevW, 360, 14, 14);
        int u = 9;
        d.draw(g, prevX + prevW / 2 - 8 * u, py + 98, u);
        String nm = fJoinName.toString().trim().isEmpty() ? "Amigo" : fJoinName.toString().trim();
        Ui.centered(g, Ui.BIG, nm, prevX + prevW / 2, py + 98 + 33 * u + 6, Color.WHITE);

        int by = py + ph - 64;
        ui.button(g, px + pw / 2 - 250, by, 240, 46, "Entrar", true, true, this::joinGame);
        ui.button(g, px + pw / 2 + 10, by, 240, 46, "Voltar", this::enterLobby);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
    }

    private static void label(Graphics2D g, String s, int x, int y) {
        g.setFont(Ui.LABEL);
        g.setColor(Color.WHITE);
        g.drawString(s, x, y);
    }

    private void drawLoading(Graphics2D g, int cw, int ch) {
        g.setColor(new Color(0, 0, 0, 160));
        g.fillRect(0, 0, cw, ch);
        Ui.centered(g, Ui.TITLE, loadingText, cw / 2, ch / 2, Color.WHITE);
        Ui.centered(g, Ui.LABEL, "só um instante", cw / 2, ch / 2 + 34, Ui.TEXT_DIM);
    }

    // ----------------------------- pausa / morte -----------------------------
    private void drawPause(Graphics2D g, int cw, int ch) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0, 0, 0, 130));
        g.fillRect(0, 0, cw, ch);
        int bw = 320, bh = 46, gap = 14;
        int x = (cw - bw) / 2, y = ch / 2 - (bh * 4 + gap * 3) / 2;
        Ui.centered(g, Ui.TITLE, "Jogo pausado", cw / 2, y - 58, Color.WHITE);
        Ui.centered(g, Ui.LABEL, info.name + "  ·  " + info.persona.name, cw / 2, y - 28, Ui.TEXT_DIM);
        ui.button(g, x, y, bw, bh, "Continuar", true, true, this::resume);
        y += bh + gap;
        ui.button(g, x, y, bw, bh, "Inventário", this::openInventory);
        y += bh + gap;
        ui.button(g, x, y, bw, bh, "Configurações", () -> { settingsReturn = State.PAUSED; state = State.SETTINGS; });
        y += bh + gap;
        if (toHost != null) {
            ui.button(g, x, y, bw, bh, "Desconectar", () -> { closeNet("saiu"); world = null; player = null; info = null; mobs.clear(); drops.clear(); enterLobby(); });
            Ui.centered(g, Ui.SMALL, "Você está no mundo de outro jogador (o progresso fica salvo com ele)", cw / 2, y + bh + 30, Ui.TEXT_DIM);
        } else {
            ui.button(g, x, y, bw, bh, "Salvar e voltar ao lobby", this::quitToLobby);
            Ui.centered(g, Ui.SMALL, "O mundo é salvo automaticamente ao pausar", cw / 2, y + bh + 30, Ui.TEXT_DIM);
            // multijogador: abrir para LAN ou mostrar como os amigos entram
            int ly = y + bh + 56;
            if (server == null) {
                ui.button(g, x, ly, bw, bh, "Abrir para LAN (multijogador)", true, false, this::openToLan);
            } else {
                List<String> ips = Net.localAddresses();
                Ui.centered(g, Ui.BUTTON, "Aberto na LAN  ·  " + remotes.size() + " amigo(s) conectado(s)", cw / 2, ly + 14, new Color(170, 240, 150));
                Ui.centered(g, Ui.LABEL, "Seus amigos entram com o IP: " + (ips.isEmpty() ? "?" : String.join("   ou   ", ips.subList(0, Math.min(2, ips.size())))),
                        cw / 2, ly + 40, Color.WHITE);
                Ui.centered(g, Ui.SMALL, "Porta " + Net.PORT + "  ·  pelo Radmin, use o IP que começa com 26.", cw / 2, ly + 62, Ui.TEXT_DIM);
            }
        }
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
    }

    /** Coloca o boneco dos outros jogadores nos triângulos das criaturas. */
    private void appendRemotePlayers() {
        if (remotes.isEmpty()) return;
        int o = renderer.entityVertCount * 6;
        int need = o;
        for (Remote r : remotes.values()) need += r.modelFloats();
        if (renderer.entityVerts.length < need) renderer.entityVerts = java.util.Arrays.copyOf(renderer.entityVerts, need + 4096);
        double daylight = world.daylight();
        for (Remote r : remotes.values()) {
            if (!r.hasState) continue;
            int bx = (int) Math.floor(r.body.x), by = (int) Math.floor(r.body.y + 1), bz = (int) Math.floor(r.body.z);
            double sky = world.skyLight(bx, by, bz) / 15.0 * (0.13 + 0.87 * daylight);
            double blk = Math.pow(world.blockLightAt(bx, by, bz) / 15.0, 1.5);
            o = r.writeModel(renderer.entityVerts, o, Math.min(1.0, Math.max(sky, blk) * 0.95 + 0.05));
        }
        renderer.entityVertCount = o / 6;
    }

    /** Nome em cima de cada outro jogador. */
    private void drawNameTags(Graphics2D g) {
        g.setFont(Ui.BUTTON);
        for (Remote r : remotes.values()) {
            if (!r.hasState) continue;
            double dx = r.body.x - player.x, dz = r.body.z - player.z;
            if (dx * dx + dz * dz > 64 * 64) continue;
            float[] s = renderer.project(r.body.x, r.body.y + 2.25, r.body.z);
            if (s == null) continue;
            int w = g.getFontMetrics().stringWidth(r.name) + 12;
            g.setColor(new Color(0, 0, 0, 120));
            g.fillRoundRect((int) s[0] - w / 2, (int) s[1] - 16, w, 22, 8, 8);
            g.setColor(Color.WHITE);
            g.drawString(r.name, (int) s[0] - w / 2 + 6, (int) s[1]);
        }
    }

    private void drawDead(Graphics2D g, int cw, int ch) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(110, 0, 0, 150));
        g.fillRect(0, 0, cw, ch);
        Ui.centered(g, new Font(Font.SANS_SERIF, Font.BOLD, 52), "Você morreu!", cw / 2, ch / 2 - 70, Color.WHITE);
        Ui.centered(g, Ui.LABEL, info.persona.name + " deixou cair tudo: seus itens ficaram onde você morreu (por 5 minutos).", cw / 2, ch / 2 - 30, new Color(255, 220, 220));
        ui.button(g, cw / 2 - 160, ch / 2, 320, 46, "Renascer", true, true, this::respawn);
        ui.button(g, cw / 2 - 160, ch / 2 + 60, 320, 46, "Voltar ao lobby", () -> {
            player.health = Player.MAX_HEALTH;
            player.x = info.spawnX; player.y = info.spawnY; player.z = info.spawnZ;
            inv.clear();
            quitToLobby();
        });
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
    }

    // ----------------------------- inventário -----------------------------
    /** Tudo o que aparece na paleta do modo criativo. */
    private static final int[] ALL_ITEMS;
    static {
        List<Integer> l = new ArrayList<>();
        for (int b = 1; b < Block.COUNT; b++) if (Block.isItemForm(b)) l.add(b); // só a forma de item (sem variantes)
        for (int i = Items.FIRST_ITEM; i <= Items.LAST; i++) if (Items.exists(i)) l.add(i);
        ALL_ITEMS = new int[l.size()];
        for (int i = 0; i < l.size(); i++) ALL_ITEMS[i] = l.get(i);
    }

    private void drawInventory(Graphics2D g, int cw, int ch) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0, 0, 0, 140));
        g.fillRect(0, 0, cw, ch);
        slotHits.clear();
        paletteHits.clear();

        final int sz = 48, gap = 4, step = sz + gap, cols = 9, pad = 24;
        int gridW = cols * step - gap;
        int mainW = gridW + pad * 2;
        int topH = chest != null || furnaceOpen ? 36 + 3 * step : 4 * step - gap + 6;
        int mainH = pad + topH + 30 + 3 * step - gap + 12 + sz + pad;
        // painel ao lado: paleta de todos os itens (criativo) ou livro de receitas (sobrevivência)
        boolean side = chest == null && !furnaceOpen && (creative || recipeBook);
        int sideW = !side ? 0 : creative ? gridW + pad * 2 : 5 * step - gap + pad * 2;
        int totalW = mainW + (side ? 14 + sideW : 0);
        int px = Math.max(4, (cw - totalW) / 2), py = Math.max(4, (ch - mainH) / 2);
        int ix = px + pad, iy = py + pad;

        bookHover = null;
        if (side) {
            int sx = px + mainW + 14;
            if (creative) drawPalette(g, sx, py, sideW, mainH, step, sz);
            else drawRecipeBook(g, sx, py, sideW, mainH, step, sz);
        }
        Ui.stonePanel(g, px, py, mainW, mainH);

        if (chest != null) {
            Ui.stoneTitle(g, "Baú", px + mainW / 2, iy + 18, gridW);
            for (int i = 0; i < Inventory.CHEST; i++) slotBox(g, chest, i, ix + (i % cols) * step, iy + 34 + (i / cols) * step, sz);
        } else if (furnaceOpen) {
            drawFurnaceTop(g, ix, iy, gridW, sz, step);
        } else {
            drawCraftTop(g, ix, iy, gridW, sz, step);
        }

        // mochila (9..35) e barra rápida (0..8)
        int by = iy + topH + 30;
        g.setFont(Ui.STONE_LABEL);
        Ui.shadow(g, "Inventário", ix, by - 9, Ui.STONE_TEXT);
        // limpar tudo (só no criativo): o primeiro clique pede confirmação (some em 3 s), o segundo apaga mochila e barra rápida
        if (creative) {
        boolean confirming = System.currentTimeMillis() < clearConfirmUntil;
        Rectangle clr = new Rectangle(ix + gridW - 170, by - 27, 170, 22);
        boolean ch2 = ui.hover(clr);
        g.setColor(confirming ? new Color(150, 40, 34, 235) : ch2 ? new Color(90, 60, 52, 235) : new Color(40, 36, 38, 220));
        g.fillRect(clr.x, clr.y, clr.width, clr.height);
        Ui.bevel(g, clr.x, clr.y, clr.width, clr.height, true);
        Ui.centered(g, Ui.SMALL, confirming ? "Clique de novo para apagar" : "Limpar inventário", clr.x + clr.width / 2, clr.y + 16,
                confirming || ch2 ? Color.WHITE : Ui.STONE_TEXT);
        if (ch2) tooltip = confirming ? "Apaga todos os itens da mochila e da barra (a armadura fica)" : "Esvaziar a mochila e a barra rápida";
        ui.region(clr, (b, s) -> {
            if (b != 1) return;
            if (System.currentTimeMillis() < clearConfirmUntil) {
                for (int k = 0; k < Inventory.SIZE; k++) inv.set(k, 0, 0);
                cursorId = cursorCount = cursorWear = 0;
                clearConfirmUntil = 0;
                toast("Inventário limpo");
            } else clearConfirmUntil = System.currentTimeMillis() + 3000;
        });
        }
        for (int r = 0; r < 3; r++)
            for (int c = 0; c < cols; c++)
                slotBox(g, inv, Inventory.HOTBAR + r * cols + c, ix + c * step, by + r * step, sz);
        int hy = by + 3 * step - gap + 12;
        g.setColor(new Color(0, 0, 0, 90));
        g.fillRect(ix, hy - 8, gridW, 2);
        for (int c = 0; c < cols; c++) slotBox(g, inv, c, ix + c * step, hy, sz);

        String foot = chest != null ? "Arraste ou clique para mover  ·  Shift+clique manda para o outro lado  ·  E ou Esc fecha"
                : furnaceOpen ? "Coloque o que vai assar em cima e o combustível embaixo (carvão, madeira, graveto)  ·  E ou Esc fecha"
                : "Arraste os itens para a grade: o desenho decide o que sai  ·  botão direito arrastando solta um por espaço  ·  E ou Esc fecha";
        Ui.centered(g, Ui.SMALL, foot, cw / 2, Math.min(ch - 6, py + mainH + 20), Ui.TEXT_DIM);

        // botão direito arrastando: solta um item em cada espaço por onde o mouse passa
        if (invRightDown && cursorCount > 0) {
            Object[] hit = slotAt(ui.mouseX, ui.mouseY);
            if (hit != null && rightVisited.add(slotKey(hit))) clickSlot((Inventory) hit[1], (Integer) hit[2], 3, false);
        }

        // item no cursor e dica
        if (cursorCount > 0) drawItem(g, cursorId, cursorCount, cursorWear, ui.mouseX - 22, ui.mouseY - 22, 44, true);
        else if (tooltip != null) drawTooltip(g, tooltip, cw);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
    }

    private void drawTooltip(Graphics2D g, String text, int cw) {
        g.setFont(Ui.LABEL);
        int tw = g.getFontMetrics().stringWidth(text) + 18;
        int x = Math.min(ui.mouseX + 16, cw - tw - 4), y = ui.mouseY - 34;
        g.setColor(new Color(16, 10, 22, 240));
        g.fillRect(x, y, tw, 28);
        g.setColor(new Color(110, 70, 160));
        g.drawRect(x + 1, y + 1, tw - 3, 25);
        g.setColor(Color.WHITE);
        g.drawString(text, x + 9, y + 19);
    }

    /** Parte de cima do inventário: armadura, personagem e a grade de criação (2x2, ou 3x3 na bancada). */
    private void drawCraftTop(Graphics2D g, int ix, int iy, int gridW, int sz, int step) {
        // armadura: 4 espaços em coluna; a peça vestida aparece pintada por cima do personagem
        int[][] zone = { { 4, 0, 8, 3 }, { 0, 8, 16, 5 }, { 4, 20, 8, 7 }, { 4, 27, 8, 4 } }; // x, y, largura, altura em "pixels" do boneco
        int winX = ix + step + 4, winW = 132, winH = 4 * step - 4;
        Ui.well(g, winX, iy, winW, winH);
        int scale = 5, pxo = winX + (winW - 16 * scale) / 2, pyo = iy + (winH - 32 * scale) / 2;
        g.setColor(new Color(255, 230, 190, 18)); // luz atrás do personagem
        g.fillOval(winX + 10, iy + 20, winW - 20, winH - 40);
        info.persona.draw(g, pxo, pyo, scale);
        for (int k = 0; k < Inventory.ARMOR; k++) {
            int a = Inventory.SIZE + k, ax = ix, ay = iy + k * step;
            slotBox(g, inv, a, ax, ay, sz);
            if (inv.empty(a)) {
                java.awt.Composite old = g.getComposite();
                g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.2f));
                g.drawImage(Items.icon(Items.armor(k, 1)), ax + 7, ay + 7, sz - 14, sz - 14, null);
                g.setComposite(old);
                if (ui.hover(new Rectangle(ax, ay, sz, sz)) && cursorCount == 0) tooltip = "Espaço de armadura: " + ARMOR_SLOT[k];
            } else {
                Color c = new Color(Items.armorColor(inv.id[a]));
                g.setColor(new Color(c.getRed(), c.getGreen(), c.getBlue(), 220));
                g.fillRect(pxo + zone[k][0] * scale, pyo + zone[k][1] * scale, zone[k][2] * scale, zone[k][3] * scale);
                if (k == 1) g.fillRect(pxo + 4 * scale, pyo + 13 * scale, 8 * scale, 7 * scale); // o resto do tronco
                if (k == 0) { g.fillRect(pxo + 4 * scale, pyo + 3 * scale, scale, 3 * scale); g.fillRect(pxo + 11 * scale, pyo + 3 * scale, scale, 3 * scale); }
            }
        }

        // grade de criação
        int rx = winX + winW + 18, rw = ix + gridW - rx;
        Ui.stoneTitle(g, craftSize == 3 ? "Bancada" : "Criação", rx + rw / 2, iy + 20, rw);
        int n = craftSize, gs = n == 3 ? 44 : sz, gstep = gs + 4, gw = n * gstep - 4;
        int groupW = gw + 12 + 38 + 12 + 56;
        int gx = rx + (rw - groupW) / 2, gy = iy + 36 + (n == 3 ? 0 : 10);
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++) slotBox(g, craftGrid, y * n + x, gx + x * gstep, gy + y * gstep, gs);
        // receita apontada no livro: o desenho aparece apagado na grade vazia
        if (bookHover != null && gridEmpty()) {
            java.awt.Composite old = g.getComposite();
            g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.35f));
            Items.Recipe r = bookHover;
            if (r.shapeless) {
                for (int k = 0; k < r.cells.length && k < n * n; k++)
                    drawItem(g, r.cells[k], 1, 0, gx + (k % n) * gstep + 5, gy + (k / n) * gstep + 5, gs - 10, false);
            } else if (r.w <= n && r.h <= n) {
                for (int y = 0; y < r.h; y++)
                    for (int x = 0; x < r.w; x++)
                        if (r.at(x, y) != 0) drawItem(g, r.at(x, y), 1, 0, gx + x * gstep + 5, gy + y * gstep + 5, gs - 10, false);
            }
            g.setComposite(old);
            if (r.needsTable() && n < 3) Ui.centered(g, Ui.SMALL, "Precisa da bancada (3x3)", gx + gw / 2, gy + gw + 18, new Color(255, 160, 140));
        }
        int ax = gx + gw + 12, ay = gy + gw / 2 - 14;
        final Items.Recipe match = Items.match(gridCells(), n);
        Ui.arrow(g, ax, ay, 38, 28, match != null ? 1 : 0);
        // resultado: clique pega uma vez (no mouse); Shift+clique faz o máximo direto para a mochila
        int ox = ax + 38 + 12, oy = gy + gw / 2 - 28;
        Rectangle res = new Rectangle(ox, oy, 56, 56);
        boolean hv = ui.hover(res);
        Ui.slot(g, ox, oy, 56, hv, false);
        g.setColor(match != null ? new Color(232, 190, 90) : new Color(90, 80, 70));
        g.setStroke(new BasicStroke(2f));
        g.drawRect(ox - 2, oy - 2, 59, 59);
        if (match != null) {
            drawItem(g, match.out, match.outCount, 0, ox + 6, oy + 6, 44, true);
            if (hv) tooltip = Items.name(match.out) + "  (clique cria; Shift+clique cria tudo o que der)";
        }
        ui.region(res, (b, shift) -> {
            if (match == null) return;
            if (shift) { int k = 0; while (k < 64 && craftOnce(false)) k++; }
            else craftOnce(true);
        });
        // livro de receitas
        if (!creative) {
            Rectangle book = new Rectangle(ix + gridW - 44, iy + 4 * step - 4 - 44, 44, 44);
            boolean bh = ui.hover(book);
            Ui.slot(g, book.x, book.y, 44, bh, recipeBook);
            Ui.bookIcon(g, book.x + 2, book.y + 2, 40, recipeBook);
            if (bh) tooltip = recipeBook ? "Fechar o livro de receitas" : "Abrir o livro de receitas";
            ui.region(book, (b, s) -> recipeBook = !recipeBook);
        }
    }

    /** Fornalha: entrada, chama, combustível, seta de progresso e resultado. */
    private void drawFurnaceTop(Graphics2D g, int ix, int iy, int gridW, int sz, int step) {
        Ui.stoneTitle(g, "Fornalha", ix + gridW / 2, iy + 18, gridW);
        int groupW = sz + 34 + 50 + 34 + 56;
        int fx = ix + (gridW - groupW) / 2, top = iy + 36, bottom = iy + 36 + 3 * step - 4;
        int mid = (top + bottom) / 2;
        slotBox(g, furnaceInv, 0, fx, top, sz);
        double fill = furn.heatMax > 0 ? Math.max(0, (furn.heat - furn.progress) / furn.heatMax) : 0;
        Ui.flame(g, fx + sz / 2 - 13, mid - 14, 28, fill);
        slotBox(g, furnaceInv, 1, fx, bottom - sz, sz);
        int ax = fx + sz + 34;
        Ui.arrow(g, ax, mid - 14, 50, 28, furn.progress);
        int ox = ax + 50 + 34;
        g.setColor(new Color(232, 190, 90));
        g.setStroke(new BasicStroke(2f));
        g.drawRect(ox - 2, mid - 30, 59, 59);
        slotBox(g, furnaceInv, 2, ox, mid - 28, 56);
        // o que dá para assar e queimar (para quem não sabe)
        int in = furnaceInv.id[0];
        String hint = furnaceInv.empty(0) ? "Minério, areia, pedregulho, tronco ou carne crua em cima"
                : Items.smelt(in) == 0 ? Items.name(in) + " não assa"
                : furnaceInv.empty(1) && furn.heat <= 0 ? "Falta combustível embaixo"
                : "Vira " + Items.name(Items.smelt(in));
        Ui.centered(g, Ui.SMALL, hint, ix + gridW / 2, bottom + 2 + 14, Ui.STONE_DIM);
    }

    /** Livro de receitas: todas as receitas; clique monta o desenho na grade com os itens da mochila. */
    private void drawRecipeBook(Graphics2D g, int x, int y, int w, int h, int step, int sz) {
        Ui.stonePanel(g, x, y, w, h);
        Ui.stoneTitle(g, "Receitas", x + w / 2, y + 42, w - 40);
        // filtro
        Rectangle f = new Rectangle(x + 24, y + 58, w - 48, 24);
        boolean fh = ui.hover(f);
        Ui.slot(g, f.x, f.y + 2, 20, fh, false);
        if (bookOnlyCraftable) { g.setColor(new Color(232, 190, 90)); g.fillRect(f.x + 5, f.y + 7, 10, 10); }
        g.setFont(Ui.SMALL);
        Ui.shadow(g, "Só o que dá para fazer agora", f.x + 28, f.y + 17, fh ? Color.WHITE : Ui.STONE_TEXT);
        ui.region(f, (b, s) -> { bookOnlyCraftable = !bookOnlyCraftable; recipeScroll = 0; });

        List<Items.Recipe> list = new ArrayList<>();
        for (Items.Recipe r : Items.RECIPES) if (!bookOnlyCraftable || inv.timesCraftable(r) > 0) list.add(r);
        // primeiro as que dá para fazer nesta grade, depois as que precisam de itens, por fim as da bancada
        list.sort((a, b) -> Integer.compare(bookRank(b), bookRank(a)));
        int colsB = 5, listY = y + 92, listH = h - 92 - 40;
        int rows = Math.max(1, listH / step), total = (list.size() + colsB - 1) / colsB;
        recipeScroll = Math.max(0, Math.min(recipeScroll, Math.max(0, total - rows)));
        int lx = x + (w - (colsB * step - 4)) / 2;
        for (int i = recipeScroll * colsB; i < Math.min(list.size(), (recipeScroll + rows) * colsB); i++) {
            final Items.Recipe r = list.get(i);
            int cx = lx + (i % colsB) * step, cy = listY + (i / colsB - recipeScroll) * step;
            Rectangle cell = new Rectangle(cx, cy, sz, sz);
            boolean hv = ui.hover(cell);
            Ui.slot(g, cx, cy, sz, hv, false);
            int rank = bookRank(r);
            g.setColor(rank == 3 ? new Color(90, 200, 90, 70) : rank == 0 ? new Color(200, 50, 40, 60) : new Color(0, 0, 0, 0));
            g.fillRect(cx + 2, cy + 2, sz - 4, sz - 4);
            if (rank < 2) {
                java.awt.Composite old = g.getComposite();
                g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.45f));
                drawItem(g, r.out, r.outCount, 0, cx + 5, cy + 5, sz - 10, true);
                g.setComposite(old);
            } else drawItem(g, r.out, r.outCount, 0, cx + 5, cy + 5, sz - 10, true);
            if (hv) {
                bookHover = r;
                tooltip = r.outCount + " " + Items.name(r.out) + ":  " + r.describe() + (r.needsTable() ? "  (bancada)" : "");
            }
            ui.region(cell, (b, shift) -> fillGrid(r, shift));
        }
        g.setFont(Ui.SMALL);
        Ui.centered(g, Ui.SMALL, "Clique monta a receita na grade (Shift: o máximo)", x + w / 2, y + h - 34, Ui.STONE_DIM);
        Ui.centered(g, Ui.SMALL, "Role o mouse: " + (total == 0 ? 0 : recipeScroll + 1) + "-" + Math.min(total, recipeScroll + rows) + " de " + total + " linhas",
                x + w / 2, y + h - 17, Ui.STONE_DIM);
    }

    /** 3 = dá para fazer nesta grade; 2 = cabe na grade mas faltam itens; 1 = tem os itens mas precisa da bancada; 0 = nada. */
    private int bookRank(Items.Recipe r) {
        boolean fits = !r.needsTable() || craftSize >= 3, has = inv.timesCraftable(r) > 0;
        return fits ? (has ? 3 : 2) : (has ? 1 : 0);
    }

    /** Paleta do modo criativo: todos os itens; esquerdo pega a pilha, direito pega 1. */
    private void drawPalette(Graphics2D g, int x, int y, int w, int h, int step, int sz) {
        Ui.stonePanel(g, x, y, w, h);
        Ui.stoneTitle(g, "Todos os itens", x + w / 2, y + 42, w - 40);
        int cols = 9, listY = y + 62, rows = Math.max(1, (h - 62 - 44) / step);
        int total = (ALL_ITEMS.length + cols - 1) / cols;
        paletteScroll = Math.max(0, Math.min(paletteScroll, Math.max(0, total - rows)));
        int lx = x + (w - (cols * step - 4)) / 2;
        for (int i = paletteScroll * cols; i < Math.min(ALL_ITEMS.length, (paletteScroll + rows) * cols); i++) {
            final int it = ALL_ITEMS[i];
            int cx = lx + (i % cols) * step, cy = listY + (i / cols - paletteScroll) * step;
            Rectangle r = new Rectangle(cx, cy, sz, sz);
            boolean hv = ui.hover(r);
            Ui.slot(g, cx, cy, sz, hv, false);
            drawItem(g, it, 1, 0, cx + 5, cy + 5, sz - 10, false);
            if (hv) tooltip = Items.name(it);
            paletteHits.add(new Object[] { r, it });
            ui.region(r, (btn, shift) -> {
                if (btn == 1 && cursorCount > 0 && cursorId == it) { cursorCount = 0; cursorId = 0; cursorWear = 0; } // clicou de novo no mesmo: devolve ao menu
                else if (btn == 1) { cursorId = it; cursorCount = Items.maxStack(it); cursorWear = 0; }
                else if (btn == 3) {
                    if (cursorCount > 0 && cursorId == it) cursorCount = Math.min(Items.maxStack(it), cursorCount + 1);
                    else { cursorId = it; cursorCount = 1; cursorWear = 0; }
                }
            });
        }
        Ui.centered(g, Ui.SMALL, "Esquerdo pega a pilha, direito pega 1  ·  role o mouse (" + (paletteScroll + 1) + "-"
                + Math.min(total, paletteScroll + rows) + " de " + total + ")", x + w / 2, y + h - 20, Ui.STONE_DIM);
    }

    private int[] gridCells() {
        int n = craftSize;
        int[] c = new int[n * n];
        for (int i = 0; i < n * n; i++) c[i] = craftGrid.empty(i) ? 0 : craftGrid.id[i];
        return c;
    }

    private boolean gridEmpty() {
        for (int i = 0; i < 9; i++) if (!craftGrid.empty(i)) return false;
        return true;
    }

    /**
     * Cria uma vez o que a grade forma, gastando um item de cada espaço usado. toCursor: o resultado vai para o
     * mouse (somando à pilha que já está nele); senão vai direto para a mochila. Retorna se criou.
     */
    private boolean craftOnce(boolean toCursor) {
        Items.Recipe r = Items.match(gridCells(), craftSize);
        if (r == null) return false;
        int max = Items.maxStack(r.out);
        if (toCursor) {
            if (cursorCount > 0 && (cursorId != r.out || max == 1 || cursorCount + r.outCount > max)) return false;
            if (cursorCount == 0) { cursorId = r.out; cursorCount = r.outCount; cursorWear = 0; }
            else cursorCount += r.outCount;
        } else {
            if (inv.roomFor(r.out) < r.outCount) { toast("Sem espaço no inventário"); return false; }
            inv.add(r.out, r.outCount);
        }
        for (int i = 0; i < craftSize * craftSize; i++)
            if (!craftGrid.empty(i)) craftGrid.set(i, craftGrid.id[i], craftGrid.count[i] - 1, craftGrid.wear[i]);
        Sounds.play("colocar", 0.35);
        return true;
    }

    /** Livro: monta a receita na grade com itens da mochila (1 de cada, ou o máximo com Shift). */
    private void fillGrid(Items.Recipe r, boolean max) {
        if (r.needsTable() && craftSize < 3) { toast("Essa receita precisa da grade 3x3 da bancada"); return; }
        for (int i = 0; i < 9; i++) giveBack(craftGrid, i, true); // o que estava na grade volta para a mochila
        int times = inv.timesCraftable(r);
        if (times < 1) { toast("Faltam itens: " + r.describe()); return; }
        int sets = max ? Math.min(times, 64) : 1;
        int n = craftSize;
        if (r.shapeless) {
            for (int k = 0; k < r.cells.length; k++) fillCell(k, r.cells[k], sets, r.woodPiece());
        } else {
            for (int y = 0; y < r.h; y++)
                for (int x = 0; x < r.w; x++)
                    if (r.at(x, y) != 0) fillCell(y * n + x, r.at(x, y), sets, r.woodPiece());
        }
        Sounds.play("clique", 0.4);
    }

    /** Põe na casa k da grade sets itens do ingrediente (tábuas: as comuns ou as de bétula, o que houver). */
    private void fillCell(int k, int item, int sets, boolean exact) {
        int id = exact ? item : inv.variantFor(item, sets);
        int n = Math.min(sets, inv.countOf(id));
        if (n <= 0) return;
        inv.remove(id, n);
        craftGrid.set(k, id, n);
    }

    /** Espaço desenhado no último quadro que contém o ponto: {área, inventário, índice}, ou null. */
    private Object[] slotAt(int x, int y) {
        for (int i = slotHits.size() - 1; i >= 0; i--) if (((Rectangle) slotHits.get(i)[0]).contains(x, y)) return slotHits.get(i);
        return null;
    }

    private static String slotKey(Object[] hit) {
        return System.identityHashCode(hit[1]) + ":" + hit[2];
    }

    /** Soltou o botão do mouse no inventário: arrastar a pilha até outro espaço a coloca lá. */
    private void onMouseUp(int button) {
        if (state != State.INVENTORY) return;
        if (button == 3) { invRightDown = false; return; }
        if (button != 1) return;
        Object[] from = dragFrom;
        dragFrom = null;
        if (from == null || cursorCount == 0) return;
        int dx = ui.mouseX - dragStartX, dy = ui.mouseY - dragStartY;
        if (dx * dx + dy * dy < 64) return; // foi só um clique: a pilha fica no mouse
        Object[] to = slotAt(ui.mouseX, ui.mouseY);
        if (to == null || slotKey(to).equals(slotKey(from))) return;
        clickSlot((Inventory) to[1], (Integer) to[2], 1, false);
    }
    /** Teclas 1-9 no inventário: o item embaixo do mouse vai para essa casa da barra rápida (trocando com o que estiver lá). */
    private void hotbarKey(int n) {
        if (cursorCount > 0) return; // segurando algo no mouse: as teclas não fazem nada
        Object[] hit = slotAt(ui.mouseX, ui.mouseY);
        if (hit == null) {
            if (!creative) return;
            for (Object[] p : paletteHits) // criativo: um item do menu vira uma pilha cheia nessa casa
                if (((Rectangle) p[0]).contains(ui.mouseX, ui.mouseY)) {
                    int it = (Integer) p[1];
                    inv.set(n, it, Items.maxStack(it), 0);
                    return;
                }
            return;
        }
        Inventory t = (Inventory) hit[1];
        int i = (Integer) hit[2];
        if (t == inv && i == n) return;
        int hid = inv.id[n], hc = inv.count[n], hw = inv.wear[n];
        boolean hotEmpty = inv.empty(n);
        if (t == furnaceInv && i == 2) { // resultado da fornalha: só sai, nunca entra
            if (t.empty(i)) return;
            if (hotEmpty) { inv.set(n, t.id[i], t.count[i], 0); t.set(i, 0, 0); }
            else if (hid == t.id[i] && Items.maxStack(hid) > 1) {
                int k = Math.min(t.count[i], Items.maxStack(hid) - hc);
                inv.set(n, hid, hc + k, hw);
                t.set(i, hid, t.count[i] - k);
            }
            return;
        }
        // espaço de armadura: só aceita a peça certa vinda da barra
        if (t == inv && i >= Inventory.SIZE && !hotEmpty && !(Items.isArmor(hid) && Items.armorPiece(hid) == i - Inventory.SIZE)) return;
        if (t.empty(i) && hotEmpty) return;
        int id = t.id[i], c = t.count[i], w = t.wear[i];
        t.set(i, hid, hc, hw);
        inv.set(n, id, c, w);
    }

    private static final String[] ARMOR_SLOT = { "capacete", "peitoral", "calças", "botas" };

    /** Um espaço de inventário na tela; target é o inventário do jogador ou o baú aberto. */
    private void slotBox(Graphics2D g, final Inventory target, final int i, int x, int y, int sz) {
        Rectangle r = new Rectangle(x, y, sz, sz);
        boolean hv = ui.hover(r);
        Ui.slot(g, x, y, sz, hv, target == inv && i == slot);
        drawItem(g, target.id[i], target.count[i], target.wear[i], x + 5, y + 5, sz - 10, true);
        slotHits.add(new Object[] { r, target, i });
        if (hv && !target.empty(i)) {
            int id = target.id[i];
            tooltip = Items.name(id);
            if (Items.isDurable(id)) tooltip += "  (" + (Items.durability(id) - target.wear[i]) + "/" + Items.durability(id) + ")";
            if (Items.isArmor(id)) tooltip += "  (defesa +" + Items.armorPoints(id) + ")";
            int food = Items.food(id);
            if (food > 0) tooltip += "  (comida +" + food + ")";
        }
        ui.region(r, (b, shift) -> clickSlot(target, i, b, shift));
    }

    /** Shift+clique: com o baú aberto, passa a pilha para o outro lado; sem baú, veste/tira armadura ou troca barra/mochila. */
    private void quickMove(Inventory target, int i) {
        if (target.empty(i)) return;
        int item = target.id[i], n = target.count[i], w = target.wear[i], left;
        if (target == craftGrid || target == furnaceInv) left = inv.addRange(item, n, w, 0, Inventory.SIZE); // de volta à mochila
        else if (furnaceOpen && target == inv && i < Inventory.SIZE && (Items.smelt(item) != 0 || Items.fuel(item) != 0)) {
            // da mochila para a fornalha: o que assa vai para cima, o combustível para baixo
            int dest = Items.smelt(item) != 0 && (furnaceInv.empty(0) || furnaceInv.id[0] == item) ? 0 : 1;
            left = furnaceInv.addRange(item, n, w, dest, dest + 1);
        } else if (chest != null) left = target == chest ? inv.addRange(item, n, w, 0, Inventory.SIZE) : chest.addRange(item, n, w, 0, Inventory.CHEST);
        else if (i >= Inventory.SIZE) left = inv.addRange(item, n, w, 0, Inventory.SIZE);
        else if (Items.isArmor(item) && inv.empty(Inventory.SIZE + Items.armorPiece(item))) {
            inv.set(Inventory.SIZE + Items.armorPiece(item), item, 1, w);
            left = 0;
        } else { inv.quickMove(i); return; }
        target.set(i, item, left, w);
    }

    private void clickSlot(final Inventory inv, int i, int button, boolean shift) {
        if (button == 1 && shift && cursorCount == 0) { quickMove(inv, i); return; }
        // resultado da fornalha: só se tira, nunca se coloca
        if (inv == furnaceInv && i == 2) {
            if (inv.empty(i)) return;
            int id = inv.id[i], n = inv.count[i];
            if (cursorCount == 0) { cursorId = id; cursorCount = n; cursorWear = 0; inv.set(i, 0, 0); }
            else if (cursorId == id && Items.maxStack(id) > 1) {
                int k = Math.min(n, Items.maxStack(id) - cursorCount);
                cursorCount += k;
                inv.set(i, id, n - k);
            }
            return;
        }
        // espaços de armadura só aceitam a peça certa
        if (inv == this.inv && i >= Inventory.SIZE && cursorCount > 0
                && !(Items.isArmor(cursorId) && Items.armorPiece(cursorId) == i - Inventory.SIZE)) return;
        int id = inv.id[i], n = inv.count[i], w = inv.wear[i];
        boolean slotEmpty = inv.empty(i);
        int max = Items.maxStack(cursorCount > 0 ? cursorId : id);
        if (button == 1) {
            if (cursorCount == 0) {
                if (slotEmpty) return;
                cursorId = id; cursorCount = n; cursorWear = w;
                inv.set(i, 0, 0);
            } else if (slotEmpty) {
                inv.set(i, cursorId, cursorCount, cursorWear);
                cursorId = cursorCount = cursorWear = 0;
            } else if (id == cursorId && max > 1) {
                int k = Math.min(cursorCount, max - n);
                inv.set(i, id, n + k);
                cursorCount -= k;
                if (cursorCount == 0) cursorId = 0;
            } else {
                inv.set(i, cursorId, cursorCount, cursorWear);
                cursorId = id; cursorCount = n; cursorWear = w;
            }
        } else if (button == 3) {
            if (cursorCount == 0) {
                if (slotEmpty) return;
                int half = (n + 1) / 2;
                cursorId = id; cursorCount = half; cursorWear = w;
                inv.set(i, id, n - half, w);
            } else if (slotEmpty || (id == cursorId && n < max)) {
                inv.set(i, cursorId, (slotEmpty ? 0 : n) + 1, cursorWear);
                cursorCount--;
                if (cursorCount == 0) cursorId = 0;
            }
        }
    }

    // ----------------------------- configurações -----------------------------
    private void drawSettings(Graphics2D g, int cw, int ch) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0, 0, 0, 120));
        g.fillRect(0, 0, cw, ch);
        final Settings s = settings;
        int pw = 700, rowH = 37, rows = 11;
        int ph = 64 + rows * rowH + 70 + 84;
        int x = (cw - pw) / 2, y = Math.max(6, (ch - ph) / 2);
        Ui.panel(g, x, y, pw, ph);
        Ui.centered(g, Ui.TITLE, "Configurações", cw / 2, y + 44, Color.WHITE);

        int rx = x + 30, rw = pw - 60, ry = y + 62;
        ui.selector(g, rx, ry, rw, "Limite de FPS", Settings.FPS_NAMES[s.fpsIndex], null,
                () -> change(() -> s.fpsIndex = Math.max(0, s.fpsIndex - 1)),
                () -> change(() -> s.fpsIndex = Math.min(Settings.FPS_LIMITS.length - 1, s.fpsIndex + 1)));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Texturas", s.imageTextures ? "Imagens (PNG)" : "Geradas", null,
                () -> change(this::toggleTextureSource), () -> change(this::toggleTextureSource));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Qualidade das texturas", Settings.TEX_NAMES[s.texIndex], null,
                () -> change(() -> s.texIndex = Math.max(0, s.texIndex - 1)),
                () -> change(() -> s.texIndex = Math.min(Settings.TEX_SIZES.length - 1, s.texIndex + 1)));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Sincronia vertical (VSync)", onOff(s.vsync), null,
                () -> change(this::toggleVsync), () -> change(this::toggleVsync));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Volume dos sons", s.volume * 10 + "%", null,
                () -> change(() -> { s.volume = Math.max(0, s.volume - 1); Sounds.setVolume(s.volume / 10.0); }),
                () -> change(() -> { s.volume = Math.min(10, s.volume + 1); Sounds.setVolume(s.volume / 10.0); Sounds.play("clique", 0.6); }));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Distância de visão", s.viewDist + " blocos", null,
                () -> change(() -> s.viewDist = Math.max(32, s.viewDist - 16)),
                () -> change(() -> s.viewDist = Math.min(384, s.viewDist + 16)));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Sombras", onOff(s.shadows), null,
                () -> change(() -> s.shadows = !s.shadows), () -> change(() -> s.shadows = !s.shadows));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Reflexos na água", onOff(s.reflections), null,
                () -> change(() -> s.reflections = !s.reflections), () -> change(() -> s.reflections = !s.reflections));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Sombra nos cantos (AO)", onOff(s.ao), null,
                () -> change(() -> s.ao = !s.ao), () -> change(() -> s.ao = !s.ao));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Campo de visão (FOV)", s.fov + "°", null,
                () -> change(() -> s.fov = Math.max(50, s.fov - 5)),
                () -> change(() -> s.fov = Math.min(110, s.fov + 5)));
        ry += rowH;
        ui.selector(g, rx, ry, rw, "Sensibilidade do mouse", String.valueOf(s.sensitivity), null,
                () -> change(() -> s.sensitivity = Math.max(1, s.sensitivity - 1)),
                () -> change(() -> s.sensitivity = Math.min(20, s.sensitivity + 1)));
        ry += rowH;

        // pacote de texturas
        g.setColor(new Color(255, 255, 255, 40));
        g.fillRect(rx, ry + 4, rw, 1);
        g.setFont(Ui.SMALL);
        String pack = s.imageTextures
                ? "Pastas \"textures\" e \"sounds\" na pasta do jogo  —  " + Textures.packInfo()
                : "Usando texturas geradas pelo jogo (a pasta textures é ignorada)";
        Ui.shadow(g, pack, rx, ry + 24, Ui.TEXT_DIM);
        ui.button(g, rx + 430, ry + 32, 210, 32, "Recarregar sons", true, false, () -> {
            Sounds.reload();
            toast("Sons recarregados da pasta sounds");
        });
        ui.button(g, rx, ry + 32, 200, 32, "Recarregar texturas", s.imageTextures, false, () -> {
            Textures.reload();
            toast("Texturas recarregadas: " + Textures.packInfo());
        });
        ui.button(g, rx + 210, ry + 32, 210, 32, "Abrir pasta de texturas", true, false, this::openTextureFolder);
        ry += 70;

        Ui.centered(g, Ui.SMALL, String.format("FPS %.0f  —  as mudanças aparecem na hora, ao fundo", fps), cw / 2, ry + 16, Ui.TEXT_DIM);
        ui.button(g, (cw - 220) / 2, ry + 28, 220, 42, "Voltar", () -> state = settingsReturn);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
    }

    private void toggleTextureSource() {
        settings.imageTextures = !settings.imageTextures;
        Textures.setUseImages(settings.imageTextures);
    }

    private void openTextureFolder() {
        try {
            Textures.get(16); // garante que a pasta exista
            new ProcessBuilder("explorer.exe", Textures.DIR.getAbsolutePath()).start();
        } catch (Exception e) {
            toast("Não consegui abrir a pasta: " + e.getMessage());
        }
    }

    private void change(Runnable r) {
        r.run();
        settings.save();
    }

    private void toggleVsync() {
        settings.vsync = !settings.vsync;
        glfwSwapInterval(settings.vsync ? 1 : 0);
    }

    private static String onOff(boolean b) {
        return b ? "Ligado" : "Desligado";
    }

    // =====================================================================
    // mouse capturado
    // =====================================================================
    /** Esconde e prende o cursor; o GLFW passa a entregar o movimento "cru" do mouse. */
    private void capture() {
        if (NO_INPUT) return;
        captured = true;
        firstMouse = true;
        mdx = mdy = 0;
        glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);
        if (glfwRawMouseMotionSupported()) glfwSetInputMode(window, GLFW_RAW_MOUSE_MOTION, GLFW_TRUE);
    }

    private void releaseMouse() {
        lHeld = rHeld = false;
        Arrays.fill(keys, false);
        if (captured) {
            captured = false;
            glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_NORMAL);
            glfwSetCursorPos(window, winW / 2.0, winH / 2.0);
            ui.mouseX = fbW / 2;
            ui.mouseY = fbH / 2;
        }
    }

    // =====================================================================
    // eventos (chamados pelo GLFW durante glfwPollEvents, na thread principal)
    // =====================================================================
    private void onKey(int k) {
        switch (state) {
            case PLAYING:
                if (chatOpen) {
                    if (k == KeyEvent.VK_ESCAPE) closeChat();
                    else if (k == KeyEvent.VK_ENTER) sendChat();
                    else if (k == KeyEvent.VK_O && (lastMods & GLFW_MOD_CONTROL) != 0) pickPhoto();
                    break;
                }
                if (k == KeyEvent.VK_T || k == KeyEvent.VK_ENTER) openChat(k == KeyEvent.VK_T ? 't' : 0);
                else if (k == KeyEvent.VK_ESCAPE) pause();
                else if (k == KeyEvent.VK_E) openInventory();
                else if (k == KeyEvent.VK_Q) dropHeld(keys[KeyEvent.VK_CONTROL]);
                else if (k >= KeyEvent.VK_1 && k <= KeyEvent.VK_9) selectSlot(k - KeyEvent.VK_1);
                else if (k == KeyEvent.VK_SPACE && creative) { // dois toques rápidos no espaço ligam/desligam o voo
                    long now = System.nanoTime();
                    if (now - lastSpaceTap < 300_000_000L) { player.flying = !player.flying; player.vy = 0; lastSpaceTap = 0; }
                    else lastSpaceTap = now;
                }
                else if (k == KeyEvent.VK_F1) help = !help;
                break;
            case PAUSED:
                if (k == KeyEvent.VK_ESCAPE) resume();
                break;
            case SETTINGS:
                if (k == KeyEvent.VK_ESCAPE) state = settingsReturn;
                break;
            case INVENTORY:
                if (k == KeyEvent.VK_ESCAPE || k == KeyEvent.VK_E) closeInventory();
                else if (k >= KeyEvent.VK_1 && k <= KeyEvent.VK_9) hotbarKey(k - KeyEvent.VK_1);
                break;
            case JOIN:
                if (k == KeyEvent.VK_ESCAPE) enterLobby();
                else if (k == KeyEvent.VK_TAB) focus = focus % 2 + 1;
                else if (k == KeyEvent.VK_ENTER) joinGame();
                break;
            case CREATE:
                if (k == KeyEvent.VK_ESCAPE) enterLobby();
                else if (k == KeyEvent.VK_TAB) focus = focus % 3 + 1;
                else if (k == KeyEvent.VK_ENTER) createWorld();
                break;
            case LOBBY:
                if (k == KeyEvent.VK_ENTER && !worlds.isEmpty()) loadWorld(worlds.get(selected));
                else if (k == KeyEvent.VK_UP) { selected = Math.max(0, selected - 1); confirmDelete = false; }
                else if (k == KeyEvent.VK_DOWN) { selected = Math.min(worlds.size() - 1, selected + 1); confirmDelete = false; }
                break;
            default:
                break;
        }
    }

    private void onChar(char ch) {
        if (chatOpen && state == State.PLAYING) {
            if (chatSkip != 0 && Character.toLowerCase(ch) == chatSkip) { chatSkip = 0; return; }
            chatSkip = 0;
            if (ch == '\b') {
                if (chatInput.length() > 0) chatInput.setLength(chatInput.length() - 1);
            } else if (ch >= 32 && ch != 127 && chatInput.length() < 100) {
                chatInput.append(ch);
            }
            return;
        }
        if ((state != State.CREATE && state != State.JOIN) || focus == 0) return;
        StringBuilder sb = state == State.JOIN ? (focus == 1 ? fIp : fJoinName) : focus == 1 ? fWorld : focus == 2 ? fSeed : fChar;
        int max = state == State.JOIN ? (focus == 1 ? 40 : 20) : focus == 2 ? 20 : 24;
        if (ch == '\b') {
            if (sb.length() > 0) sb.setLength(sb.length() - 1);
        } else if (ch >= 32 && ch != 127 && sb.length() < max) {
            sb.append(ch);
        }
    }

    private void onMouse(int x, int y, int button, boolean shift) {
        if (state == State.PLAYING) {
            if (chatOpen) return;
            if (button == 1) { lHeld = true; lPending = true; }
            else if (button == 3) { rHeld = true; rPending = true; }
            else if (button == 2 && creative && sel != null) {
                int b = world.get(sel[0], sel[1], sel[2]);
                if (!Block.isItemForm(b)) b = Block.drop(b); // variantes viram a forma de item
                inv.set(slot, b, Inventory.MAX);
                slotNameTimer = 2;
            }
            return;
        }
        if (state == State.INVENTORY) { // começo de um arrastar
            dragFrom = button == 1 ? slotAt(x, y) : null;
            dragStartX = x;
            dragStartY = y;
            if (button == 3) {
                invRightDown = true;
                rightVisited.clear();
                Object[] s = slotAt(x, y);
                if (s != null && cursorCount > 0) rightVisited.add(slotKey(s)); // o clique já solta 1 aqui
            }
        }
        boolean hit = ui.dispatch(x, y, button, shift);
        if (hit) Sounds.play("clique", 0.5);
        if (!hit && (state == State.CREATE || state == State.JOIN)) focus = 0;
    }

    private void onWheel(int rot) {
        if (state == State.PLAYING) selectSlot(Math.floorMod(slot + (rot > 0 ? 1 : -1), Inventory.HOTBAR));
        else if (state == State.LOBBY) listScroll += rot > 0 ? 1 : -1;
        else if (state == State.INVENTORY) {
            if (chest != null) return;
            if (creative) paletteScroll += rot > 0 ? 1 : -1;
            else recipeScroll += rot > 0 ? 1 : -1;
        }
    }

    private void selectSlot(int s) {
        slot = s;
        slotNameTimer = 2;
        breakProgress = 0;
    }
}
