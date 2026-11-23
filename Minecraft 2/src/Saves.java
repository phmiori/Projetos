import java.io.*;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Properties;
import java.util.zip.Deflater;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Mundos salvos na pasta "worlds". Cada mundo tem:
 *   meta.properties  — nome, semente, modo, personagem, posição, vida e inventário
 *   chunks/          — os pedaços do mundo que o jogador modificou (o resto o gerador refaz pela semente)
 */
final class Saves {
    static final File DIR = new File("worlds");

    /** Informações de um mundo (o que aparece no lobby e o estado do jogador). */
    static final class Info {
        String id, name;
        int seed;
        boolean creative;
        long created, lastPlayed;
        Persona persona = new Persona();
        // estado do jogador
        boolean hasPlayer;
        double px, py, pz, yaw, pitch, health = 20, food = 20;
        double time = World.DAY_LENGTH * 0.3; // hora do dia (segundos)
        int day = 1;
        double spawnX, spawnY, spawnZ;
        boolean flying;
        String inventory = "";
        int inventoryFormat = 2; // 1 = itens com ids antigos (64..95)
        /** Tamanho dos biomas (World.biomeScale): 1 nos mundos antigos, World.BIG_BIOMES nos criados agora. */
        double biomeScale = 1;
        /** Progresso dos amigos que jogaram neste mundo pela LAN: nome -> estado (Remote.stateString). */
        java.util.Map<String, String> lanPlayers = new java.util.HashMap<>();
        /** O que há em cada baú: "x,y,z" -> conteúdo (Inventory.serialize). */
        java.util.Map<String, String> chests = new java.util.HashMap<>();
        /** Fornalhas: "x,y,z" -> conteúdo|calor|calorMax|progresso. */
        java.util.Map<String, String> furnaces = new java.util.HashMap<>();
        /** Lobos domesticados: "x;y;z;sentado(0/1);vida;dono". */
        java.util.List<String> wolves = new ArrayList<>();
        /** As outras criaturas do mundo: "tipo;x;y;z;direção;vida;id" (Mobs.save). */
        java.util.List<String> mobs = new ArrayList<>();

        File dir() { return new File(DIR, id); }
    }

    static List<Info> list() {
        List<Info> out = new ArrayList<>();
        File[] dirs = DIR.listFiles(File::isDirectory);
        if (dirs == null) return out;
        for (File d : dirs) {
            try {
                Info i = readMeta(d);
                if (i != null) out.add(i);
            } catch (Exception e) {
                System.out.println("Mundo ignorado (" + d.getName() + "): " + e.getMessage());
            }
        }
        out.sort(Comparator.comparingLong((Info i) -> i.lastPlayed).reversed());
        return out;
    }

    private static Info readMeta(File d) throws IOException {
        File f = new File(d, "meta.properties");
        if (!f.exists()) return null;
        Properties p = new Properties();
        try (Reader r = new InputStreamReader(new FileInputStream(f), "UTF-8")) {
            p.load(r);
        }
        Info i = new Info();
        i.id = d.getName();
        i.name = p.getProperty("nome", d.getName());
        i.seed = Integer.parseInt(p.getProperty("semente", "0"));
        try { i.biomeScale = Double.parseDouble(p.getProperty("tamanhoBiomas", "1")); } catch (NumberFormatException e) { i.biomeScale = 1; }
        i.creative = "criativo".equals(p.getProperty("modo"));
        i.created = Long.parseLong(p.getProperty("criado", "0"));
        i.lastPlayed = Long.parseLong(p.getProperty("ultimoJogo", "0"));
        i.persona = Persona.load(p);
        i.hasPlayer = p.getProperty("jogador.x") != null;
        if (i.hasPlayer) {
            i.px = d(p, "jogador.x"); i.py = d(p, "jogador.y"); i.pz = d(p, "jogador.z");
            i.yaw = d(p, "jogador.yaw"); i.pitch = d(p, "jogador.pitch");
            i.health = d(p, "jogador.vida");
            i.spawnX = d(p, "spawn.x"); i.spawnY = d(p, "spawn.y"); i.spawnZ = d(p, "spawn.z");
            i.flying = Boolean.parseBoolean(p.getProperty("jogador.voando", "false"));
            i.food = Double.parseDouble(p.getProperty("jogador.fome", "20"));
        }
        // a hora é guardada em segundos; se o dia mudou de duração desde que o mundo foi salvo (era 720 s), mantém a hora do dia
        double savedDay = Double.parseDouble(p.getProperty("diaDuracao", "720"));
        i.time = Double.parseDouble(p.getProperty("hora", String.valueOf(World.DAY_LENGTH * 0.3)));
        if (savedDay > 0 && savedDay != World.DAY_LENGTH) i.time = i.time / savedDay * World.DAY_LENGTH;
        i.day = Integer.parseInt(p.getProperty("dia", "1"));
        i.inventory = p.getProperty("inventario", "");
        i.inventoryFormat = Integer.parseInt(p.getProperty("inventarioFormato", "1"));
        for (String k : p.stringPropertyNames())
            if (k.startsWith("lan.")) i.lanPlayers.put(k.substring(4), p.getProperty(k));
            else if (k.startsWith("bau.")) i.chests.put(k.substring(4), p.getProperty(k));
            else if (k.startsWith("fornalha.")) i.furnaces.put(k.substring(9), p.getProperty(k));
            else if (k.startsWith("lobo.")) i.wolves.add(p.getProperty(k));
            else if (k.startsWith("criatura.")) i.mobs.add(p.getProperty(k));
        return i;
    }

    private static double d(Properties p, String k) {
        return Double.parseDouble(p.getProperty(k, "0"));
    }

    static String newId(String name) {
        String base = name.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (base.isEmpty()) base = "mundo";
        if (base.length() > 24) base = base.substring(0, 24);
        String id = base;
        for (int n = 2; new File(DIR, id).exists(); n++) id = base + "-" + n;
        return id;
    }

    static void saveMeta(Info i) throws IOException {
        File d = i.dir();
        if (!d.exists() && !d.mkdirs()) throw new IOException("não consegui criar " + d);
        Properties p = new Properties();
        p.setProperty("nome", i.name);
        p.setProperty("semente", String.valueOf(i.seed));
        p.setProperty("tamanhoBiomas", String.valueOf(i.biomeScale));
        p.setProperty("modo", i.creative ? "criativo" : "sobrevivencia");
        p.setProperty("criado", String.valueOf(i.created));
        p.setProperty("ultimoJogo", String.valueOf(i.lastPlayed));
        i.persona.save(p);
        if (i.hasPlayer) {
            p.setProperty("jogador.x", String.valueOf(i.px));
            p.setProperty("jogador.y", String.valueOf(i.py));
            p.setProperty("jogador.z", String.valueOf(i.pz));
            p.setProperty("jogador.yaw", String.valueOf(i.yaw));
            p.setProperty("jogador.pitch", String.valueOf(i.pitch));
            p.setProperty("jogador.vida", String.valueOf(i.health));
            p.setProperty("jogador.voando", String.valueOf(i.flying));
            p.setProperty("jogador.fome", String.valueOf(i.food));
            p.setProperty("spawn.x", String.valueOf(i.spawnX));
            p.setProperty("spawn.y", String.valueOf(i.spawnY));
            p.setProperty("spawn.z", String.valueOf(i.spawnZ));
        }
        p.setProperty("inventario", i.inventory);
        p.setProperty("inventarioFormato", "2");
        for (java.util.Map.Entry<String, String> e : i.lanPlayers.entrySet()) p.setProperty("lan." + e.getKey(), e.getValue());
        for (java.util.Map.Entry<String, String> e : i.chests.entrySet()) p.setProperty("bau." + e.getKey(), e.getValue());
        for (java.util.Map.Entry<String, String> e : i.furnaces.entrySet()) p.setProperty("fornalha." + e.getKey(), e.getValue());
        for (int k = 0; k < i.wolves.size(); k++) p.setProperty("lobo." + k, i.wolves.get(k));
        for (int k = 0; k < i.mobs.size(); k++) p.setProperty("criatura." + k, i.mobs.get(k));
        p.setProperty("hora", String.valueOf(i.time));
        p.setProperty("diaDuracao", String.valueOf(World.DAY_LENGTH));
        p.setProperty("dia", String.valueOf(i.day));
        File tmp = new File(d, "meta.properties.tmp");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(tmp), "UTF-8")) {
            p.store(w, "Mundo de Blocos");
        }
        replace(tmp, new File(d, "meta.properties"));
    }

    // ------------------------------------------------------------------ pedaços do mundo

    /** Os pedaços modificados de um mundo, um arquivo cada na pasta "chunks" (os outros o gerador refaz igual). */
    static final class DiskStore implements World.Store {
        private final File dir;

        DiskStore(Info i) {
            dir = new File(i.dir(), "chunks");
        }

        private File file(int cx, int cz) {
            return new File(dir, cx + "_" + cz + ".dat");
        }

        public byte[] read(int cx, int cz) {
            File f = file(cx, cz);
            if (!f.exists()) return null;
            try {
                return java.nio.file.Files.readAllBytes(f.toPath());
            } catch (IOException e) {
                System.out.println("Não consegui ler " + f + ": " + e.getMessage());
                return null;
            }
        }

        public synchronized void write(int cx, int cz, byte[] data) {
            try {
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("não consegui criar " + dir);
                File tmp = new File(dir, cx + "_" + cz + ".tmp");
                java.nio.file.Files.write(tmp.toPath(), data);
                replace(tmp, file(cx, cz));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        public List<int[]> list() {
            List<int[]> out = new ArrayList<>();
            String[] names = dir.list();
            if (names == null) return out;
            for (String n : names) {
                if (!n.endsWith(".dat")) continue;
                String[] p = n.substring(0, n.length() - 4).split("_");
                try {
                    if (p.length == 2) out.add(new int[] { Integer.parseInt(p[0]), Integer.parseInt(p[1]) });
                } catch (NumberFormatException ignored) {
                }
            }
            return out;
        }
    }

    static World.Store chunkStore(Info i) {
        return new DiskStore(i);
    }

    // ------------------------------------------------------------------ mundos antigos (512 x 512 de tamanho fixo)

    private static final int OLD_SX = 512, OLD_SZ = 512, OLD_SY = 64;

    /**
     * Mundos das versões antigas eram um bloco só de 512 x 512 (arquivo blocos.dat.gz). Aqui eles viram
     * pedaços: o mundo continua igualzinho, e fora daquele quadrado o gerador continua o terreno.
     * Retorna se havia algo para converter.
     */
    static boolean migrateLegacy(Info i) throws IOException {
        File f = new File(i.dir(), "blocos.dat.gz");
        if (!f.exists()) return false;
        byte[] data = new byte[OLD_SX * OLD_SZ * OLD_SY];
        try (InputStream in = new GZIPInputStream(new BufferedInputStream(new FileInputStream(f)), 1 << 16)) {
            int off = 0;
            while (off < data.length) {
                int n = in.read(data, off, data.length - off);
                if (n < 0) break;
                off += n;
            }
        }
        // direções dos blocos: cada int é a posição antiga com a direção nos bits 24 e 25
        java.util.Map<Integer, java.util.Map<Integer, Byte>> rots = new java.util.HashMap<>();
        File rf = new File(i.dir(), "direcoes.dat.gz");
        if (rf.exists()) {
            try (DataInputStream in = new DataInputStream(new GZIPInputStream(new BufferedInputStream(new FileInputStream(rf))))) {
                int n = in.readInt();
                for (int k = 0; k < n && k < OLD_SX * OLD_SZ * OLD_SY; k++) {
                    int v = in.readInt();
                    int idx = v & 0xFFFFFF, rot = (v >>> 24) & 3;
                    if (rot == 0) continue;
                    int x = idx >> 15, z = (idx >> 6) & 511, y = idx & 63;
                    int ck = (x >> 4) * 64 + (z >> 4);
                    rots.computeIfAbsent(ck, q -> new java.util.HashMap<>()).put(Chunk.idx(x & 15, y, z & 15), (byte) rot);
                }
            } catch (IOException e) {
                System.out.println("Direções antigas ilegíveis: " + e.getMessage());
            }
        }
        DiskStore store = new DiskStore(i);
        for (int cx = 0; cx < OLD_SX / 16; cx++)
            for (int cz = 0; cz < OLD_SZ / 16; cz++) {
                Chunk c = new Chunk(cx, cz);
                for (int lx = 0; lx < 16; lx++)
                    for (int lz = 0; lz < 16; lz++) {
                        int from = ((cx * 16 + lx) << 15) | ((cz * 16 + lz) << 6);
                        System.arraycopy(data, from, c.blocks, Chunk.idx(lx, 0, lz), OLD_SY);
                    }
                java.util.Map<Integer, Byte> r = rots.get(cx * 64 + cz);
                if (r != null) c.rot = new java.util.concurrent.ConcurrentHashMap<>(r);
                store.write(cx, cz, c.toBytes());
            }
        replace(f, new File(i.dir(), "blocos.dat.gz.antigo"));
        if (rf.exists()) replace(rf, new File(i.dir(), "direcoes.dat.gz.antigo"));
        return true;
    }
    static void delete(Info i) {
        deleteRec(i.dir());
    }

    private static void deleteRec(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRec(k);
        if (!f.delete()) System.out.println("Não consegui apagar " + f);
    }

    /** Troca o arquivo de uma vez, para um save interrompido nunca corromper o anterior. */
    private static void replace(File tmp, File target) throws IOException {
        java.nio.file.Files.move(tmp.toPath(), target.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }

    private Saves() {}
}
