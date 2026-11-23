import java.awt.Color;
import java.awt.Graphics2D;
import java.util.Properties;
import java.util.Random;

/** Personagem do mundo: nome e cores (pele, cabelo, camisa, calça). */
final class Persona {
    static final int[] SKIN = { 0xFFDBAC, 0xF1C27D, 0xE0AC69, 0xC68642, 0x8D5524, 0x5C3A1E };
    static final int[] HAIR = { 0x2B1B10, 0x6B4226, 0xE6C15A, 0xA0401E, 0xB0B0B0, 0x3060C0, 0xE070B0, 0x30A060 };
    static final int[] SHIRT = { 0x2AA198, 0xC0392B, 0x2E6FD8, 0x3C9A3C, 0xE0B020, 0x8E44AD, 0xE8E8E8, 0x303030, 0xE67E22 };
    static final int[] PANTS = { 0x34495E, 0x2C3E8F, 0x6B4F2A, 0x222222, 0x777777, 0x3E5E2E, 0x8B1E3F };

    private static final String[] NAMES = { "Aurora", "Bento", "Cora", "Davi", "Elis", "Fred", "Gaia", "Heitor",
            "Iara", "João", "Luna", "Miguel", "Nina", "Otto", "Pietra", "Rafa", "Sol", "Tom" };

    String name = "Explorador";
    int skin, hair, shirt, pants;

    static Persona random(Random r) {
        Persona c = new Persona();
        c.name = NAMES[r.nextInt(NAMES.length)];
        c.skin = r.nextInt(SKIN.length);
        c.hair = r.nextInt(HAIR.length);
        c.shirt = r.nextInt(SHIRT.length);
        c.pants = r.nextInt(PANTS.length);
        return c;
    }

    Color skinColor() { return new Color(SKIN[skin]); }
    Color shirtColor() { return new Color(SHIRT[shirt]); }

    void save(Properties p) {
        p.setProperty("personagem.nome", name);
        p.setProperty("personagem.pele", String.valueOf(skin));
        p.setProperty("personagem.cabelo", String.valueOf(hair));
        p.setProperty("personagem.camisa", String.valueOf(shirt));
        p.setProperty("personagem.calca", String.valueOf(pants));
    }

    static Persona load(Properties p) {
        Persona c = new Persona();
        c.name = p.getProperty("personagem.nome", "Explorador");
        c.skin = idx(p, "personagem.pele", SKIN.length);
        c.hair = idx(p, "personagem.cabelo", HAIR.length);
        c.shirt = idx(p, "personagem.camisa", SHIRT.length);
        c.pants = idx(p, "personagem.calca", PANTS.length);
        return c;
    }

    private static int idx(Properties p, String key, int n) {
        try {
            return Math.floorMod(Integer.parseInt(p.getProperty(key, "0")), n);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** Desenha o personagem de frente, em estilo de blocos. (x, y) = canto superior esquerdo; u = tamanho do "pixel". */
    void draw(Graphics2D g, int x, int y, int u) {
        Color skinC = new Color(SKIN[skin]), hairC = new Color(HAIR[hair]);
        Color shirtC = new Color(SHIRT[shirt]), pantsC = new Color(PANTS[pants]);
        // corpo tem 16u de largura e 32u de altura
        int hx = x + 4 * u;
        // sombra no chão
        g.setColor(new Color(0, 0, 0, 70));
        g.fillOval(x + u, y + 31 * u, 14 * u, 2 * u);
        // pernas
        box(g, x + 4 * u, y + 20 * u, 4 * u, 10 * u, pantsC);
        box(g, x + 8 * u, y + 20 * u, 4 * u, 10 * u, pantsC.darker());
        box(g, x + 4 * u, y + 30 * u, 4 * u, u, new Color(0x3A2A1A));
        box(g, x + 8 * u, y + 30 * u, 4 * u, u, new Color(0x3A2A1A));
        // tronco e braços
        box(g, x + 4 * u, y + 8 * u, 8 * u, 12 * u, shirtC);
        box(g, x, y + 8 * u, 4 * u, 5 * u, shirtC.darker());
        box(g, x + 12 * u, y + 8 * u, 4 * u, 5 * u, shirtC.darker());
        box(g, x, y + 13 * u, 4 * u, 7 * u, skinC.darker());
        box(g, x + 12 * u, y + 13 * u, 4 * u, 7 * u, skinC.darker());
        // cabeça
        box(g, hx, y, 8 * u, 8 * u, skinC);
        box(g, hx, y, 8 * u, 2 * u, hairC);
        box(g, hx, y + 2 * u, u, 2 * u, hairC);
        box(g, hx + 7 * u, y + 2 * u, u, 2 * u, hairC);
        // olhos e boca
        g.setColor(Color.WHITE);
        g.fillRect(hx + u, y + 4 * u, 2 * u, u);
        g.fillRect(hx + 5 * u, y + 4 * u, 2 * u, u);
        g.setColor(new Color(0x2050A0));
        g.fillRect(hx + 2 * u, y + 4 * u, u, u);
        g.fillRect(hx + 5 * u, y + 4 * u, u, u);
        g.setColor(skinC.darker().darker());
        g.fillRect(hx + 3 * u, y + 6 * u, 2 * u, u);
    }

    private static void box(Graphics2D g, int x, int y, int w, int h, Color c) {
        g.setColor(c);
        g.fillRect(x, y, w, h);
        g.setColor(new Color(0, 0, 0, 40));
        g.fillRect(x, y + h - Math.max(1, h / 8), w, Math.max(1, h / 8));
    }
}
