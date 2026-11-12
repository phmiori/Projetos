/**
 * Inventário de 36 espaços (0-8 = barra rápida) mais 4 de armadura (36 capacete, 37 peitoral, 38 calças, 39 botas).
 * Guarda id, quantidade e desgaste (ferramentas e armaduras). Um baú é um Inventory que usa só os 27 primeiros espaços.
 */
final class Inventory {
    static final int SIZE = 36, HOTBAR = 9, MAX = 64, ARMOR = 4, TOTAL = SIZE + ARMOR, CHEST = 27;

    final int[] id = new int[TOTAL];
    final int[] count = new int[TOTAL];
    final int[] wear = new int[TOTAL]; // usos gastos da ferramenta

    void clear() {
        java.util.Arrays.fill(id, 0);
        java.util.Arrays.fill(count, 0);
        java.util.Arrays.fill(wear, 0);
    }

    boolean empty(int slot) {
        return count[slot] <= 0 || id[slot] == 0;
    }

    void set(int slot, int item, int n) {
        set(slot, item, n, 0);
    }

    void set(int slot, int item, int n, int w) {
        if (n <= 0 || item == 0) { id[slot] = 0; count[slot] = 0; wear[slot] = 0; }
        else { id[slot] = item; count[slot] = n; wear[slot] = w; }
    }

    /** Adiciona n itens (primeiro completa pilhas existentes). Retorna o que não coube. */
    int add(int item, int n) {
        return addRange(item, n, 0, 0, SIZE);
    }

    /** Coloca n itens (com desgaste w) nos espaços [from, to): completa pilhas, depois ocupa vazios. Retorna o que não coube. */
    int addRange(int item, int n, int w, int from, int to) {
        int max = Items.maxStack(item);
        if (max > 1)
            for (int i = from; i < to && n > 0; i++)
                if (id[i] == item && count[i] > 0 && count[i] < max) {
                    int k = Math.min(n, max - count[i]);
                    count[i] += k;
                    n -= k;
                }
        for (int i = from; i < to && n > 0; i++)
            if (empty(i)) {
                int k = Math.min(n, max);
                set(i, item, k, w);
                n -= k;
            }
        return n;
    }

    /** Soma dos pontos de defesa das peças vestidas (0 a 20). */
    int armorPoints() {
        int p = 0;
        for (int i = SIZE; i < TOTAL; i++) if (!empty(i)) p += Items.armorPoints(id[i]);
        return p;
    }

    /** Um golpe gasta um uso de cada peça vestida. Retorna true se alguma quebrou. */
    boolean wearArmor() {
        boolean broke = false;
        for (int i = SIZE; i < TOTAL; i++) broke |= useTool(i);
        return broke;
    }

    /** Guarda uma ferramenta com o desgaste que ela já tinha. Retorna false se não há espaço. */
    boolean addTool(int item, int w) {
        for (int i = 0; i < SIZE; i++)
            if (empty(i)) { set(i, item, 1, w); return true; }
        return false;
    }

    int countOf(int item) {
        int n = 0;
        for (int i = 0; i < SIZE; i++) if (id[i] == item) n += count[i];
        return n;
    }

    void remove(int item, int n) {
        for (int i = SIZE - 1; i >= 0 && n > 0; i--)
            if (id[i] == item && count[i] > 0) {
                int k = Math.min(n, count[i]);
                set(i, item, count[i] - k, wear[i]);
                n -= k;
            }
    }

    /** Gasta um uso da ferramenta no espaço; quebra se acabar. Retorna true se quebrou. */
    boolean useTool(int slot) {
        if (empty(slot) || !Items.isDurable(id[slot])) return false;
        wear[slot]++;
        if (wear[slot] >= Items.durability(id[slot])) {
            set(slot, 0, 0);
            return true;
        }
        return false;
    }

    /** Tem os ingredientes da receita (quantas vezes ela pode ser feita com o que há na mochila)? */
    int timesCraftable(Items.Recipe r) {
        int[] in = r.ingredients();
        int times = Integer.MAX_VALUE;
        for (int i = 0; i < in.length; i += 2) times = Math.min(times, countOf(in[i]) / in[i + 1]);
        return times == Integer.MAX_VALUE ? 0 : times;
    }

    /** Faz a receita direto com os itens da mochila (usado pelos testes automáticos). */
    boolean craft(Items.Recipe r) {
        if (timesCraftable(r) < 1) return false;
        int[] in = r.ingredients();
        for (int i = 0; i < in.length; i += 2) remove(in[i], in[i + 1]);
        int left = add(r.out, r.outCount);
        if (left > 0) { // sem espaço: devolve os ingredientes
            remove(r.out, r.outCount - left);
            for (int i = 0; i < in.length; i += 2) add(in[i], in[i + 1]);
            return false;
        }
        return true;
    }

    /** Quantos itens deste tipo ainda cabem na mochila (0..35). */
    int roomFor(int item) {
        int max = Items.maxStack(item), room = 0;
        for (int i = 0; i < SIZE; i++)
            if (empty(i)) room += max;
            else if (id[i] == item && max > 1) room += max - count[i];
        return room;
    }

    /** Move a pilha entre a barra rápida e a mochila (Shift+clique). */
    void quickMove(int slot) {
        if (empty(slot)) return;
        int item = id[slot], n = count[slot], w = wear[slot], max = Items.maxStack(item);
        int from = slot < HOTBAR ? HOTBAR : 0, to = slot < HOTBAR ? SIZE : HOTBAR;
        if (max > 1)
            for (int i = from; i < to && n > 0; i++)
                if (id[i] == item && count[i] > 0 && count[i] < max) {
                    int k = Math.min(n, max - count[i]);
                    count[i] += k;
                    n -= k;
                }
        for (int i = from; i < to && n > 0; i++)
            if (empty(i)) { set(i, item, n, w); n = 0; }
        set(slot, item, n, w);
    }

    String serialize() {
        return serialize(TOTAL);
    }

    String serialize(int slots) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < slots; i++) {
            if (i > 0) sb.append(',');
            sb.append(id[i]).append(':').append(count[i]).append(':').append(wear[i]);
        }
        return sb.toString();
    }

    /** formatoAntigo: inventário salvo antes das escadas/lajes/portas, quando os itens usavam os ids 64..95. */
    void deserialize(String s, boolean oldFormat) {
        clear();
        if (s == null || s.isEmpty()) return;
        String[] parts = s.split(",");
        for (int i = 0; i < parts.length && i < TOTAL; i++) {
            String[] p = parts[i].split(":");
            try {
                int item = Integer.parseInt(p[0]), n = Integer.parseInt(p[1]);
                if (oldFormat && item >= Items.OLD_FIRST_ITEM && item <= Items.OLD_LAST)
                    item += Items.FIRST_ITEM - Items.OLD_FIRST_ITEM;
                int w = p.length > 2 ? Integer.parseInt(p[2]) : 0;
                if (Items.exists(item)) set(i, item, Math.min(n, Items.maxStack(item)), w);
            } catch (Exception ignored) {
            }
        }
    }
}
