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
 * Uma linha por bloco: id|forma|textura|luz|giravel|arquivo|nome|caixas|tipo|material|direcao|marca|metade|apoio|item|solta|dureza
 *   tipo: 0 comum, 1 escada, 2 laje, 3 laje vertical, 4 porta, 5 lajes empilhadas, 6 cerca/painel, 7 tocha na parede
 *   material: das escadas/lajes (índice em SHAPE_MATS) ou madeira da porta; marca: escada invertida, laje em cima, porta aberta
 *   apoio: precisa de chão firme (plantas, tochas); item: é a forma de item (aparece no criativo); solta: o que dá ao quebrar
 * E uma linha "@item|id|bloco" para cada item que coloca um bloco de id 200+ (o gelo do campo de gelo).
 *   forma: 0 cubo, 1 recortado (folhas, vidro), 2 cruzado (plantas, tochas), 3 líquido, 4 modelo (escadas, lajes...)
 *   textura: id do bloco cujas texturas este usa (variantes usam as do material)
 *   arquivo: nome do PNG na pasta textures (vazio = usa o do bloco da textura)
 *   caixas: x0,y0,z0,x1,y1,z1[,bloco da textura];... de 0 a 1 (só nos modelos)
 */
public class ExportarBlocos {
    static final String NL = "\n";
    /** Tabela interna do Block.java (tipo de cada peça: material, direção, marca, metade). */
    static int[] arr(String name) throws Exception {
        Field f = Block.class.getDeclaredField(name);
        f.setAccessible(true);
        return (int[]) f.get(null);
    }

    public static void main(String[] a) throws Exception {
        Field ff = Textures.class.getDeclaredField("FILE");
        ff.setAccessible(true);
        String[] files = (String[]) ff.get(null);
        int[] SMAT = arr("SMAT"), SFACE = arr("SFACE"), SFLAG = arr("SFLAG"), SHALF = arr("SHALF");
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
                int kind = Block.isStair(b) ? 1 : Block.isSlab(b) ? 2 : Block.isVSlab(b) ? 3 : Block.isDoor(b) ? 4 : Block.isMixedSlab(b) ? 5
                        : Block.isFence(b) || b == Block.GLASS_PANE ? 6 : Block.isWallTorch(b) ? 7 : 0;
                int mat = kind >= 1 && kind <= 4 ? SMAT[b] : 0;
                int face = kind == 7 ? Block.wallTorchFacing(b) : kind == 1 || kind == 3 || kind == 4 ? SFACE[b] : 0;
                int flag = kind == 1 || kind == 2 || kind == 4 ? SFLAG[b] : 0;
                int half = kind == 4 ? SHALF[b] : 0;
                sb.append('|').append(kind).append('|').append(mat).append('|').append(face).append('|').append(flag).append('|').append(half)
                        .append('|').append(Block.needsSupport(b) ? 1 : 0).append('|').append(Block.isItemForm(b) ? 1 : 0)
                        .append('|').append(Block.drop(b)).append('|').append(Block.hardness(b))
                        .append('|').append(Block.material(b)).append('|').append(Block.requiredTier(b));
                w.write(sb.append('\n').toString());
            }
            for (int i = Items.BLOCK_ITEM_BASE; i <= Items.LAST; i++)
                if (Items.isPlacer(i)) w.write("@item|" + i + "|" + Items.blockOf(i) + "\n");
        }
        System.out.println("blocos exportados: " + Block.COUNT + " -> " + out);
        exportItems(new File(out.getParentFile(), "itens.txt"), new File(out.getParentFile(), "itens.png"));
        exportRecipes(new File(out.getParentFile(), "receitas.txt"));
        exportFurnace(new File(out.getParentFile(), "fornalha.txt"));
    }

    /** Fornalha: id|no que vira ao assar (0 = não assa)|quantos itens assa como combustível (0 = não queima). */
    static void exportFurnace(File txt) throws Exception {
        int n = 0;
        try (Writer w = new OutputStreamWriter(new FileOutputStream(txt), "UTF-8")) {
            w.write("# gerado por rust/ferramentas/ExportarBlocos.java a partir do Items.java (não edite à mão)" + NL);
            w.write("# id|resultado|combustível" + NL);
            for (int id = 1; id <= Items.LAST; id++) {
                int s = Items.smelt(id), f = Items.fuel(id);
                if (s != 0 || f != 0) { w.write(id + "|" + s + "|" + f + NL); n++; }
            }
        }
        System.out.println("fornalha exportada: " + n + " itens -> " + txt);
    }

    /**
     * Itens que não são blocos (materiais, comida, ferramentas, armaduras, ovos), com o desenho 16x16 de cada um:
     * itens.txt: id|nome|pilha|durabilidade|ferramenta|material|velocidade|comida|peça de armadura|defesa|ícone
     *   ferramenta: -1 ou 0 picareta, 1 machado, 2 pá, 3 espada, 4 enxada; peça: -1 ou 0 capacete .. 3 botas
     *   ícone: posição no itens.png (32 por linha, 16x16 cada)
     */
    static void exportItems(File txt, File png) throws Exception {
        Field sp = Items.class.getDeclaredField("SPEED");
        sp.setAccessible(true);
        double[] speed = (double[]) sp.get(null);
        java.util.List<Integer> ids = new java.util.ArrayList<>();
        for (int i = Items.FIRST_ITEM; i <= Items.LAST; i++) if (Items.exists(i) && !Items.isBlock(i) && !Items.isPlacer(i)) ids.add(i);
        int cols = 32, rows = (ids.size() + cols - 1) / cols;
        java.awt.image.BufferedImage img = new java.awt.image.BufferedImage(cols * 16, Math.max(1, rows) * 16, java.awt.image.BufferedImage.TYPE_INT_ARGB);
        try (Writer w = new OutputStreamWriter(new FileOutputStream(txt), "UTF-8")) {
            w.write("# gerado por rust/ferramentas/ExportarBlocos.java a partir do Items.java (não edite à mão)" + NL);
            w.write("# id|nome|pilha|durabilidade|ferramenta|material|velocidade|comida|peça de armadura|defesa|ícone" + NL);
            for (int k = 0; k < ids.size(); k++) {
                int id = ids.get(k);
                boolean tool = Items.isTool(id), armor = Items.isArmor(id);
                w.write(id + "|" + Items.name(id).replace('|', '/') + "|" + Items.maxStack(id) + "|" + Items.durability(id) + "|"
                        + (tool ? Items.toolKind(id) : -1) + "|" + (tool ? Items.toolMat(id) : -1) + "|" + (tool ? speed[Items.toolMat(id)] : 1) + "|"
                        + Items.food(id) + "|" + (armor ? Items.armorPiece(id) : -1) + "|" + Items.armorPoints(id) + "|" + k + NL);
                int[] px = Items.pixels16(id);
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++) img.setRGB((k % cols) * 16 + x, (k / cols) * 16 + y, px[y * 16 + x]);
            }
        }
        javax.imageio.ImageIO.write(img, "png", png);
        System.out.println("itens exportados: " + ids.size() + " -> " + txt + " e " + png);
    }

    /** Receitas: saída|quantidade|largura|altura|sem forma (1/0)|peça de madeira (1/0)|itens (linha por linha, 0 = vazio). */
    static void exportRecipes(File txt) throws Exception {
        try (Writer w = new OutputStreamWriter(new FileOutputStream(txt), "UTF-8")) {
            w.write("# gerado por rust/ferramentas/ExportarBlocos.java a partir do Items.java (não edite à mão)" + NL);
            w.write("# saída|quantidade|largura|altura|sem forma|peça de madeira|itens" + NL);
            for (Items.Recipe r : Items.RECIPES) {
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < r.cells.length; i++) sb.append(i > 0 ? "," : "").append(r.cells[i]);
                w.write(r.out + "|" + r.outCount + "|" + r.w + "|" + r.h + "|" + (r.shapeless ? 1 : 0) + "|" + (r.woodPiece() ? 1 : 0) + "|" + sb + NL);
            }
        }
        System.out.println("receitas exportadas: " + Items.RECIPES.length + " -> " + txt);
    }
}
