import java.io.*;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.Deflater;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Um pedaço do mundo: 16 x 64 x 16 blocos, com a luz de tochas/lava, a altura do "teto" de cada coluna
 * (para a luz do céu) e a direção dos blocos que têm frente (fornalha, baú, cama...).
 * O mundo é feito de um número ilimitado desses pedaços, criados quando o jogador chega perto.
 */
final class Chunk {
    static final int SIZE = 16, SY = World.SY, VOLUME = SIZE * SIZE * SY;

    final int cx, cz;
    final byte[] blocks = new byte[VOLUME];
    /** Luz de blocos (0-15) de cada célula. */
    final byte[] light = new byte[VOLUME];
    /** Y do bloco mais alto que bloqueia a luz em cada coluna, índice lx * 16 + lz (-1 se nenhum). */
    final byte[] skyTop = new byte[SIZE * SIZE];
    /** Direção (0 +Z, 1 -X, 2 -Z, 3 +X) dos blocos que não estão no padrão: índice local -> direção. Pode ser null. */
    java.util.concurrent.ConcurrentHashMap<Integer, Byte> rot;
    /** Mudou desde a última vez que foi salvo? (pedaços intactos não precisam de arquivo: o gerador os refaz igualzinhos) */
    volatile boolean modified;
    /** Veio de um arquivo (e não do gerador): a água corrente salva precisa ser reavaliada. */
    boolean fromStore;

    Chunk(int cx, int cz) {
        this.cx = cx;
        this.cz = cz;
    }

    /** Índice de um bloco dentro do pedaço (lx e lz de 0 a 15). */
    static int idx(int lx, int y, int lz) {
        return (lx << 10) | (lz << 6) | y;
    }

    /** Calcula o teto de cada coluna e a luz de tochas/lava dentro do pedaço (sem olhar os vizinhos). */
    void prepare() {
        for (int lx = 0; lx < SIZE; lx++)
            for (int lz = 0; lz < SIZE; lz++) recomputeSkyTop(lx, lz);
        lightInside();
    }

    void recomputeSkyTop(int lx, int lz) {
        int base = (lx << 10) | (lz << 6);
        int y = SY - 1;
        while (y >= 0 && !Block.blocksLight(blocks[base | y] & 0xFF)) y--;
        skyTop[lx * SIZE + lz] = (byte) y;
    }

    /** Luz das fontes (lava, tochas) espalhada só dentro deste pedaço; a que passa para os vizinhos é tratada pelo mundo. */
    void lightInside() {
        Arrays.fill(light, (byte) 0);
        int[] queue = null;
        int n = 0;
        for (int i = 0; i < VOLUME; i++) {
            int l = Block.light(blocks[i] & 0xFF);
            if (l > 0) {
                light[i] = (byte) l;
                if (queue == null) queue = new int[1024];
                if (n == queue.length) queue = Arrays.copyOf(queue, n * 2);
                queue[n++] = i;
            }
        }
        if (queue == null) return;
        int head = 0;
        while (head < n) {
            int i = queue[head++];
            int l = light[i] - 1;
            if (l <= 0) continue;
            int lx = i >> 10, lz = (i >> 6) & 15, y = i & 63;
            for (int d = 0; d < 6; d++) {
                int nx = lx + (d == 0 ? 1 : d == 1 ? -1 : 0);
                int ny = y + (d == 2 ? 1 : d == 3 ? -1 : 0);
                int nz = lz + (d == 4 ? 1 : d == 5 ? -1 : 0);
                if (nx < 0 || nx >= SIZE || nz < 0 || nz >= SIZE || ny < 0 || ny >= SY) continue;
                int j = idx(nx, ny, nz);
                if (Block.blocksLight(blocks[j] & 0xFF) || light[j] >= l) continue;
                light[j] = (byte) l;
                if (n == queue.length) queue = Arrays.copyOf(queue, n * 2);
                queue[n++] = j;
            }
        }
    }

    boolean hasWater() {
        for (int i = 0; i < VOLUME; i++) if (Block.waterLevel(blocks[i] & 0xFF) > 0) return true;
        return false;
    }

    /** Cópia solta (só blocos e direções), para salvar em segundo plano enquanto o jogo continua mexendo no original. */
    Chunk copyForSave() {
        Chunk c = new Chunk(cx, cz);
        System.arraycopy(blocks, 0, c.blocks, 0, VOLUME);
        if (rot != null && !rot.isEmpty()) c.rot = new java.util.concurrent.ConcurrentHashMap<>(rot);
        return c;
    }

    // ------------------------------------------------------------------ arquivo e rede

    /** Formato (compactado): versão, quantidade de direções, direções (índice, valor) e os 16384 blocos. */
    byte[] toBytes() {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream(4096);
            try (DataOutputStream out = new DataOutputStream(new GZIPOutputStream(bos, 1 << 14) {
                { def.setLevel(Deflater.BEST_SPEED); }
            })) {
                out.writeByte(1);
                java.util.concurrent.ConcurrentHashMap<Integer, Byte> r = rot;
                java.util.List<Map.Entry<Integer, Byte>> entries = new java.util.ArrayList<>();
                if (r != null) entries.addAll(r.entrySet());
                out.writeInt(entries.size());
                for (Map.Entry<Integer, Byte> e : entries) { out.writeShort(e.getKey()); out.writeByte(e.getValue()); }
                out.write(blocks);
            }
            return bos.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static Chunk fromBytes(int cx, int cz, byte[] data) throws IOException {
        try (DataInputStream in = new DataInputStream(new GZIPInputStream(new ByteArrayInputStream(data)))) {
            int version = in.readByte();
            if (version != 1) throw new IOException("versão de pedaço desconhecida: " + version);
            Chunk c = new Chunk(cx, cz);
            int n = in.readInt();
            if (n < 0 || n > VOLUME) throw new IOException("direções inválidas");
            for (int k = 0; k < n; k++) {
                int i = in.readUnsignedShort();
                byte r = in.readByte();
                if (i < VOLUME && r != 0) {
                    if (c.rot == null) c.rot = new java.util.concurrent.ConcurrentHashMap<>();
                    c.rot.put(i, r);
                }
            }
            in.readFully(c.blocks);
            return c;
        }
    }
}
