import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Properties;

/** Configurações gráficas e de controle, salvas em settings.properties. */
final class Settings {
    static final int[] TEX_SIZES = { 8, 16, 32, 64 };
    static final String[] TEX_NAMES = { "Baixa (8px)", "Média (16px)", "Alta (32px)", "Ultra (64px)" };
    static final int[] SCALES = { 4, 3, 2, 1 };
    static final String[] SCALE_NAMES = { "Muito baixa (25%)", "Baixa (33%)", "Média (50%)", "Máxima (100%)" };

    static final int[] FPS_LIMITS = { 30, 45, 60, 90, 144, 0 };
    static final String[] FPS_NAMES = { "30", "45", "60", "90", "144", "Sem limite" };

    private static final File FILE = new File("settings.properties");

    int fpsIndex = 2;            // 60 FPS
    boolean imageTextures = true;
    boolean vsync = true;
    int volume = 8; // 0..10
    // multijogador: último IP e personagem usados para entrar num jogo LAN
    String lanIp = "", lanName = "", lanPersona = "";

    int fpsLimit() { return FPS_LIMITS[fpsIndex]; }

    int texIndex = 1;      // 16px
    int scaleIndex = 2;    // 1/2
    boolean shadows = true;
    boolean reflections = true;
    boolean ao = true;
    int viewDist = 96;     // blocos
    int fov = 70;          // graus
    int sensitivity = 5;   // 1..20

    int texSize() { return TEX_SIZES[texIndex]; }
    int scale() { return SCALES[scaleIndex]; }
    double mouseSens() { return sensitivity * 0.00044; }

    static Settings load() {
        Settings s = new Settings();
        if (!FILE.exists()) return s;
        Properties p = new Properties();
        try (InputStream in = new FileInputStream(FILE)) {
            p.load(in);
            s.texIndex = clamp(Integer.parseInt(p.getProperty("textura", "1")), 0, TEX_SIZES.length - 1);
            s.scaleIndex = clamp(Integer.parseInt(p.getProperty("resolucao", "2")), 0, SCALES.length - 1);
            s.shadows = Boolean.parseBoolean(p.getProperty("sombras", "true"));
            s.reflections = Boolean.parseBoolean(p.getProperty("reflexos", "true"));
            s.ao = Boolean.parseBoolean(p.getProperty("oclusao", "true"));
            s.viewDist = clamp(Integer.parseInt(p.getProperty("distancia", "96")), 32, 256);
            s.fov = clamp(Integer.parseInt(p.getProperty("fov", "70")), 50, 110);
            s.sensitivity = clamp(Integer.parseInt(p.getProperty("sensibilidade", "5")), 1, 20);
            s.fpsIndex = clamp(Integer.parseInt(p.getProperty("limiteFps", "2")), 0, FPS_LIMITS.length - 1);
            s.imageTextures = Boolean.parseBoolean(p.getProperty("texturasImagem", "true"));
            s.vsync = Boolean.parseBoolean(p.getProperty("vsync", "true"));
            s.volume = clamp(Integer.parseInt(p.getProperty("volume", "8")), 0, 10);
            s.lanIp = p.getProperty("lanIp", "");
            s.lanName = p.getProperty("lanNome", "");
            s.lanPersona = p.getProperty("lanPersonagem", "");
            s.viewDist = clamp(Integer.parseInt(p.getProperty("distancia", "96")), 32, 384);
        } catch (Exception e) {
            System.out.println("Não foi possível ler " + FILE + ": " + e.getMessage());
        }
        return s;
    }

    void save() {
        Properties p = new Properties();
        p.setProperty("textura", String.valueOf(texIndex));
        p.setProperty("resolucao", String.valueOf(scaleIndex));
        p.setProperty("sombras", String.valueOf(shadows));
        p.setProperty("reflexos", String.valueOf(reflections));
        p.setProperty("oclusao", String.valueOf(ao));
        p.setProperty("distancia", String.valueOf(viewDist));
        p.setProperty("fov", String.valueOf(fov));
        p.setProperty("sensibilidade", String.valueOf(sensitivity));
        p.setProperty("limiteFps", String.valueOf(fpsIndex));
        p.setProperty("texturasImagem", String.valueOf(imageTextures));
        p.setProperty("vsync", String.valueOf(vsync));
        p.setProperty("volume", String.valueOf(volume));
        p.setProperty("lanIp", lanIp);
        p.setProperty("lanNome", lanName);
        p.setProperty("lanPersonagem", lanPersona);
        try (OutputStream out = new FileOutputStream(FILE)) {
            p.store(out, "Configuracoes do Mundo de Blocos");
        } catch (Exception e) {
            System.out.println("Não foi possível salvar " + FILE + ": " + e.getMessage());
        }
    }

    static int clamp(int v, int lo, int hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
}
