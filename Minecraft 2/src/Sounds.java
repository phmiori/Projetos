import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.SourceDataLine;

/**
 * Sons do jogo. Cada som é um arquivo WAV da pasta "sounds" (na primeira execução o jogo cria os
 * sons padrão, sintetizados por código, para você trocar pelos seus).
 *
 * Um mixador próprio toca vários sons ao mesmo tempo numa única saída de áudio, com volume pela
 * distância, lado (esquerda/direita) e uma pequena variação de tom para não soar repetitivo.
 */
final class Sounds {
    static final File DIR = new File("sounds");
    private static final int RATE = 44100;

    /** Nome do arquivo -> quando toca (vai para o LEIA-ME). */
    private static final String[][] LIST = {
            { "quebrar_terra", "quebrar/colocar terra, grama, areia, neve" },
            { "quebrar_areia", "quebrar areia, cascalho e neve" },
            { "quebrar_pedra", "quebrar pedra, minérios, tijolos" },
            { "quebrar_madeira", "quebrar troncos, tábuas, bancada" },
            { "quebrar_planta", "quebrar folhas, grama alta, flores, cacto, lã" },
            { "quebrar_vidro", "quebrar vidro e gelo" },
            { "colocar", "colocar um bloco" },
            { "drop", "quebrar um bloco e soltar o item no chão" },
            { "coletar", "pegar um item do chão" },
            { "passo_grama", "andar sobre grama e terra" },
            { "passo_areia", "andar sobre areia, cascalho e neve" },
            { "passo_pedra", "andar sobre pedra" },
            { "passo_madeira", "andar sobre madeira" },
            { "dano", "você leva dano" },
            { "comer", "comer" },
            { "respingo", "cair na água" },
            { "porco", "porco" },
            { "ovelha", "ovelha" },
            { "galinha", "galinha" },
            { "morto_vivo", "morto-vivo" },
            { "aranha", "aranha" },
            { "vaca", "vaca" },
            { "pavio", "creeper prestes a explodir e dinamite acesa" },
            { "explosao", "explosão" },
            { "criatura_dano", "acertar uma criatura" },
            { "esqueleto", "esqueleto" },
            { "passaro", "pássaro cantando" },
            { "lobo", "lobo (latido curto)" },
            { "urso", "urso rosnando" },
            { "raposa", "raposa" },
            { "domar", "lobo domesticado (alegre)" },
            { "rugido", "tigre rugindo" },
            { "miau", "gato miando" },
            { "arco_tensao", "puxar a corda do arco" },
            { "arco_disparo", "soltar a flecha" },
            { "flecha_madeira", "flecha prendendo em madeira, terra ou planta" },
            { "flecha_pedra", "flecha batendo em pedra, vidro ou metal" },
            { "flecha_criatura", "flecha acertando uma criatura ou jogador" },
            { "clique", "clicar num botão do menu" },
    };

    private static final Map<String, float[]> SAMPLES = new HashMap<>();
    private static final List<Voice> VOICES = new ArrayList<>();
    private static final Random RND = new Random();
    private static volatile double master = 0.8;
    private static volatile boolean ready;
    private static String status = "carregando...";

    private static final class Voice {
        final float[] data;
        double pos;
        final double speed;
        final float left, right;
        Voice(float[] data, double speed, float left, float right) {
            this.data = data; this.speed = speed; this.left = left; this.right = right;
        }
    }

    /** Prepara a pasta, carrega os sons e liga o mixador (em segundo plano, para não atrasar o jogo). */
    static void init() {
        Thread t = new Thread(() -> {
            try {
                prepareFolder();
                load();
                startMixer();
            } catch (Throwable e) {
                status = "sem som: " + e.getMessage();
                System.out.println("Sons desligados: " + e);
            }
        }, "sons");
        t.setDaemon(true);
        t.start();
    }

    static void setVolume(double v) { master = Math.max(0, Math.min(1, v)); }

    static String status() { return status; }

    /** Aviso pendente sobre arquivos de som que não deu para ler (lido uma vez só, para mostrar na tela). */
    private static volatile String warning;

    static String takeWarning() {
        String w = warning;
        warning = null;
        return w;
    }

    /** Tenta adivinhar o formato real de um arquivo que não é WAV, pelos primeiros bytes. */
    private static String realFormat(File f) {
        byte[] h = new byte[12];
        try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
            if (in.read(h) < 12) return null;
        } catch (IOException e) {
            return null;
        }
        String s = new String(h, java.nio.charset.StandardCharsets.ISO_8859_1);
        if (s.startsWith("ID3") || ((h[0] & 0xFF) == 0xFF && (h[1] & 0xE0) == 0xE0)) return "MP3";
        if (s.substring(4, 8).equals("ftyp")) return "M4A/MP4";
        if (s.startsWith("OggS")) return "OGG";
        if (s.startsWith("fLaC")) return "FLAC";
        return null;
    }

    /** Relê os WAVs da pasta (depois de trocar algum). */
    static void reload() {
        new Thread(() -> {
            try { prepareFolder(); load(); } catch (Exception e) { status = "erro: " + e.getMessage(); }
        }, "sons").start();
    }

    /** Toca um som "na cabeça" do jogador (sem posição). */
    static void play(String name, double volume) {
        play(name, volume, 0, 0.92 + RND.nextDouble() * 0.16);
    }

    /** Toca um som vindo de um ponto do mundo: mais baixo de longe, e do lado certo. */
    static void playAt(String name, double x, double y, double z, Player p, double volume) {
        if (p == null) { play(name, volume); return; }
        double dx = x - p.x, dy = y - (p.y + Player.EYE), dz = z - p.z;
        double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        double fade = Math.max(0, 1 - dist / 24);
        if (fade <= 0) return;
        double rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw); // direita da câmera
        double pan = dist < 0.5 ? 0 : (dx * rx + dz * rz) / dist;
        play(name, volume * fade * fade, pan * 0.8, 0.9 + RND.nextDouble() * 0.2);
    }

    private static void play(String name, double volume, double pan, double pitch) {
        if (!ready || master <= 0) return;
        float[] data;
        synchronized (SAMPLES) { data = SAMPLES.get(name); }
        if (data == null) return;
        float v = (float) (volume * master);
        float l = (float) (v * Math.sqrt((1 - pan) / 2) * 1.41), r = (float) (v * Math.sqrt((1 + pan) / 2) * 1.41);
        synchronized (VOICES) {
            if (VOICES.size() > 24) VOICES.remove(0);
            VOICES.add(new Voice(data, pitch, l, r));
        }
    }

    // ------------------------------------------------------------------ mixador

    private static void startMixer() throws Exception {
        AudioFormat fmt = new AudioFormat(RATE, 16, 2, true, false);
        SourceDataLine line = AudioSystem.getSourceDataLine(fmt);
        line.open(fmt, 4096 * 2);
        line.start();
        ready = true;
        status = SAMPLES.size() + " sons carregados";
        int frames = 512;
        float[] mixL = new float[frames], mixR = new float[frames];
        byte[] out = new byte[frames * 4];
        while (true) {
            java.util.Arrays.fill(mixL, 0);
            java.util.Arrays.fill(mixR, 0);
            synchronized (VOICES) {
                for (int vi = VOICES.size() - 1; vi >= 0; vi--) {
                    Voice v = VOICES.get(vi);
                    for (int i = 0; i < frames; i++) {
                        int p0 = (int) v.pos;
                        if (p0 + 1 >= v.data.length) { VOICES.remove(vi); break; }
                        double f = v.pos - p0;
                        float s = (float) (v.data[p0] * (1 - f) + v.data[p0 + 1] * f);
                        mixL[i] += s * v.left;
                        mixR[i] += s * v.right;
                        v.pos += v.speed;
                    }
                }
            }
            for (int i = 0; i < frames; i++) {
                int l = clip(mixL[i]), r = clip(mixR[i]);
                out[i * 4] = (byte) l; out[i * 4 + 1] = (byte) (l >> 8);
                out[i * 4 + 2] = (byte) r; out[i * 4 + 3] = (byte) (r >> 8);
            }
            line.write(out, 0, out.length); // bloqueia até haver espaço: dá o ritmo do laço
        }
    }

    private static int clip(float s) {
        // compressão suave para vários sons juntos não estourarem
        double c = Math.tanh(s * 1.1);
        return (int) (c * 32000);
    }

    // ------------------------------------------------------------------ arquivos

    private static void load() throws Exception {
        Map<String, float[]> loaded = new HashMap<>();
        StringBuilder bad = new StringBuilder();
        for (String[] s : LIST) {
            File f = new File(DIR, s[0] + ".wav");
            try {
                loaded.put(s[0], readWav(f));
            } catch (Exception e) {
                System.out.println("Som inválido " + f + ": " + e.getMessage() + " (usando o padrão)");
                loaded.put(s[0], synth(s[0]));
                String real = realFormat(f);
                bad.append(bad.length() > 0 ? ", " : "").append(f.getName()).append(real != null ? " (é " + real + ")" : "");
            }
        }
        if (bad.length() > 0) warning = "Som não lido, usando o padrão: " + bad + ". Precisa ser WAV de verdade.";
        synchronized (SAMPLES) {
            SAMPLES.clear();
            SAMPLES.putAll(loaded);
        }
        if (ready) status = SAMPLES.size() + " sons carregados";
    }

    /** Lê qualquer WAV PCM (mono ou estéreo, 8/16 bits, qualquer taxa) e converte para mono 44,1 kHz. */
    private static float[] readWav(File f) throws Exception {
        try (AudioInputStream in0 = AudioSystem.getAudioInputStream(f)) {
            AudioFormat src = in0.getFormat();
            AudioFormat pcm = new AudioFormat(AudioFormat.Encoding.PCM_SIGNED, src.getSampleRate(), 16,
                    src.getChannels(), src.getChannels() * 2, src.getSampleRate(), false);
            try (AudioInputStream in = AudioSystem.getAudioInputStream(pcm, in0)) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                byte[] b = bos.toByteArray();
                int ch = pcm.getChannels(), frames = b.length / (2 * ch);
                float[] mono = new float[frames];
                for (int i = 0; i < frames; i++) {
                    float s = 0;
                    for (int c = 0; c < ch; c++) {
                        int o = (i * ch + c) * 2;
                        s += (short) ((b[o] & 255) | (b[o + 1] << 8)) / 32768f;
                    }
                    mono[i] = s / ch;
                }
                double ratio = src.getSampleRate() / RATE;
                if (Math.abs(ratio - 1) < 1e-6) return mono;
                int outN = (int) (frames / ratio);
                float[] res = new float[outN];
                for (int i = 0; i < outN; i++) {
                    double p = i * ratio;
                    int p0 = (int) p;
                    double fr = p - p0;
                    float a = mono[Math.min(p0, frames - 1)], c = mono[Math.min(p0 + 1, frames - 1)];
                    res[i] = (float) (a * (1 - fr) + c * fr);
                }
                return res;
            }
        }
    }

    /** Cria a pasta com os sons padrão (só os que faltam) e o LEIA-ME. */
    private static void prepareFolder() throws IOException {
        if (!DIR.exists() && !DIR.mkdirs()) throw new IOException("não consegui criar " + DIR);
        for (String[] s : LIST) {
            File f = new File(DIR, s[0] + ".wav");
            if (!f.exists()) writeWav(synth(s[0]), f);
        }
        try (Writer w = new OutputStreamWriter(new java.io.FileOutputStream(new File(DIR, "LEIA-ME.txt")), "UTF-8")) {
            StringBuilder sb = new StringBuilder();
            sb.append("Sons do Mundo de Blocos\r\n=======================\r\n\r\n");
            sb.append("Troque qualquer arquivo .wav desta pasta pelo seu som (mesmo nome).\r\n");
            sb.append("Formato: WAV PCM, mono ou estéreo, 8 ou 16 bits, qualquer taxa (44100 Hz é o ideal).\r\n");
            sb.append("Sons curtos funcionam melhor (menos de 1 segundo; vozes de criaturas até ~2 s).\r\n");
            sb.append("Depois de trocar, use Configurações > Recarregar sons. Apague um arquivo para voltar ao padrão.\r\n\r\n");
            for (String[] s : LIST) sb.append(String.format("%-18s %s\r\n", s[0] + ".wav", s[1]));
            w.write(sb.toString());
        }
    }

    private static void writeWav(float[] data, File f) throws IOException {
        byte[] b = new byte[data.length * 2];
        for (int i = 0; i < data.length; i++) {
            int s = (int) Math.max(-32767, Math.min(32767, data[i] * 32767));
            b[i * 2] = (byte) s;
            b[i * 2 + 1] = (byte) (s >> 8);
        }
        AudioFormat fmt = new AudioFormat(RATE, 16, 1, true, false);
        try (AudioInputStream in = new AudioInputStream(new ByteArrayInputStream(b), fmt, data.length)) {
            AudioSystem.write(in, javax.sound.sampled.AudioFileFormat.Type.WAVE, f);
        }
    }

    // ------------------------------------------------------------------ síntese dos sons padrão

    private static float[] synth(String name) {
        Random r = new Random(name.hashCode());
        switch (name) {
            case "quebrar_terra": return noise(r, 0.2, 0.12, 22, 0.8);
            case "quebrar_areia": return noise(r, 0.22, 0.3, 18, 0.6);
            case "quebrar_pedra": return mix(noise(r, 0.16, 0.65, 34, 0.75), clicks(r, 0.16, 5, 0.5));
            case "quebrar_madeira": return mix(noise(r, 0.2, 0.22, 26, 0.5), tone(0.2, 170, 140, 22, 0.6, 0));
            case "quebrar_planta": return noise(r, 0.2, 0.85, 20, 0.45);
            case "quebrar_vidro": return mix(noise(r, 0.08, 0.9, 40, 0.5), mix(tone(0.5, 2300, 2280, 9, 0.25, 0),
                    mix(tone(0.45, 3150, 3120, 11, 0.2, 0), tone(0.4, 4400, 4380, 13, 0.15, 0))));
            case "colocar": return mix(noise(r, 0.1, 0.18, 40, 0.6), tone(0.1, 110, 80, 40, 0.4, 0));
            case "coletar": return mix(tone(0.07, 700, 1050, 35, 0.4, 0), tone(0.1, 1050, 1400, 30, 0.3, 0));
            case "drop": return mix(tone(0.09, 520, 760, 30, 0.45, 0), noise(r, 0.05, 0.4, 60, 0.25));
            case "passo_grama": return noise(r, 0.09, 0.15, 45, 0.35);
            case "passo_areia": return noise(r, 0.12, 0.3, 32, 0.3);
            case "passo_pedra": return noise(r, 0.07, 0.55, 60, 0.35);
            case "passo_madeira": return mix(noise(r, 0.08, 0.25, 50, 0.25), tone(0.08, 140, 120, 50, 0.35, 0));
            case "dano": return lowpass(tone(0.25, 240, 110, 9, 0.6, 2), 0.3);
            case "comer": return mix(burst(r, 0.0), mix(burst(r, 0.13), burst(r, 0.26)));
            case "respingo": return splash(r);
            case "porco": return mix(grunt(0.0, 105), grunt(0.22, 95));
            case "ovelha": return lowpass(vibrato(0.65, 320, 7, 0.05, 0.5, 1), 0.35);
            case "galinha": return mix(chirp(0.0), mix(chirp(0.11), chirp(0.25)));
            case "morto_vivo": return lowpass(mix(vibrato(1.3, 82, 3, 0.04, 0.35, 1), vibrato(1.3, 86, 2.5, 0.05, 0.3, 1)), 0.12);
            case "vaca": return lowpass(vibrato(0.9, 150, 4, 0.06, 0.55, 1), 0.2);
            case "passaro": return mix(shift(tone(0.06, 2600, 3400, 25, 0.22, 2), 0.0),
                    mix(shift(tone(0.05, 3000, 2400, 25, 0.2, 2), 0.09), shift(tone(0.08, 2400, 3600, 20, 0.2, 2), 0.2)));
            case "lobo": return mix(lowpass(tone(0.14, 520, 380, 14, 0.5, 1), 0.3), shift(lowpass(tone(0.12, 480, 360, 16, 0.4, 1), 0.3), 0.2));
            case "urso": return lowpass(mix(vibrato(0.9, 70, 9, 0.18, 0.6, 1), noise(r, 0.9, 0.25, 2.5, 0.25)), 0.1);
            case "raposa": return mix(shift(tone(0.09, 900, 1400, 18, 0.3, 1), 0.0), shift(tone(0.08, 1000, 1500, 20, 0.25, 1), 0.14));
            case "rugido": return lowpass(mix(vibrato(1.2, 90, 5, 0.3, 0.75, 1), noise(r, 1.2, 0.3, 1.5, 0.45)), 0.13);
            case "miau": return mix(tone(0.12, 620, 900, 7, 0.32, 1), shift(tone(0.28, 900, 520, 5, 0.32, 1), 0.1));
            case "domar": return mix(shift(tone(0.1, 660, 660, 12, 0.3, 2), 0.0), mix(shift(tone(0.1, 830, 830, 12, 0.3, 2), 0.1), shift(tone(0.2, 990, 990, 8, 0.3, 2), 0.2)));
            case "pavio": return tremolo(noise(r, 1.2, 0.95, 1.2, 0.3), 30);
            case "explosao": return mix(lowpass(noise(r, 1.4, 0.2, 3.5, 1.0), 0.12), tone(0.6, 70, 30, 5, 0.7, 0));
            case "aranha": return tremolo(noise(r, 0.55, 0.92, 4, 0.35), 18);
            case "criatura_dano": return mix(noise(r, 0.12, 0.3, 30, 0.6), tone(0.12, 160, 90, 25, 0.5, 0));
            case "clique": return tone(0.035, 1500, 1500, 80, 0.3, 0);
            case "esqueleto": return mix(clicks(r, 0.5, 9, 0.5), tremolo(noise(r, 0.5, 0.6, 5, 0.2), 26));
            case "arco_tensao": return tremolo(mix(tone(0.5, 150, 290, 2.5, 0.28, 1), noise(r, 0.5, 0.35, 3, 0.12)), 38);
            case "arco_disparo": return mix(tone(0.2, 430, 170, 16, 0.5, 0), noise(r, 0.09, 0.75, 42, 0.3));
            case "flecha_madeira": return mix(noise(r, 0.1, 0.25, 40, 0.5), tone(0.14, 230, 150, 26, 0.5, 0));
            case "flecha_pedra": return mix(noise(r, 0.07, 0.7, 55, 0.5), clicks(r, 0.08, 3, 0.45));
            case "flecha_criatura": return mix(noise(r, 0.1, 0.2, 34, 0.6), tone(0.1, 130, 80, 30, 0.45, 0));
            default: return new float[RATE / 10];
        }
    }

    /** Ruído filtrado (alpha: 0 grave .. 1 agudo) com decaimento exponencial. */
    private static float[] noise(Random r, double secs, double alpha, double decay, double amp) {
        int n = (int) (secs * RATE);
        float[] s = new float[n];
        double lp = 0, prev = 0;
        for (int i = 0; i < n; i++) {
            double w = r.nextDouble() * 2 - 1;
            lp += (w - lp) * Math.min(1, alpha * alpha + 0.02);
            double hp = alpha > 0.5 ? lp - prev * 0.6 : lp;
            prev = lp;
            double t = i / (double) RATE;
            double env = Math.exp(-t * decay) * Math.min(1, t * 400);
            s[i] = (float) (hp * env * amp * 2.2);
        }
        return s;
    }

    /** Tom com tom deslizando de f0 a f1 (shape 0 seno, 1 serra, 2 quadrada). */
    private static float[] tone(double secs, double f0, double f1, double decay, double amp, int shape) {
        int n = (int) (secs * RATE);
        float[] s = new float[n];
        double ph = 0;
        for (int i = 0; i < n; i++) {
            double t = i / (double) RATE, f = f0 + (f1 - f0) * t / secs;
            ph += f / RATE;
            double x = ph - Math.floor(ph);
            double w = shape == 0 ? Math.sin(x * 2 * Math.PI) : shape == 1 ? x * 2 - 1 : (x < 0.5 ? 1 : -1);
            s[i] = (float) (w * Math.exp(-t * decay) * Math.min(1, t * 300) * amp);
        }
        return s;
    }

    private static float[] vibrato(double secs, double f, double rate, double depth, double amp, int shape) {
        int n = (int) (secs * RATE);
        float[] s = new float[n];
        double ph = 0;
        for (int i = 0; i < n; i++) {
            double t = i / (double) RATE;
            ph += f * (1 + depth * Math.sin(t * rate * 2 * Math.PI)) / RATE;
            double x = ph - Math.floor(ph);
            double w = shape == 0 ? Math.sin(x * 2 * Math.PI) : x * 2 - 1;
            double env = Math.min(1, t * 12) * Math.min(1, (secs - t) * 6);
            s[i] = (float) (w * env * amp);
        }
        return s;
    }

    private static float[] grunt(double start, double f) {
        float[] g = lowpass(vibrato(0.18, f, 30, 0.12, 0.6, 1), 0.2);
        return shift(g, start);
    }

    private static float[] chirp(double start) {
        return shift(tone(0.07, 1100, 750, 30, 0.35, 2), start);
    }

    private static float[] burst(Random r, double start) {
        return shift(noise(r, 0.07, 0.7, 60, 0.6), start);
    }

    private static float[] splash(Random r) {
        int n = (int) (0.6 * RATE);
        float[] s = new float[n];
        double lp = 0;
        for (int i = 0; i < n; i++) {
            double t = i / (double) RATE;
            double a = 0.7 * Math.exp(-t * 5) + 0.03;
            lp += (r.nextDouble() * 2 - 1 - lp) * a;
            s[i] = (float) (lp * Math.exp(-t * 5) * Math.min(1, t * 200) * 1.4);
        }
        return s;
    }

    private static float[] clicks(Random r, double secs, int count, double amp) {
        float[] s = new float[(int) (secs * RATE)];
        for (int c = 0; c < count; c++) {
            int at = r.nextInt(s.length / 2);
            for (int i = 0; i < 120 && at + i < s.length; i++) s[at + i] += (float) ((r.nextDouble() * 2 - 1) * amp * Math.exp(-i / 30.0));
        }
        return s;
    }

    private static float[] tremolo(float[] s, double rate) {
        for (int i = 0; i < s.length; i++) s[i] *= (float) (0.6 + 0.4 * Math.sin(i / (double) RATE * rate * 2 * Math.PI));
        return s;
    }

    private static float[] lowpass(float[] s, double a) {
        double lp = 0;
        for (int i = 0; i < s.length; i++) { lp += (s[i] - lp) * a; s[i] = (float) lp; }
        return s;
    }

    private static float[] shift(float[] s, double start) {
        int off = (int) (start * RATE);
        float[] o = new float[s.length + off];
        System.arraycopy(s, 0, o, off, s.length);
        return o;
    }

    private static float[] mix(float[] a, float[] b) {
        float[] o = new float[Math.max(a.length, b.length)];
        for (int i = 0; i < a.length; i++) o[i] += a[i];
        for (int i = 0; i < b.length; i++) o[i] += b[i];
        return o;
    }

    private Sounds() {}
}
