import java.io.BufferedOutputStream;
import java.io.DataOutputStream;
import java.io.FileOutputStream;

/**
 * Gera pedaços com o gerador do Java e grava num arquivo, para a versão Rust conferir que gera igualzinho:
 *   java -cp "rust/ferramentas/classes;out;lib/*" CompararGeracao arquivo semente escala raio
 *   rust/target/release/mundo-de-blocos.exe --comparar arquivo
 * Pega pedaços espalhados (um quadrado em volta da origem e alguns bem longe), para cobrir todos os biomas.
 */
public class CompararGeracao {
    public static void main(String[] a) throws Exception {
        int seed = Integer.parseInt(a[1]);
        double scale = Double.parseDouble(a[2]);
        int r = Integer.parseInt(a[3]);
        World w = new World(seed, null, scale);
        java.util.List<int[]> list = new java.util.ArrayList<>();
        for (int cx = -r; cx <= r; cx++)
            for (int cz = -r; cz <= r; cz++) list.add(new int[] { cx, cz });
        java.util.Random rnd = new java.util.Random(seed);
        for (int i = 0; i < 300; i++) list.add(new int[] { rnd.nextInt(4000) - 2000, rnd.nextInt(4000) - 2000 });
        // pedaços com iglu, se houver por perto
        for (int cx = -300; cx <= 300; cx++)
            for (int cz = -300; cz <= 300; cz++)
                if (w.iglooSite(cx, cz) != null && list.size() < 2000) list.add(new int[] { cx, cz });
        try (DataOutputStream out = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(a[0])))) {
            out.writeInt(seed);
            out.writeDouble(scale);
            out.writeInt(list.size());
            for (int[] k : list) {
                out.writeInt(k[0]);
                out.writeInt(k[1]);
                out.write(w.generate(k[0], k[1]).blocks);
            }
        }
        System.out.println(list.size() + " pedaços gerados pelo Java -> " + a[0]);
        System.exit(0);
    }
}
