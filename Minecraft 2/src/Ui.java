import java.awt.*;
import java.awt.geom.Area;
import java.awt.geom.Ellipse2D;
import java.awt.geom.RoundRectangle2D;
import java.util.ArrayList;
import java.util.List;

/**
 * Peças de interface desenhadas com Java2D. A cada quadro as telas se redesenham e registram
 * as áreas clicáveis; um clique é entregue à área de cima que contém o ponto.
 */
final class Ui {
    interface Click { void click(int button, boolean shift); }

    private static final class Region {
        final Rectangle r;
        final Click c;
        Region(Rectangle r, Click c) { this.r = r; this.c = c; }
    }

    static final Font TITLE = new Font(Font.SANS_SERIF, Font.BOLD, 34);
    static final Font BIG = new Font(Font.SANS_SERIF, Font.BOLD, 20);
    static final Font BUTTON = new Font(Font.SANS_SERIF, Font.BOLD, 16);
    static final Font LABEL = new Font(Font.SANS_SERIF, Font.PLAIN, 16);
    static final Font SMALL = new Font(Font.SANS_SERIF, Font.PLAIN, 13);
    static final Font COUNT = new Font(Font.SANS_SERIF, Font.BOLD, 13);
    static final Font INFO = new Font(Font.MONOSPACED, Font.BOLD, 14);

    static final Color TEXT_DIM = new Color(255, 255, 255, 160);
    static final Color ACCENT = new Color(120, 200, 90);

    private final List<Region> regions = new ArrayList<>();
    volatile int mouseX = -1, mouseY = -1;

    void begin() { regions.clear(); }

    boolean hover(Rectangle r) { return r.contains(mouseX, mouseY); }

    void region(Rectangle r, Click c) { regions.add(new Region(r, c)); }

    /** Entrega o clique à área mais de cima. Retorna false se não acertou nada. */
    boolean dispatch(int x, int y, int button, boolean shift) {
        for (int i = regions.size() - 1; i >= 0; i--) {
            Region rg = regions.get(i);
            if (rg.r.contains(x, y)) {
                rg.c.click(button, shift);
                return true;
            }
        }
        return false;
    }

    static void panel(Graphics2D g, int x, int y, int w, int h) {
        g.setColor(new Color(20, 22, 28, 220));
        g.fill(new RoundRectangle2D.Double(x, y, w, h, 18, 18));
        g.setColor(new Color(255, 255, 255, 55));
        g.setStroke(new BasicStroke(1.5f));
        g.draw(new RoundRectangle2D.Double(x, y, w, h, 18, 18));
    }

    void button(Graphics2D g, int x, int y, int w, int h, String text, Runnable action) {
        button(g, x, y, w, h, text, true, false, action);
    }

    void button(Graphics2D g, int x, int y, int w, int h, String text, boolean enabled, boolean primary, Runnable action) {
        Rectangle r = new Rectangle(x, y, w, h);
        boolean hv = enabled && hover(r);
        Color bg = !enabled ? new Color(40, 40, 44, 170)
                : hv ? new Color(95, 150, 72, 240)
                : primary ? new Color(62, 110, 50, 235) : new Color(45, 48, 56, 225);
        g.setColor(bg);
        g.fill(new RoundRectangle2D.Double(x, y, w, h, 10, 10));
        g.setColor(hv ? new Color(200, 255, 180) : new Color(255, 255, 255, enabled ? 90 : 40));
        g.setStroke(new BasicStroke(1.5f));
        g.draw(new RoundRectangle2D.Double(x, y, w, h, 10, 10));
        g.setFont(BUTTON);
        g.setColor(enabled ? Color.WHITE : new Color(255, 255, 255, 90));
        FontMetrics fm = g.getFontMetrics();
        g.drawString(text, x + (w - fm.stringWidth(text)) / 2, y + (h + fm.getAscent() - fm.getDescent()) / 2);
        if (enabled) region(r, (b, s) -> { if (b == 1) action.run(); });
    }

    /** Linha "rótulo  < valor >". Se swatch != null, mostra um quadrado com a cor ao lado do valor. */
    void selector(Graphics2D g, int x, int y, int w, String label, String value, Color swatch, Runnable dec, Runnable inc) {
        g.setFont(LABEL);
        g.setColor(Color.WHITE);
        g.drawString(label, x, y + 24);
        int arrow = 32, valueW = Math.min(200, w / 2);
        int ax = x + w - arrow * 2 - valueW;
        button(g, ax, y + 2, arrow, arrow, "<", dec);
        g.setColor(new Color(255, 255, 255, 22));
        g.fillRect(ax + arrow + 4, y + 2, valueW - 8, arrow);
        int cx = ax + arrow + valueW / 2;
        if (swatch != null) {
            g.setColor(swatch);
            g.fillRect(cx - 40, y + 8, 20, 20);
            g.setColor(new Color(255, 255, 255, 120));
            g.drawRect(cx - 40, y + 8, 20, 20);
            g.setColor(Color.WHITE);
            g.setFont(BUTTON);
            g.drawString(value, cx - 12, y + 24);
        } else {
            centered(g, BUTTON, value, cx, y + 24, Color.WHITE);
        }
        button(g, ax + arrow + valueW, y + 2, arrow, arrow, ">", inc);
    }

    void textField(Graphics2D g, int x, int y, int w, int h, String text, String placeholder,
                   boolean focused, boolean caretOn, Runnable focus) {
        Rectangle r = new Rectangle(x, y, w, h);
        g.setColor(new Color(12, 13, 17, 235));
        g.fillRect(x, y, w, h);
        g.setColor(focused ? ACCENT : hover(r) ? new Color(255, 255, 255, 160) : new Color(255, 255, 255, 80));
        g.setStroke(new BasicStroke(focused ? 2f : 1.2f));
        g.drawRect(x, y, w, h);
        g.setFont(LABEL);
        FontMetrics fm = g.getFontMetrics();
        String shown = text;
        while (fm.stringWidth(shown) > w - 20 && shown.length() > 0) shown = shown.substring(1);
        int ty = y + (h + fm.getAscent() - fm.getDescent()) / 2;
        if (text.isEmpty() && !focused) {
            g.setColor(new Color(255, 255, 255, 90));
            g.drawString(placeholder, x + 10, ty);
        } else {
            g.setColor(Color.WHITE);
            g.drawString(shown, x + 10, ty);
        }
        if (focused && caretOn) {
            int cx = x + 10 + fm.stringWidth(shown) + 1;
            g.fillRect(cx, y + 8, 2, h - 16);
        }
        region(r, (b, s) -> focus.run());
    }

    static void centered(Graphics2D g, Font f, String s, int cx, int y, Color c) {
        g.setFont(f);
        int x = cx - g.getFontMetrics().stringWidth(s) / 2;
        g.setColor(new Color(0, 0, 0, 160));
        g.drawString(s, x + 1, y + 2);
        g.setColor(c);
        g.drawString(s, x, y);
    }

    static void shadow(Graphics2D g, String s, int x, int y, Color c) {
        g.setColor(new Color(0, 0, 0, 170));
        g.drawString(s, x + 1, y + 1);
        g.setColor(c);
        g.drawString(s, x, y);
    }

    // =====================================================================
    // tema de pedra escura: inventário, bancada, fornalha, baú e barra rápida
    // =====================================================================
    static final Color STONE_TEXT = new Color(226, 212, 188);
    static final Color STONE_DIM = new Color(170, 158, 140);
    static final Font STONE_TITLE = new Font(Font.SERIF, Font.BOLD, 26);
    static final Font STONE_LABEL = new Font(Font.SERIF, Font.BOLD, 17);

    private static TexturePaint stonePaint, darkPaint;

    /** Textura de pedra feita com ruído (gerada uma vez): manchas, grão e algumas rachaduras. */
    private static java.awt.image.BufferedImage stoneTexture(int base, int seed) {
        int s = 192;
        java.awt.image.BufferedImage img = new java.awt.image.BufferedImage(s, s, java.awt.image.BufferedImage.TYPE_INT_RGB);
        java.util.Random r = new java.util.Random(seed);
        double[] blot = new double[(s / 16 + 1) * (s / 16 + 1)];
        for (int i = 0; i < blot.length; i++) blot[i] = r.nextDouble();
        int n = s / 16;
        for (int y = 0; y < s; y++)
            for (int x = 0; x < s; x++) {
                // manchas grandes (interpoladas e repetindo nas bordas para a textura emendar)
                double fx = x / 16.0, fy = y / 16.0;
                int ix = (int) fx, iy = (int) fy;
                double tx = fx - ix, ty = fy - iy;
                tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
                double a = blot[(iy % n) * (n + 1) + ix % n], b = blot[(iy % n) * (n + 1) + (ix + 1) % n];
                double c = blot[((iy + 1) % n) * (n + 1) + ix % n], d = blot[((iy + 1) % n) * (n + 1) + (ix + 1) % n];
                double v = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
                int g = (int) (base + (v - 0.5) * 18 + (r.nextDouble() - 0.5) * 10);
                g = Math.max(0, Math.min(255, g));
                img.setRGB(x, y, (g << 16) | ((g - 1) << 8) | Math.min(255, g + 3));
            }
        // rachaduras finas
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        for (int k = 0; k < 7; k++) {
            double x = r.nextDouble() * s, y = r.nextDouble() * s, ang = r.nextDouble() * Math.PI * 2;
            g.setColor(new Color(0, 0, 0, 70));
            g.setStroke(new BasicStroke(1.1f));
            for (int st = 0; st < 6; st++) {
                double nx = x + Math.cos(ang) * (6 + r.nextDouble() * 10), ny = y + Math.sin(ang) * (6 + r.nextDouble() * 10);
                g.drawLine((int) x, (int) y, (int) nx, (int) ny);
                g.setColor(new Color(255, 255, 255, 14));
                g.drawLine((int) x + 1, (int) y + 1, (int) nx + 1, (int) ny + 1);
                g.setColor(new Color(0, 0, 0, 70));
                x = nx; y = ny;
                ang += (r.nextDouble() - 0.5) * 1.2;
            }
        }
        g.dispose();
        return img;
    }

    private static TexturePaint stone() {
        if (stonePaint == null) {
            java.awt.image.BufferedImage t = stoneTexture(60, 7);
            stonePaint = new TexturePaint(t, new Rectangle(0, 0, t.getWidth(), t.getHeight()));
        }
        return stonePaint;
    }

    private static TexturePaint darkStone() {
        if (darkPaint == null) {
            java.awt.image.BufferedImage t = stoneTexture(30, 11);
            darkPaint = new TexturePaint(t, new Rectangle(0, 0, t.getWidth(), t.getHeight()));
        }
        return darkPaint;
    }

    /** Painel de pedra com moldura chanfrada, borda de ferro e rebites nos cantos. */
    static void stonePanel(Graphics2D g, int x, int y, int w, int h) {
        Object aa = g.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        // sombra
        g.setColor(new Color(0, 0, 0, 110));
        g.fillRect(x + 5, y + 7, w, h);
        // moldura de ferro escuro
        g.setColor(new Color(24, 22, 24));
        g.fillRect(x, y, w, h);
        g.setPaint(darkStone());
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        // pedra do miolo
        g.setPaint(stone());
        g.fillRect(x + 8, y + 8, w - 16, h - 16);
        // chanfro: luz em cima/esquerda, sombra embaixo/direita
        g.setColor(new Color(255, 245, 230, 40));
        g.fillRect(x + 8, y + 8, w - 16, 2);
        g.fillRect(x + 8, y + 8, 2, h - 16);
        g.setColor(new Color(0, 0, 0, 90));
        g.fillRect(x + 8, y + h - 10, w - 16, 2);
        g.fillRect(x + w - 10, y + 8, 2, h - 16);
        g.setColor(new Color(110, 100, 92));
        g.setStroke(new BasicStroke(1f));
        g.drawRect(x + 1, y + 1, w - 3, h - 3);
        g.setColor(new Color(0, 0, 0, 200));
        g.drawRect(x + 7, y + 7, w - 15, h - 15);
        // rebites
        int[][] c = { { x + 4, y + 4 }, { x + w - 5, y + 4 }, { x + 4, y + h - 5 }, { x + w - 5, y + h - 5 } };
        for (int[] p : c) rivet(g, p[0], p[1], 6);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, aa);
    }

    private static void rivet(Graphics2D g, int cx, int cy, int r) {
        g.setColor(new Color(20, 18, 18));
        g.fillOval(cx - r, cy - r, r * 2, r * 2);
        g.setColor(new Color(150, 140, 128));
        g.fillOval(cx - r + 1, cy - r + 1, r * 2 - 3, r * 2 - 3);
        g.setColor(new Color(220, 210, 196));
        g.fillOval(cx - r + 2, cy - r + 2, r - 1, r - 1);
    }

    /** Área funda (janela do personagem, fundo de listas). */
    static void well(Graphics2D g, int x, int y, int w, int h) {
        g.setColor(new Color(12, 11, 14));
        g.fillRect(x, y, w, h);
        g.setPaint(new GradientPaint(x, y, new Color(40, 34, 44), x, y + h, new Color(10, 9, 12)));
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        bevel(g, x, y, w, h, false);
    }

    /** Chanfro de 2 px: para dentro (afundado) ou para fora (saltado). */
    static void bevel(Graphics2D g, int x, int y, int w, int h, boolean raised) {
        Color light = new Color(255, 245, 230, raised ? 60 : 38), dark = new Color(0, 0, 0, 150);
        g.setColor(raised ? light : dark);
        g.fillRect(x, y, w, 2);
        g.fillRect(x, y, 2, h);
        g.setColor(raised ? dark : light);
        g.fillRect(x, y + h - 2, w, 2);
        g.fillRect(x + w - 2, y, 2, h);
    }

    /** Espaço de item afundado na pedra. */
    static void slot(Graphics2D g, int x, int y, int s, boolean hover, boolean selected) {
        g.setColor(new Color(16, 15, 18, 235));
        g.fillRect(x, y, s, s);
        g.setColor(new Color(42, 39, 44, 235));
        g.fillRect(x + 2, y + 2, s - 4, s - 4);
        bevel(g, x, y, s, s, false);
        if (hover) {
            g.setColor(new Color(255, 240, 210, 46));
            g.fillRect(x + 2, y + 2, s - 4, s - 4);
        }
        if (selected) {
            g.setColor(new Color(232, 190, 90));
            g.setStroke(new BasicStroke(2f));
            g.drawRect(x - 1, y - 1, s + 1, s + 1);
        }
    }

    /** Título gravado: texto claro com traços dos dois lados. */
    static void stoneTitle(Graphics2D g, String s, int cx, int y, int span) {
        g.setFont(STONE_TITLE);
        FontMetrics fm = g.getFontMetrics();
        int tw = fm.stringWidth(s), x = cx - tw / 2;
        g.setColor(new Color(0, 0, 0, 170));
        g.drawString(s, x + 2, y + 2);
        g.setColor(STONE_TEXT);
        g.drawString(s, x, y);
        int ly = y - fm.getAscent() / 3;
        int len = Math.max(0, (span - tw) / 2 - 18);
        if (len > 8) {
            for (int side = -1; side <= 1; side += 2) {
                int x0 = side < 0 ? x - 12 - len : x + tw + 12;
                g.setColor(new Color(0, 0, 0, 160));
                g.fillRect(x0, ly + 1, len, 3);
                g.setColor(STONE_DIM);
                g.fillRect(x0, ly, len, 2);
                int dx = side < 0 ? x0 + len + 4 : x0 - 8; // losango na ponta de dentro
                g.fillPolygon(new int[] { dx, dx + 3, dx + 6, dx + 3 }, new int[] { ly + 1, ly - 2, ly + 1, ly + 4 }, 4);
            }
        }
    }

    /** Seta da criação/fornalha; progress de 0 a 1 enche a seta (fornalha). */
    static void arrow(Graphics2D g, int x, int y, int w, int h, double progress) {
        Polygon p = new Polygon(new int[] { x, x + w * 6 / 10, x + w * 6 / 10, x + w, x + w * 6 / 10, x + w * 6 / 10, x },
                new int[] { y + h * 3 / 10, y + h * 3 / 10, y, y + h / 2, y + h, y + h * 7 / 10, y + h * 7 / 10 }, 7);
        Object aa = g.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.translate(2, 2);
        g.setColor(new Color(0, 0, 0, 150));
        g.fill(p);
        g.translate(-2, -2);
        g.setColor(new Color(150, 140, 128));
        g.fill(p);
        if (progress > 0) {
            Shape old = g.getClip();
            g.clipRect(x, y, (int) (w * Math.min(1, progress)), h + 1);
            g.setColor(new Color(240, 236, 226));
            g.fill(p);
            g.setClip(old);
        }
        g.setColor(new Color(40, 36, 34));
        g.setStroke(new BasicStroke(1.2f));
        g.draw(p);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, aa);
    }

    /** Chama da fornalha: fill de 0 a 1 (quanto do combustível ainda queima). */
    static void flame(Graphics2D g, int x, int y, int s, double fill) {
        Object aa = g.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        java.awt.geom.Path2D f = new java.awt.geom.Path2D.Double();
        f.moveTo(x + s * 0.5, y);
        f.curveTo(x + s * 0.9, y + s * 0.35, x + s, y + s * 0.65, x + s * 0.5, y + s);
        f.curveTo(x, y + s * 0.65, x + s * 0.15, y + s * 0.4, x + s * 0.35, y + s * 0.25);
        f.curveTo(x + s * 0.4, y + s * 0.45, x + s * 0.5, y + s * 0.3, x + s * 0.5, y);
        f.closePath();
        g.setColor(new Color(60, 54, 50));
        g.fill(f);
        if (fill > 0) {
            Shape old = g.getClip();
            int top = (int) (y + s * (1 - Math.min(1, fill)));
            g.clipRect(x, top, s + 1, y + s - top + 1);
            g.setPaint(new GradientPaint(x, y, new Color(255, 230, 120), x, y + s, new Color(230, 80, 20)));
            g.fill(f);
            g.setClip(old);
        }
        g.setColor(new Color(20, 18, 16));
        g.setStroke(new BasicStroke(1f));
        g.draw(f);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, aa);
    }

    /** Botão quadrado de pedra com um livro (abre/fecha o livro de receitas). */
    static void bookIcon(Graphics2D g, int x, int y, int s, boolean open) {
        int m = s / 5;
        g.setColor(new Color(20, 40, 20));
        g.fillRect(x + m, y + m + 2, s - 2 * m, s - 2 * m - 2);
        g.setColor(open ? new Color(90, 170, 80) : new Color(60, 130, 55));
        g.fillRect(x + m, y + m, s - 2 * m - 3, s - 2 * m - 4);
        g.setColor(new Color(235, 228, 205));
        g.fillRect(x + m + 3, y + s - m - 6, s - 2 * m - 6, 3);
        g.setColor(new Color(30, 70, 30));
        g.fillRect(x + m + 4, y + m + 2, 2, s - 2 * m - 8);
        g.setColor(new Color(170, 230, 150));
        g.fillRect(x + m + 9, y + m + 5, s - 2 * m - 16, 2);
        g.fillRect(x + m + 9, y + m + 10, s - 2 * m - 20, 2);
    }

    /** Caixa escura translúcida do HUD (informações e ajuda). */
    static void hudBox(Graphics2D g, int x, int y, int w, int h) {
        Object aa = g.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(10, 10, 14, 130));
        g.fill(new RoundRectangle2D.Double(x, y, w, h, 10, 10));
        g.setColor(new Color(255, 255, 255, 28));
        g.setStroke(new BasicStroke(1f));
        g.draw(new RoundRectangle2D.Double(x + 0.5, y + 0.5, w - 1, h - 1, 10, 10));
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, aa);
    }

    /** Moldura de pedra atrás da barra rápida. */
    static void hotbarFrame(Graphics2D g, int x, int y, int w, int h) {
        g.setColor(new Color(0, 0, 0, 120));
        g.fillRect(x + 3, y + 4, w, h);
        g.setColor(new Color(22, 20, 22));
        g.fillRect(x, y, w, h);
        g.setPaint(stone());
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        bevel(g, x + 2, y + 2, w - 4, h - 4, true);
    }

    private static final java.util.Map<Integer, java.awt.image.BufferedImage> HEARTS = new java.util.HashMap<>();

    /** Coração de vida (desenhado uma vez e guardado). fill: 0 = vazio, 0.5 = meio, 1 = cheio. */
    static void heart(Graphics2D g, int x, int y, int s, double fill) {
        int key = s * 4 + (int) Math.round(fill * 2);
        java.awt.image.BufferedImage img = HEARTS.get(key);
        if (img == null) {
            img = new java.awt.image.BufferedImage(s + 2, s + 2, java.awt.image.BufferedImage.TYPE_INT_ARGB_PRE);
            Graphics2D hg = img.createGraphics();
            hg.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            drawHeart(hg, 1, 1, s, fill);
            hg.dispose();
            HEARTS.put(key, img);
        }
        g.drawImage(img, x - 1, y - 1, null);
    }

    private static void drawHeart(Graphics2D g, int x, int y, int s, double fill) {
        Area a = new Area(new Ellipse2D.Double(x, y, s * 0.56, s * 0.56));
        a.add(new Area(new Ellipse2D.Double(x + s * 0.44, y, s * 0.56, s * 0.56)));
        a.add(new Area(new Polygon(
                new int[] { x + (int) (s * 0.03), x + s / 2, x + (int) (s * 0.97) },
                new int[] { y + (int) (s * 0.38), y + s, y + (int) (s * 0.38) }, 3)));
        g.setColor(new Color(40, 0, 0, 200));
        g.fill(a);
        if (fill > 0) {
            Shape old = g.getClip();
            g.clipRect(x, y, (int) Math.ceil(s * fill), s + 1);
            g.setColor(new Color(220, 30, 40));
            g.fill(a);
            g.setColor(new Color(255, 140, 140));
            g.fillRect(x + s / 5, y + s / 6, Math.max(2, s / 6), Math.max(2, s / 6));
            g.setClip(old);
        }
        g.setColor(new Color(0, 0, 0, 200));
        g.setStroke(new BasicStroke(1.3f));
        g.draw(a);
    }
}
