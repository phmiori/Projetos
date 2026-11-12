import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.util.Iterator;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/**
 * Fotos no chat: prepara um arquivo de imagem do disco para ser enviado (reduz e comprime em JPEG)
 * e lê com segurança as fotos que chegam pela rede.
 */
final class ChatImage {
    /** Maior lado da foto enviada, em pixels. */
    static final int MAX_SIDE = 640;
    /** Tamanho máximo aceito de uma foto pela rede, em bytes. */
    static final int MAX_BYTES = 1_500_000;
    /** Maior arquivo de origem que aceitamos abrir (fotos de celular têm uns 5 MB). */
    static final long MAX_FILE = 30L << 20;
    /** Maior imagem de origem, em pixels (uma foto de 48 megapixels já é demais). */
    static final long MAX_PIXELS = 60_000_000L;

    /** Lê o arquivo de imagem (png, jpg, gif ou bmp), reduz e devolve os bytes de um JPEG pronto para a rede. */
    static byte[] prepare(File f) throws IOException {
        if (!f.isFile()) throw new IOException("arquivo não encontrado");
        if (f.length() > MAX_FILE) throw new IOException("arquivo grande demais (máximo 30 MB)");
        BufferedImage src;
        try (ImageInputStream in = ImageIO.createImageInputStream(f)) {
            src = read(in, MAX_PIXELS);
        }
        if (src == null) throw new IOException("não é uma imagem que eu consiga abrir (use png, jpg, gif ou bmp)");
        return encode(shrink(src, MAX_SIDE));
    }

    /** Foto recebida pela rede: valida o tamanho antes de abrir (ninguém trava o jogo com uma imagem gigante). */
    static BufferedImage decode(byte[] data) throws IOException {
        if (data.length == 0 || data.length > MAX_BYTES) throw new IOException("foto com tamanho inválido");
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            BufferedImage img = read(in, 2_000_000L);
            if (img == null) throw new IOException("foto ilegível");
            return img;
        }
    }

    private static BufferedImage read(ImageInputStream in, long maxPixels) throws IOException {
        if (in == null) return null;
        Iterator<ImageReader> it = ImageIO.getImageReaders(in);
        if (!it.hasNext()) return null;
        ImageReader r = it.next();
        try {
            r.setInput(in, true, true);
            long pixels = (long) r.getWidth(0) * r.getHeight(0);
            if (pixels <= 0 || pixels > maxPixels) throw new IOException("imagem grande demais");
            return r.read(0);
        } finally {
            r.dispose();
        }
    }

    /** Reduz para que o maior lado seja no máximo `max` (sem ampliar), com fundo branco onde era transparente. */
    private static BufferedImage shrink(BufferedImage src, int max) {
        int w = src.getWidth(), h = src.getHeight();
        double k = Math.min(1.0, (double) max / Math.max(w, h));
        int nw = Math.max(1, (int) Math.round(w * k)), nh = Math.max(1, (int) Math.round(h * k));
        BufferedImage out = new BufferedImage(nw, nh, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setColor(java.awt.Color.WHITE);
        g.fillRect(0, 0, nw, nh);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        if (k < 0.5) { // reduções grandes em etapas, para não ficar serrilhado
            BufferedImage cur = src;
            int cw = w, ch = h;
            while (cw / 2 >= nw * 1.0 && ch / 2 >= nh * 1.0) {
                cw = Math.max(nw, cw / 2);
                ch = Math.max(nh, ch / 2);
                BufferedImage half = new BufferedImage(cw, ch, BufferedImage.TYPE_INT_RGB);
                Graphics2D hg = half.createGraphics();
                hg.setColor(java.awt.Color.WHITE);
                hg.fillRect(0, 0, cw, ch);
                hg.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                hg.drawImage(cur, 0, 0, cw, ch, null);
                hg.dispose();
                cur = half;
            }
            g.drawImage(cur, 0, 0, nw, nh, null);
        } else {
            g.drawImage(src, 0, 0, nw, nh, null);
        }
        g.dispose();
        return out;
    }

    /** JPEG; se ficar grande, baixa a qualidade até caber. */
    private static byte[] encode(BufferedImage img) throws IOException {
        float[] qualities = { 0.85f, 0.7f, 0.5f, 0.3f };
        Iterator<ImageWriter> it = ImageIO.getImageWritersByFormatName("jpeg");
        if (!it.hasNext()) throw new IOException("este Java não sabe gravar JPEG");
        ImageWriter w = it.next();
        try {
            byte[] best = null;
            for (float q : qualities) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream(1 << 16);
                ImageWriteParam p = w.getDefaultWriteParam();
                p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                p.setCompressionQuality(q);
                try (MemoryCacheImageOutputStream out = new MemoryCacheImageOutputStream(bos)) {
                    w.setOutput(out);
                    w.write(null, new IIOImage(img, null, null), p);
                }
                best = bos.toByteArray();
                if (best.length <= MAX_BYTES / 3) break;
            }
            return best;
        } finally {
            w.dispose();
        }
    }

    private ChatImage() {}
}
