import java.io.*;
import java.net.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Rede para jogar em LAN (funciona também pelo Radmin VPN, que simula uma LAN).
 * TCP simples: cada pacote = tamanho (int) + tipo (byte) + dados. Uma thread por conexão lê os
 * pacotes e os coloca numa fila; o jogo trata a fila na thread principal, a cada quadro.
 */
final class Net {
    static final int PORT = 25600;
    static final int VERSION = 20; // 20: campo de gelo em rampa e itens do gelo; 19: campo de gelo com trincheiras (gelo compacto, gelo azul, pingentes); 18: tubarão maior, sangue e mordida mais espaçada; 17: tubarão come peixes e briga com narval; iglus mais raros; 16: atualização do gelo (urso-polar, pinguim, boi-almiscarado, narval, iglu); 15: escadas, lajes, porta e cerca de bétula; 14: tábuas de bétula; 13: fornalhas guardadas pelo anfitrião; 12: fornalha acesa; 11: tigres, gato e escorpiões; 10: ovos de criatura; 9: bichos selvagens e lobo domesticável (8: dia de 48 min e fotos; 7: mundo infinito)

    // tipos de pacote
    static final byte HELLO = 1, WELCOME = 2, JOIN = 3, LEAVE = 4, STATE = 5, BLOCK = 6, TIME = 7,
            MOBS = 8, HIT_MOB = 9, DAMAGE = 10, GIVE = 11, SAVE_STATE = 12, BYE = 13, CHAT = 14, EXPLODE = 15,
            CHEST_OPEN = 16, CHEST_DATA = 17, CHEST_SET = 18, DROP_NEW = 19,
            SHOOT = 20, ARROW = 21, ARROW_STUCK = 22, ARROW_GONE = 23,
            DROP_REQ = 24, DROP_GONE = 25, DROP_SET = 26, DROP_SYNC = 27, DROP_OFFER = 28, DROP_TAKEN = 29,
            CHAT_IMAGE = 30, MOB_USE = 31, TOAST = 32, MOB_SPAWN = 33,
            FURNACE_OPEN = 34, FURNACE_DATA = 35, FURNACE_SET = 36, BLOOD = 37, CLOSED = 99;

    /** Pacote recebido. */
    static final class Packet {
        final byte type;
        final byte[] data;
        final Connection from;

        Packet(byte type, byte[] data, Connection from) { this.type = type; this.data = data; this.from = from; }

        DataInputStream in() { return new DataInputStream(new ByteArrayInputStream(data)); }
    }

    /** Pacote sendo montado para enviar. */
    static final class Out {
        final byte type;
        final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        final DataOutputStream d = new DataOutputStream(bytes);

        Out(byte type) { this.type = type; }

        Out i(int v) { try { d.writeInt(v); } catch (IOException e) { throw new UncheckedIOException(e); } return this; }
        Out f(double v) { try { d.writeFloat((float) v); } catch (IOException e) { throw new UncheckedIOException(e); } return this; }
        Out dbl(double v) { try { d.writeDouble(v); } catch (IOException e) { throw new UncheckedIOException(e); } return this; }
        Out b(boolean v) { try { d.writeBoolean(v); } catch (IOException e) { throw new UncheckedIOException(e); } return this; }
        Out s(String v) { try { d.writeUTF(v == null ? "" : v); } catch (IOException e) { throw new UncheckedIOException(e); } return this; }
        Out raw(byte[] v) { try { d.writeInt(v.length); d.write(v); } catch (IOException e) { throw new UncheckedIOException(e); } return this; }
    }

    /** Uma conexão (do anfitrião com um amigo, ou do amigo com o anfitrião). */
    static final class Connection {
        final Socket socket;
        private final DataInputStream in;
        private final DataOutputStream out;
        private final ConcurrentLinkedQueue<Packet> inbox;
        volatile boolean closed;
        Object tag; // quem é (usado pelo anfitrião)

        Connection(Socket s, ConcurrentLinkedQueue<Packet> inbox) throws IOException {
            socket = s;
            s.setTcpNoDelay(true);
            in = new DataInputStream(new BufferedInputStream(s.getInputStream(), 1 << 16));
            out = new DataOutputStream(new BufferedOutputStream(s.getOutputStream(), 1 << 16));
            this.inbox = inbox;
        }

        /** Começa a ler pacotes em segundo plano (depois do aperto de mão inicial). */
        void startReading() {
            Thread t = new Thread(() -> {
                try {
                    while (!closed) inbox.add(readPacket());
                } catch (IOException e) {
                    // conexão caiu
                }
                closed = true;
                inbox.add(new Packet(CLOSED, new byte[0], this));
            }, "rede-leitura");
            t.setDaemon(true);
            t.start();
        }

        Packet readPacket() throws IOException {
            int len = in.readInt();
            if (len < 0 || len > 64 << 20) throw new IOException("pacote inválido");
            byte type = in.readByte();
            byte[] data = new byte[len];
            in.readFully(data);
            return new Packet(type, data, this);
        }

        synchronized void send(Out o) {
            if (closed) return;
            try {
                out.writeInt(o.bytes.size());
                out.writeByte(o.type);
                o.bytes.writeTo(out);
            } catch (IOException e) {
                closed = true;
            }
        }

        synchronized void flush() {
            if (closed) return;
            try { out.flush(); } catch (IOException e) { closed = true; }
        }

        void close() {
            closed = true;
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    /** Servidor do anfitrião: aceita amigos e repassa pacotes. */
    static final class Server {
        final ServerSocket server;
        final List<Connection> clients = new CopyOnWriteArrayList<>();
        final ConcurrentLinkedQueue<Packet> inbox;
        volatile boolean closed;

        Server(int port, ConcurrentLinkedQueue<Packet> inbox) throws IOException {
            this.inbox = inbox;
            server = new ServerSocket();
            server.setReuseAddress(true);
            server.bind(new InetSocketAddress(port));
            Thread t = new Thread(() -> {
                while (!closed) {
                    try {
                        Socket s = server.accept();
                        Connection c = new Connection(s, inbox);
                        clients.add(c);
                        c.startReading();
                    } catch (IOException e) {
                        if (closed) return;
                    }
                }
            }, "rede-servidor");
            t.setDaemon(true);
            t.start();
        }

        void broadcast(Out o, Connection except) {
            for (Connection c : clients) if (c != except && c.tag != null) c.send(o);
        }

        void flushAll() {
            for (Connection c : clients) c.flush();
            clients.removeIf(c -> c.closed && c.tag == null);
        }

        void close() {
            closed = true;
            for (Connection c : clients) { c.flush(); c.close(); }
            try { server.close(); } catch (IOException ignored) { }
        }
    }

    /** Endereços IPv4 desta máquina (o do Radmin começa com 26.). */
    static List<String> localAddresses() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : java.util.Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : java.util.Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address)) continue;
                    String ip = a.getHostAddress();
                    boolean radmin = ip.startsWith("26.") || ni.getDisplayName().toLowerCase().contains("radmin");
                    if (radmin) out.add(0, ip + " (Radmin)");
                    else out.add(ip);
                }
            }
        } catch (SocketException ignored) {
        }
        return out;
    }

    private Net() {}
}
