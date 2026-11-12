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
