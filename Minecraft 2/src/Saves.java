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
 *   blocos.dat.gz    — todos os blocos do mundo, compactados
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
        /** Progresso dos amigos que jogaram neste mundo pela LAN: nome -> estado (Remote.stateString). */
        java.util.Map<String, String> lanPlayers = new java.util.HashMap<>();

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
        i.time = Double.parseDouble(p.getProperty("hora", String.valueOf(World.DAY_LENGTH * 0.3)));
        i.day = Integer.parseInt(p.getProperty("dia", "1"));
        i.inventory = p.getProperty("inventario", "");
        i.inventoryFormat = Integer.parseInt(p.getProperty("inventarioFormato", "1"));
        for (String k : p.stringPropertyNames())
            if (k.startsWith("lan.")) i.lanPlayers.put(k.substring(4), p.getProperty(k));
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
        p.setProperty("hora", String.valueOf(i.time));
        p.setProperty("dia", String.valueOf(i.day));
        File tmp = new File(d, "meta.properties.tmp");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(tmp), "UTF-8")) {
            p.store(w, "Mundo de Blocos");
        }
        replace(tmp, new File(d, "meta.properties"));
    }

    static void saveBlocks(Info i, byte[] blocks) throws IOException {
        File d = i.dir();
        if (!d.exists() && !d.mkdirs()) throw new IOException("não consegui criar " + d);
        File tmp = new File(d, "blocos.dat.gz.tmp");
        try (OutputStream out = new GZIPOutputStream(new BufferedOutputStream(new FileOutputStream(tmp)), 1 << 16) {
            { def.setLevel(Deflater.BEST_SPEED); }
        }) {
            out.write(blocks);
        }
        replace(tmp, new File(d, "blocos.dat.gz"));
    }

    static byte[] loadBlocks(Info i) throws IOException {
        File f = new File(i.dir(), "blocos.dat.gz");
        if (!f.exists()) return null;
        byte[] data = new byte[World.SX * World.SZ * World.SY];
        try (InputStream in = new GZIPInputStream(new BufferedInputStream(new FileInputStream(f)), 1 << 16)) {
            int off = 0;
            while (off < data.length) {
                int n = in.read(data, off, data.length - off);
                if (n < 0) break;
                off += n;
            }
        }
        return data;
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
