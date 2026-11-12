/** Inventário de 36 espaços (0-8 = barra rápida). Guarda id, quantidade e desgaste (ferramentas). */
final class Inventory {
    static final int SIZE = 36, HOTBAR = 9, MAX = 64;

    final int[] id = new int[SIZE];
    final int[] count = new int[SIZE];
    final int[] wear = new int[SIZE]; // usos gastos da ferramenta

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
        int max = Items.maxStack(item);
        if (max > 1)
            for (int i = 0; i < SIZE && n > 0; i++)
                if (id[i] == item && count[i] > 0 && count[i] < max) {
                    int k = Math.min(n, max - count[i]);
                    count[i] += k;
                    n -= k;
                }
        for (int i = 0; i < SIZE && n > 0; i++)
            if (empty(i)) {
                int k = Math.min(n, max);
                set(i, item, k);
                n -= k;
            }
        return n;
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
        if (empty(slot) || !Items.isTool(id[slot])) return false;
        wear[slot]++;
        if (wear[slot] >= Items.durability(id[slot])) {
            set(slot, 0, 0);
            return true;
        }
        return false;
    }

    boolean canCraft(Items.Recipe r) {
        for (int i = 0; i < r.in.length; i += 2) if (countOf(r.in[i]) < r.in[i + 1]) return false;
        return true;
    }

    boolean craft(Items.Recipe r) {
        if (!canCraft(r)) return false;
        for (int i = 0; i < r.in.length; i += 2) remove(r.in[i], r.in[i + 1]);
        int left = add(r.out, r.outCount);
        if (left > 0) { // sem espaço: devolve os ingredientes
            remove(r.out, r.outCount - left);
            for (int i = 0; i < r.in.length; i += 2) add(r.in[i], r.in[i + 1]);
            return false;
        }
        return true;
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
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < SIZE; i++) {
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
        for (int i = 0; i < parts.length && i < SIZE; i++) {
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
