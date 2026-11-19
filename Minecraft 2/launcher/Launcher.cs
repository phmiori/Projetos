// Launcher do Mundo de Blocos: uma janela com o botão Jogar, sem console.
// Compilado pelo compilador C# que já vem no Windows (veja compilar-launcher.bat). Escrito em C# 5.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Mundo de Blocos")]
[assembly: System.Reflection.AssemblyProduct("Mundo de Blocos")]

namespace MundoDeBlocos
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }

    /** Um botão desenhado à mão (para combinar com o visual de pedra do jogo). */
    class Btn
    {
        public Rectangle Rect;
        public string Text;
        public bool Primary;
        public bool Enabled = true;
        public Action Click;
        public Btn(Rectangle r, string text, bool primary, Action click) { Rect = r; Text = text; Primary = primary; Click = click; }
    }

    class LauncherForm : Form
    {
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, int w, int l);

        readonly string baseDir = Path.GetDirectoryName(typeof(LauncherForm).Assembly.Location); // a pasta do .exe
        readonly Image background;
        readonly List<Btn> buttons = new List<Btn>();
        readonly Btn playBtn, rustBtn;
        Rectangle closeRect, minRect, checkRect;
        Btn hover;
        bool hoverClose, hoverMin, hoverCheck, showMessages, busy;
        string status = "";
        Color statusColor = Color.FromArgb(220, 230, 220);
        readonly Font titleFont = new Font("Segoe UI", 34f, FontStyle.Bold);
        readonly Font subFont = new Font("Segoe UI", 11f);
        readonly Font playFont = new Font("Segoe UI", 20f, FontStyle.Bold);
        readonly Font btnFont = new Font("Segoe UI", 10f, FontStyle.Bold);
        readonly Font smallFont = new Font("Segoe UI", 9f);

        public LauncherForm()
        {
            Text = "Mundo de Blocos";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(960, 540);
            DoubleBuffered = true;
            BackColor = Color.FromArgb(20, 22, 26);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            using (Stream s = typeof(LauncherForm).Assembly.GetManifestResourceStream("fundo.jpg"))
                background = s != null ? Image.FromStream(s) : null;

            playBtn = new Btn(new Rectangle(48, 262, 300, 66), "JOGAR", true, Play);
            buttons.Add(playBtn);
            buttons.Add(new Btn(new Rectangle(48, 342, 145, 40), "Pasta do jogo", false, delegate { OpenFolder(baseDir); }));
            buttons.Add(new Btn(new Rectangle(203, 342, 145, 40), "Texturas", false, delegate { OpenFolder(Path.Combine(baseDir, "textures")); }));
            // a versão nova, em Rust (em transição: por enquanto só dá para voar pelo mundo)
            rustBtn = new Btn(new Rectangle(48, 428, 300, 38), "Versão Rust (prévia)", false, PlayRust);
            if (Directory.Exists(Path.Combine(baseDir, "rust"))) buttons.Add(rustBtn);
            closeRect = new Rectangle(ClientSize.Width - 46, 0, 46, 34);
            minRect = new Rectangle(ClientSize.Width - 92, 0, 46, 34);
            checkRect = new Rectangle(48, 400, 300, 22);

            string mode = IsDist() ? "" : (FindJdk() == null ? "Não encontrei o Java (JDK 21). Instale o JDK para jogar." : "");
            if (mode.Length > 0) SetStatus(mode, true);
            else SetStatus("Pronto para jogar", false);

            MouseMove += OnMove;
            MouseDown += OnDown;
            MouseLeave += delegate { hover = null; hoverClose = hoverMin = hoverCheck = false; Invalidate(); };
            KeyPreview = true;
            KeyDown += delegate (object o, KeyEventArgs e) { if (e.KeyCode == Keys.Enter && !busy) Play(); if (e.KeyCode == Keys.Escape) Close(); };
        }

        // ------------------------------------------------------------ desenho
        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            int W = ClientSize.Width, H = ClientSize.Height;
            if (background != null) g.DrawImage(background, 0, 0, W, H);

            // painel escuro à esquerda, que some aos poucos para a direita
            using (LinearGradientBrush lb = new LinearGradientBrush(new Rectangle(0, 0, 560, H), Color.FromArgb(225, 14, 16, 20), Color.FromArgb(0, 14, 16, 20), 0f))
            {
                ColorBlend cb = new ColorBlend();
                cb.Colors = new Color[] { Color.FromArgb(230, 14, 16, 20), Color.FromArgb(200, 14, 16, 20), Color.FromArgb(0, 14, 16, 20) };
                cb.Positions = new float[] { 0f, 0.55f, 1f };
                lb.InterpolationColors = cb;
                g.FillRectangle(lb, 0, 0, 560, H);
            }
            // faixa escura no topo (onde ficam os botões da janela)
            using (LinearGradientBrush tb = new LinearGradientBrush(new Rectangle(0, 0, W, 60), Color.FromArgb(120, 0, 0, 0), Color.FromArgb(0, 0, 0, 0), 90f))
                g.FillRectangle(tb, 0, 0, W, 60);

            // bloco de grama como logo
            DrawGrassBlock(g, 50, 70, 46);
            Shadowed(g, "Mundo de Blocos", titleFont, Color.White, 106, 62);
            Shadowed(g, "Um mundo infinito para explorar, construir e jogar com amigos", subFont, Color.FromArgb(215, 225, 215), 52, 138);

            foreach (Btn b in buttons) DrawButton(g, b, b == hover);

            // caixinha "mostrar mensagens"
            Rectangle box = new Rectangle(checkRect.X, checkRect.Y + 2, 18, 18);
            using (SolidBrush bb = new SolidBrush(Color.FromArgb(hoverCheck ? 90 : 60, 255, 255, 255))) g.FillRectangle(bb, box);
            using (Pen bp = new Pen(Color.FromArgb(180, 255, 255, 255))) g.DrawRectangle(bp, box);
            if (showMessages)
                using (Pen cp = new Pen(Color.FromArgb(120, 220, 90), 3f))
                    g.DrawLines(cp, new Point[] { new Point(box.X + 4, box.Y + 9), new Point(box.X + 8, box.Y + 13), new Point(box.X + 15, box.Y + 4) });
            Shadowed(g, "Abrir com janela de mensagens (para achar erros)", smallFont, Color.FromArgb(225, 230, 225), box.Right + 8, checkRect.Y + 1);

            // situação
            Shadowed(g, status, subFont, statusColor, 50, H - 64);
            Shadowed(g, IsDist() ? "" : "Pasta do código: o jogo é compilado antes de abrir quando o código muda", smallFont,
                Color.FromArgb(150, 165, 155), 50, H - 38);

            // minimizar e fechar
            if (hoverMin) using (SolidBrush hb = new SolidBrush(Color.FromArgb(60, 255, 255, 255))) g.FillRectangle(hb, minRect);
            if (hoverClose) using (SolidBrush hb = new SolidBrush(Color.FromArgb(200, 196, 43, 28))) g.FillRectangle(hb, closeRect);
            using (Pen wp = new Pen(Color.White, 1.4f))
            {
                int cx = minRect.X + minRect.Width / 2, cy = minRect.Y + minRect.Height / 2;
                g.DrawLine(wp, cx - 6, cy, cx + 6, cy);
                cx = closeRect.X + closeRect.Width / 2;
                g.DrawLine(wp, cx - 6, cy - 6, cx + 6, cy + 6);
                g.DrawLine(wp, cx - 6, cy + 6, cx + 6, cy - 6);
            }
        }

        static void Shadowed(Graphics g, string s, Font f, Color c, int x, int y)
        {
            using (SolidBrush sh = new SolidBrush(Color.FromArgb(170, 0, 0, 0))) g.DrawString(s, f, sh, x + 2, y + 2);
            using (SolidBrush b = new SolidBrush(c)) g.DrawString(s, f, b, x, y);
        }

        /** Um bloco de grama em pixel art (16x16), como no jogo. */
        static void DrawGrassBlock(Graphics g, int x, int y, int size)
        {
            Random r = new Random(7);
            float p = size / 8f;
            for (int py = 0; py < 8; py++)
                for (int px = 0; px < 8; px++)
                {
                    bool grass = py < 2 || (py == 2 && r.Next(3) > 0);
                    int v = r.Next(28);
                    Color c = grass ? Color.FromArgb(70 + v, 150 + v, 50 + v / 2) : Color.FromArgb(120 + v, 82 + v / 2, 52 + v / 3);
                    using (SolidBrush b = new SolidBrush(c)) g.FillRectangle(b, x + px * p, y + py * p, p + 0.5f, p + 0.5f);
                }
            using (Pen o = new Pen(Color.FromArgb(160, 0, 0, 0), 2f)) g.DrawRectangle(o, x, y, size, size);
        }

        void DrawButton(Graphics g, Btn b, bool hot)
        {
            Rectangle r = b.Rect;
            Color top, bottom;
            if (!b.Enabled) { top = Color.FromArgb(90, 96, 92); bottom = Color.FromArgb(70, 74, 72); }
            else if (b.Primary) { top = hot ? Color.FromArgb(110, 200, 80) : Color.FromArgb(88, 176, 62); bottom = hot ? Color.FromArgb(62, 140, 44) : Color.FromArgb(52, 120, 36); }
            else { top = hot ? Color.FromArgb(120, 124, 128) : Color.FromArgb(98, 102, 106); bottom = hot ? Color.FromArgb(84, 86, 90) : Color.FromArgb(70, 72, 76); }
            g.SmoothingMode = SmoothingMode.None;
            using (SolidBrush sh = new SolidBrush(Color.FromArgb(140, 0, 0, 0))) g.FillRectangle(sh, r.X + 3, r.Y + 4, r.Width, r.Height);
            using (LinearGradientBrush lb = new LinearGradientBrush(r, top, bottom, 90f)) g.FillRectangle(lb, r);
            // borda em relevo, como os blocos
            using (SolidBrush hi = new SolidBrush(Color.FromArgb(90, 255, 255, 255))) { g.FillRectangle(hi, r.X, r.Y, r.Width, 3); g.FillRectangle(hi, r.X, r.Y, 3, r.Height); }
            using (SolidBrush lo = new SolidBrush(Color.FromArgb(110, 0, 0, 0))) { g.FillRectangle(lo, r.X, r.Bottom - 4, r.Width, 4); g.FillRectangle(lo, r.Right - 3, r.Y, 3, r.Height); }
            using (Pen o = new Pen(Color.FromArgb(200, 10, 10, 10), 2f)) g.DrawRectangle(o, r);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Font f = b.Primary ? playFont : btnFont;
            string t = b.Primary && busy ? "ABRINDO..." : b.Text;
            SizeF sz = g.MeasureString(t, f);
            float tx = r.X + (r.Width - sz.Width) / 2, ty = r.Y + (r.Height - sz.Height) / 2 - 1;
            using (SolidBrush sh = new SolidBrush(Color.FromArgb(150, 0, 0, 0))) g.DrawString(t, f, sh, tx + 2, ty + 2);
            using (SolidBrush w = new SolidBrush(b.Enabled ? Color.White : Color.FromArgb(200, 200, 200))) g.DrawString(t, f, w, tx, ty);
        }

        // ------------------------------------------------------------ mouse
        void OnMove(object o, MouseEventArgs e)
        {
            Btn h = null;
            foreach (Btn b in buttons) if (b.Enabled && b.Rect.Contains(e.Location)) h = b;
            bool hc = closeRect.Contains(e.Location), hm = minRect.Contains(e.Location), hk = checkRect.Contains(e.Location);
            if (h != hover || hc != hoverClose || hm != hoverMin || hk != hoverCheck)
            {
                hover = h; hoverClose = hc; hoverMin = hm; hoverCheck = hk;
                Cursor = h != null || hk ? Cursors.Hand : Cursors.Default;
                Invalidate();
            }
        }

        void OnDown(object o, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            if (closeRect.Contains(e.Location)) { Close(); return; }
            if (minRect.Contains(e.Location)) { WindowState = FormWindowState.Minimized; return; }
            if (checkRect.Contains(e.Location)) { showMessages = !showMessages; Invalidate(); return; }
            foreach (Btn b in buttons) if (b.Enabled && b.Rect.Contains(e.Location)) { b.Click(); return; }
            // arrastar a janela por qualquer lugar vazio
            ReleaseCapture();
            SendMessage(Handle, 0xA1, 2, 0);
        }

        void SetStatus(string s, bool error)
        {
            status = s;
            statusColor = error ? Color.FromArgb(255, 150, 130) : Color.FromArgb(220, 230, 220);
            Invalidate();
        }

        void OpenFolder(string dir)
        {
            try { Directory.CreateDirectory(dir); Process.Start("explorer.exe", "\"" + dir + "\""); }
            catch (Exception ex) { SetStatus("Não consegui abrir a pasta: " + ex.Message, true); }
        }

        // ------------------------------------------------------------ jogar
        /** Jogo empacotado (com o Java embutido) ou a pasta do código? */
        bool IsDist()
        {
            return File.Exists(Path.Combine(baseDir, "jogo.jar")) && File.Exists(Path.Combine(baseDir, @"runtime\bin\javaw.exe"));
        }

        /** Procura um JDK nas pastas conhecidas (as mesmas do run.bat). Retorna a pasta bin ou null. */
        static string FindJdk()
        {
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string la = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[][] places = {
                new string[] { Path.Combine(pf, "Microsoft"), "jdk-*" },
                new string[] { Path.Combine(la, @"Programs\jdk21"), "jdk-*" },
                new string[] { Path.Combine(pf, "Java"), "jdk-21*" },
                new string[] { Path.Combine(pf, "Java"), "jdk-17*" },
                new string[] { Path.Combine(pf, "Java"), "jdk-*" },
            };
            foreach (string[] p in places)
            {
                if (!Directory.Exists(p[0])) continue;
                string[] dirs = Directory.GetDirectories(p[0], p[1]);
                Array.Sort(dirs);
                for (int i = dirs.Length - 1; i >= 0; i--)
                    if (File.Exists(Path.Combine(dirs[i], @"bin\javac.exe"))) return Path.Combine(dirs[i], "bin");
            }
            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string d in path.Split(';'))
            {
                try { if (d.Length > 0 && File.Exists(Path.Combine(d, "javac.exe"))) return d; } catch { }
            }
            return null;
        }

        void Play()
        {
            if (busy) return;
            busy = true;
            playBtn.Enabled = false;
            rustBtn.Enabled = false;
            Invalidate();
            bool messages = showMessages;
            Thread t = new Thread(delegate () { PlayWork(messages); });
            t.IsBackground = true;
            t.Start();
        }

        void Ui(Action a) { try { BeginInvoke(a); } catch { } }

        void Done(string msg, bool error)
        {
            Ui(delegate { busy = false; playBtn.Enabled = true; rustBtn.Enabled = true; SetStatus(msg, error); });
        }

        void PlayWork(bool messages)
        {
            try
            {
                string bin, cp;
                if (IsDist())
                {
                    bin = Path.Combine(baseDir, @"runtime\bin");
                    cp = "jogo.jar;lib\\*";
                }
                else
                {
                    bin = FindJdk();
                    if (bin == null) { Done("Não encontrei o Java (JDK 21). Instale o JDK para jogar.", true); return; }
                    cp = "out;lib\\*";
                    if (NeedsCompile())
                    {
                        Ui(delegate { SetStatus("Compilando o jogo...", false); });
                        string output;
                        int code = Run(Path.Combine(bin, "javac.exe"),
                            "-encoding UTF-8 --release 8 -Xlint:-options -cp \"lib\\*\" -d out " + SourceList(), bin, out output);
                        if (code != 0)
                        {
                            Done("O código não compilou.", true);
                            Ui(delegate { ShowLog("Erro ao compilar", output); });
                            return;
                        }
                    }
                }
                Ui(delegate { SetStatus("Abrindo o jogo...", false); });
                StartGame(bin, cp, messages);
            }
            catch (Exception ex)
            {
                Done("Não consegui abrir o jogo: " + ex.Message, true);
            }
        }

        /** Compila só se algum .java for mais novo que o jogo compilado. */
        bool NeedsCompile()
        {
            string outDir = Path.Combine(baseDir, "out");
            string main = Path.Combine(outDir, "BlockGame.class");
            if (!File.Exists(main)) return true;
            DateTime built = DateTime.MaxValue;
            foreach (string f in Directory.GetFiles(outDir, "*.class"))
            {
                DateTime t = File.GetLastWriteTimeUtc(f);
                if (t < built) built = t;
            }
            foreach (string f in Directory.GetFiles(Path.Combine(baseDir, "src"), "*.java"))
                if (File.GetLastWriteTimeUtc(f) > built) return true;
            return false;
        }

        string SourceList()
        {
            StringBuilder sb = new StringBuilder();
            foreach (string f in Directory.GetFiles(Path.Combine(baseDir, "src"), "*.java"))
                sb.Append(" \"src\\").Append(Path.GetFileName(f)).Append('"');
            return sb.ToString();
        }

        ProcessStartInfo Psi(string exe, string args, string bin)
        {
            return Psi(exe, args, bin, baseDir);
        }

        ProcessStartInfo Psi(string exe, string args, string bin, string workDir)
        {
            ProcessStartInfo psi = new ProcessStartInfo(exe, args);
            psi.WorkingDirectory = workDir;
            psi.UseShellExecute = false;
            // só o Java escolhido no PATH (o "javapath" e Javas antigos misturam DLLs)
            string sys = Environment.GetEnvironmentVariable("SystemRoot") ?? @"C:\Windows";
            psi.EnvironmentVariables["PATH"] = bin + ";" + Path.Combine(sys, "system32") + ";" + sys;
            return psi;
        }

        int Run(string exe, string args, string bin, out string output)
        {
            return Run(exe, args, bin, baseDir, Encoding.Default, out output);
        }

        int Run(string exe, string args, string bin, string workDir, Encoding enc, out string output)
        {
            ProcessStartInfo psi = Psi(exe, args, bin, workDir);
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = enc;
            psi.StandardErrorEncoding = enc;
            using (Process p = Process.Start(psi))
            {
                StringBuilder sb = new StringBuilder();
                p.OutputDataReceived += delegate (object o, DataReceivedEventArgs e) { if (e.Data != null) lock (sb) sb.AppendLine(e.Data); };
                p.ErrorDataReceived += delegate (object o, DataReceivedEventArgs e) { if (e.Data != null) lock (sb) sb.AppendLine(e.Data); };
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
                p.WaitForExit();
                lock (sb) output = sb.ToString();
                return p.ExitCode;
            }
        }

        void StartGame(string bin, string cp, bool messages)
        {
            string args = "-XX:+UseParallelGC -cp \"" + cp + "\" BlockGame";
            StartProcess(Path.Combine(bin, "javaw.exe"), Path.Combine(bin, "java.exe"), args, bin, messages, "ultimo-jogo.log");
        }

        /** Abre o jogo (exe sem console; consoleExe quando a caixa de mensagens está marcada) e espera ele fechar. */
        void StartProcess(string exe, string consoleExe, string args, string bin, bool messages, string logName)
        {
            if (messages)
            {
                // janela de console com as mensagens do jogo (fica aberta se o jogo fechar com erro)
                ProcessStartInfo psi = Psi(Path.Combine(Environment.GetEnvironmentVariable("SystemRoot") ?? @"C:\Windows", @"system32\cmd.exe"),
                    "/c \"\"" + consoleExe + "\" " + args + " || pause\"", bin);
                psi.CreateNoWindow = false;
                Process.Start(psi);
                Ui(delegate { Close(); });
                return;
            }
            string logDir = Path.Combine(baseDir, "logs");
            Directory.CreateDirectory(logDir);
            string logFile = Path.Combine(logDir, logName);
            ProcessStartInfo gp = Psi(exe, args, bin);
            gp.StandardOutputEncoding = Encoding.UTF8;
            gp.StandardErrorEncoding = Encoding.UTF8;
            gp.CreateNoWindow = true;
            gp.RedirectStandardOutput = true;
            gp.RedirectStandardError = true;
            using (StreamWriter log = new StreamWriter(logFile, false, new UTF8Encoding(false)))
            using (Process p = Process.Start(gp))
            {
                log.AutoFlush = true;
                p.OutputDataReceived += delegate (object o, DataReceivedEventArgs e) { if (e.Data != null) lock (log) log.WriteLine(e.Data); };
                p.ErrorDataReceived += delegate (object o, DataReceivedEventArgs e) { if (e.Data != null) lock (log) log.WriteLine(e.Data); };
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
                // o jogo abriu: o launcher some e espera ele fechar
                if (!p.WaitForExit(2500)) Ui(delegate { Hide(); });
                p.WaitForExit();
                int code = p.ExitCode;
                lock (log) log.Flush();
                if (code == 0) { Ui(delegate { Close(); }); return; }
            }
            string text = "";
            try { using (FileStream fs = new FileStream(logFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) using (StreamReader sr = new StreamReader(fs)) text = sr.ReadToEnd(); } catch { }
            Done("O jogo fechou com um erro.", true);
            Ui(delegate { Show(); Activate(); ShowLog("O jogo fechou com um erro", text); });
        }

        // ------------------------------------------------------------ versão Rust
        string RustDir() { return Path.Combine(baseDir, "rust"); }
        string RustExe() { return Path.Combine(RustDir(), @"target\release\mundo-de-blocos.exe"); }

        /** Pasta do cargo (o compilador do Rust), ou null se o Rust não está instalado. */
        static string FindCargo()
        {
            string c = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), @".cargo\bin");
            if (File.Exists(Path.Combine(c, "cargo.exe"))) return c;
            foreach (string d in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
            {
                try { if (d.Length > 0 && File.Exists(Path.Combine(d, "cargo.exe"))) return d; } catch { }
            }
            return null;
        }

        /** Compila só se algum arquivo do código Rust for mais novo que o executável. */
        bool RustNeedsBuild()
        {
            string exe = RustExe();
            if (!File.Exists(exe)) return true;
            DateTime built = File.GetLastWriteTimeUtc(exe);
            List<string> files = new List<string>(Directory.GetFiles(Path.Combine(RustDir(), "src"), "*.rs", SearchOption.AllDirectories));
            files.Add(Path.Combine(RustDir(), "Cargo.toml"));
            files.Add(Path.Combine(RustDir(), @"dados\blocos.txt"));
            foreach (string f in files)
                if (File.Exists(f) && File.GetLastWriteTimeUtc(f) > built) return true;
            return false;
        }

        void PlayRust()
        {
            if (busy) return;
            busy = true;
            playBtn.Enabled = false;
            rustBtn.Enabled = false;
            Invalidate();
            bool messages = showMessages;
            Thread t = new Thread(delegate () { RustWork(messages); });
            t.IsBackground = true;
            t.Start();
        }

        void RustWork(bool messages)
        {
            try
            {
                string cargo = FindCargo();
                if (RustNeedsBuild())
                {
                    if (cargo == null && !File.Exists(RustExe()))
                    {
                        Done("Para a versão Rust, instale o Rust (https://rustup.rs) e tente de novo.", true);
                        return;
                    }
                    if (cargo != null)
                    {
                        Ui(delegate { SetStatus("Compilando a versão Rust (a primeira vez demora alguns minutos)...", false); });
                        string output;
                        int code = Run(Path.Combine(cargo, "cargo.exe"), "build --release", cargo, RustDir(), Encoding.UTF8, out output);
                        if (code != 0)
                        {
                            Done("A versão Rust não compilou.", true);
                            Ui(delegate { ShowLog("Erro ao compilar a versão Rust", output); });
                            return;
                        }
                    }
                }
                Ui(delegate { SetStatus("Abrindo a versão Rust...", false); });
                StartProcess(RustExe(), RustExe(), "", Path.GetDirectoryName(RustExe()), messages, "ultimo-jogo-rust.log");
            }
            catch (Exception ex)
            {
                Done("Não consegui abrir a versão Rust: " + ex.Message, true);
            }
        }

        void ShowLog(string title, string text)
        {
            Form f = new Form();
            f.Text = title;
            f.Icon = Icon;
            f.StartPosition = FormStartPosition.CenterParent;
            f.ClientSize = new Size(820, 460);
            TextBox tb = new TextBox();
            tb.Multiline = true; tb.ReadOnly = true; tb.ScrollBars = ScrollBars.Both; tb.WordWrap = false;
            tb.Font = new Font("Consolas", 9.5f);
            tb.Text = text.Replace("\r\n", "\n").Replace("\n", "\r\n");
            tb.Dock = DockStyle.Fill;
            Panel bar = new Panel(); bar.Dock = DockStyle.Bottom; bar.Height = 44;
            Button copy = new Button(); copy.Text = "Copiar"; copy.SetBounds(10, 8, 100, 28);
            copy.Click += delegate { try { Clipboard.SetText(tb.Text.Length > 0 ? tb.Text : " "); } catch { } };
            Button ok = new Button(); ok.Text = "Fechar"; ok.SetBounds(120, 8, 100, 28);
            ok.Click += delegate { f.Close(); };
            bar.Controls.Add(copy); bar.Controls.Add(ok);
            f.Controls.Add(tb); f.Controls.Add(bar);
            f.ShowDialog(this);
        }
    }
}
