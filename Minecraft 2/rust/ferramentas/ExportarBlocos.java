import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.lang.reflect.Field;

/**
 * Exporta a tabela de blocos do jogo Java para a versão Rust (rust/dados/blocos.txt).
 * Assim os dois jogos usam exatamente os mesmos ids, formas, texturas e caixas: quando um bloco novo entrar
 * no Java, é só rodar rust/exportar-blocos.bat de novo.
 *
 * Uma linha por bloco: id|forma|textura|luz|giravel|arquivo|nome|caixas
 *   forma: 0 cubo, 1 recortado (folhas, vidro), 2 cruzado (plantas, tochas), 3 líquido, 4 modelo (escadas, lajes...)
 *   textura: id do bloco cujas texturas este usa (variantes usam as do material)
 *   arquivo: nome do PNG na pasta textures (vazio = usa o do bloco da textura)
 *   caixas: x0,y0,z0,x1,y1,z1[,bloco da textura];... de 0 a 1 (só nos modelos)
 */
public class ExportarBlocos {
    public static void main(String[] a) throws Exception {
        Field ff = Textures.class.getDeclaredField("FILE");
        ff.setAccessible(true);
        String[] files = (String[]) ff.get(null);
        File out = new File(a.length > 0 ? a[0] : "rust/dados/blocos.txt");
        out.getParentFile().mkdirs();
        try (Writer w = new OutputStreamWriter(new FileOutputStream(out), "UTF-8")) {
            w.write("# gerado por rust/ferramentas/ExportarBlocos.java a partir do Block.java (não edite à mão)\n");
            w.write("# id|forma|textura|luz|giravel|arquivo|nome|caixas\n");
            for (int b = 0; b < Block.COUNT; b++) {
                StringBuilder sb = new StringBuilder();
                sb.append(b).append('|').append(Block.shape(b)).append('|').append(Block.texture(b)).append('|')
                        .append(Block.light(b)).append('|').append(Block.rotatable(b) ? 1 : 0).append('|')
                        .append(files[b] == null ? "" : files[b]).append('|')
                        .append(Block.NAMES[b] == null ? "" : Block.NAMES[b].replace('|', '/')).append('|');
                float[][] boxes = Block.boxes(b);
                if (boxes != null && Block.shape(b) == Block.MODEL)
                    for (int i = 0; i < boxes.length; i++) {
                        if (i > 0) sb.append(';');
                        for (int k = 0; k < boxes[i].length; k++) {
                            if (k > 0) sb.append(',');
                            float v = boxes[i][k];
                            sb.append(v == (int) v ? String.valueOf((int) v) : String.valueOf(v));
                        }
                    }
                w.write(sb.append('\n').toString());
            }
        }
        System.out.println("blocos exportados: " + Block.COUNT + " -> " + out);
    }
}
