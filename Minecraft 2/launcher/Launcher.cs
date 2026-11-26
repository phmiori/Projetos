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
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length >= 2 && args[0] == "--foto")
            {
                using (LauncherForm f = new LauncherForm()) f.Snapshot(args[1], args);
                return;
            }
            Application.Run(new LauncherForm());
        }
    }

    /** Uma área clicável da janela, nas coordenadas da arte original (1681 x 936). */
    class Btn
    {
        public RectangleF Ref;
        public string Text;
        public bool Primary;
        public bool Enabled = true;
        public Action Click;
        public Btn(float x0, float y0, float x1, float y1, string text, bool primary, Action click)
        {
            Ref = new RectangleF(x0, y0, x1 - x0, y1 - y0); Text = text; Primary = primary; Click = click;
        }
    }

    class LauncherForm : Form
    {
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, int w, int l);

        // a arte (fundo.jpg) foi desenhada em 1681 x 936; tudo abaixo está nessa escala
        const float ART_W = 1681f, ART_H = 936f;
        readonly string baseDir = Path.GetDirectoryName(typeof(LauncherForm).Assembly.Location); // a pasta do .exe
        readonly Image background;
        readonly List<Btn> buttons = new List<Btn>();
        readonly Btn playBtn, javaBtn, versionBtn, checkBtn, minBtn, closeBtn;
        readonly bool hasJava;
        Btn hover;
        bool showMessages, busy, useJava, menuOpen;
        float spin;
        readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer();
        string status = "";
        int statusKind; // 0 pronto, 1 trabalhando, 2 erro
        float k; // escala da janela em relação à arte

        public LauncherForm()
        {
            Text = "Mundo de Blocos";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            // o maior tamanho que cabe com folga na tela, sem passar do tamanho da arte
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            float fit = Math.Min(1f, Math.Min((wa.Width - 60) / ART_W, (wa.Height - 60) / ART_H));
            fit = Math.Min(fit, 0.72f);
            ClientSize = new Size((int)(ART_W * fit), (int)(ART_H * fit));
            k = ClientSize.Width / ART_W;
            DoubleBuffered = true;
            BackColor = Color.FromArgb(9, 12, 23);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            using (Stream s = typeof(LauncherForm).Assembly.GetManifestResourceStream("fundo.jpg"))
                background = s != null ? Image.FromStream(s) : null;

            hasJava = IsDist() || Directory.Exists(Path.Combine(baseDir, "src"));
            playBtn = new Btn(256, 445, 886, 547, "Jogar", true, delegate { if (useJava) Play(); else PlayRust(); });
            buttons.Add(playBtn);
            buttons.Add(new Btn(256, 575, 580, 651, "Pasta do Jogo", false, delegate { OpenFolder(baseDir); }));
            buttons.Add(new Btn(606, 575, 886, 651, "Texturas", false, delegate { OpenFolder(Path.Combine(baseDir, "textures")); }));
            checkBtn = new Btn(256, 678, 760, 713, "", false, delegate { showMessages = !showMessages; Invalidate(); });
            buttons.Add(checkBtn);
            versionBtn = new Btn(256, 737, 886, 807, "", false, delegate { menuOpen = hasJava && !menuOpen; Invalidate(); });
            buttons.Add(versionBtn);
            javaBtn = new Btn(0, 0, 0, 0, "", false, Play); // só para a lógica de "ocupado"
            // menu lateral
            buttons.Add(new Btn(18, 248, 180, 311, "", false, delegate { menuOpen = false; SetStatus(ReadyText(), false); }));
            buttons.Add(new Btn(18, 322, 180, 380, "", false, delegate { SetStatus("As configurações (visão, som, sombras...) ficam no jogo: Pausa > Configurações.", false); }));
            buttons.Add(new Btn(18, 386, 180, 444, "", false, delegate { OpenFolder(Path.Combine(baseDir, "textures")); }));
            buttons.Add(new Btn(18, 451, 180, 509, "", false, delegate { SetStatus("Mundo de Blocos v1.0.0  ·  feito em Rust (o jogo) e Java (a versão antiga).", false); }));
            minBtn = new Btn(1526, 0, 1603, 56, "", false, delegate { WindowState = FormWindowState.Minimized; });
            closeBtn = new Btn(1603, 0, 1681, 56, "", false, Close);
            buttons.Add(minBtn);
            buttons.Add(closeBtn);

            if (RustExeToRun() == null && FindCargo() == null)
                SetStatus(@"Não encontrei o jogo (rust\bin\mundo-de-blocos.exe). Baixe de novo do GitHub.", true);
            else SetStatus(ReadyText(), false);

            anim.Interval = 30;
            anim.Tick += delegate { spin = (spin + 9f) % 360f; if (busy) Invalidate(); };
            anim.Start();
            MouseMove += OnMove;
            MouseDown += OnDown;
            MouseLeave += delegate { hover = null; Invalidate(); };
            KeyPreview = true;
            KeyDown += delegate (object o, KeyEventArgs e) { if (e.KeyCode == Keys.Enter && !busy) playBtn.Click(); if (e.KeyCode == Keys.Escape) { if (menuOpen) { menuOpen = false; Invalidate(); } else Close(); } };
        }

        string ReadyText()
        {
            return FindCargo() != null && Directory.Exists(Path.Combine(RustDir(), "src")) ? "Pronto para jogar!  (o jogo é compilado antes de abrir quando o código muda)" : "Pronto para jogar!";
        }

        RectangleF R(RectangleF r) { return new RectangleF(r.X * k, r.Y * k, r.Width * k, r.Height * k); }
        RectangleF R(float x0, float y0, float x1, float y1) { return new RectangleF(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k); }

        /** As duas opções do menu de versão (abre para cima, por cima dos botões). */
        RectangleF MenuItem(int i) { return R(256, 737 - 70 * (2 - i) - 8, 886, 737 - 70 * (1 - i) - 8); }

        // ------------------------------------------------------------ desenho
        static GraphicsPath Round(RectangleF r, float rad)
        {
            GraphicsPath p = new GraphicsPath();
            float d = rad * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        static void Fill(Graphics g, RectangleF r, float rad, Color c)
        {
            using (GraphicsPath p = Round(r, rad)) using (SolidBrush b = new SolidBrush(c)) g.FillPath(b, p);
        }

        static void Outline(Graphics g, RectangleF r, float rad, Color c, float w)
        {
            using (GraphicsPath p = Round(r, rad)) using (Pen pen = new Pen(c, w)) g.DrawPath(pen, p);
        }

        static void Centered(Graphics g, string s, Font f, Color c, float cx, float cy)
        {
            SizeF sz = g.MeasureString(s, f);
            using (SolidBrush b = new SolidBrush(c)) g.DrawString(s, f, b, cx - sz.Width / 2, cy - sz.Height / 2);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            int W = ClientSize.Width, H = ClientSize.Height;
            if (background != null) g.DrawImage(background, 0, 0, W, H);

            // menu lateral, botões menores e da janela: a arte já os traz; aqui só o realce do mouse
            if (hover != null && !hover.Primary && hover != versionBtn && hover != checkBtn && hover != closeBtn && hover != minBtn)
                Fill(g, R(hover.Ref), 10 * k, Color.FromArgb(28, 255, 255, 255));
            if (hover == minBtn) g.FillRectangle(new SolidBrush(Color.FromArgb(40, 255, 255, 255)), R(minBtn.Ref));
            if (hover == closeBtn) g.FillRectangle(new SolidBrush(Color.FromArgb(200, 196, 43, 28)), R(closeBtn.Ref));
            if (hover == closeBtn)
                using (Pen wp = new Pen(Color.White, 2f))
                {
                    RectangleF c = R(closeBtn.Ref);
                    float cx = c.X + c.Width / 2, cy = c.Y + c.Height / 2, s = 9 * k;
                    g.DrawLine(wp, cx - s, cy - s, cx + s, cy + s);
                    g.DrawLine(wp, cx - s, cy + s, cx + s, cy - s);
                }

            DrawPlay(g);

            // caixinha "janela de mensagens"
            if (showMessages)
            {
                RectangleF box = R(257, 680, 288, 711);
                Fill(g, box, 6 * k, Color.FromArgb(124, 70, 240));
                using (Pen cp = new Pen(Color.White, 3.2f * k))
                    g.DrawLines(cp, new PointF[] { new PointF(box.X + 7 * k, box.Y + 16 * k), new PointF(box.X + 13 * k, box.Y + 22 * k), new PointF(box.X + 24 * k, box.Y + 9 * k) });
            }
            else if (hover == checkBtn) Outline(g, R(257, 680, 288, 711), 6 * k, Color.FromArgb(150, 180, 150, 255), 2f);

            DrawVersion(g);
            DrawStatus(g);
            if (menuOpen) DrawMenu(g);
        }

        void DrawPlay(Graphics g)
        {
            RectangleF r = R(playBtn.Ref);
            float rad = 12 * k;
            bool hot = hover == playBtn && !busy;
            // brilho roxo em volta
            for (int i = 6; i >= 1; i--)
            {
                RectangleF gr = RectangleF.Inflate(r, i * 2.2f * k, i * 2.2f * k);
                Fill(g, gr, rad + i * 2 * k, Color.FromArgb(hot ? 16 : 11, 150, 80, 255));
            }
            Color top = hot ? Color.FromArgb(138, 82, 250) : Color.FromArgb(120, 62, 236);
            Color bottom = hot ? Color.FromArgb(112, 66, 222) : Color.FromArgb(96, 52, 196);
            using (GraphicsPath p = Round(r, rad))
            using (LinearGradientBrush lb = new LinearGradientBrush(new RectangleF(r.X, r.Y - 1, r.Width, r.Height + 2), top, bottom, 90f))
                g.FillPath(lb, p);
            Outline(g, r, rad, Color.FromArgb(205, 140, 255), 2.4f * k);

            // triângulo de "play"
            float tx = 430 * k, ty = 474 * k, th = 44 * k;
            using (SolidBrush w = new SolidBrush(Color.White))
                g.FillPolygon(w, new PointF[] { new PointF(tx, ty), new PointF(tx + th * 0.86f, ty + th / 2), new PointF(tx, ty + th) });
            using (Font f = new Font("Segoe UI", 30f * k * 96f / GDpi(g), FontStyle.Bold))
            {
                string t = busy ? "Abrindo..." : playBtn.Text;
                SizeF sz = g.MeasureString(t, f);
                using (SolidBrush w = new SolidBrush(Color.White)) g.DrawString(t, f, w, 601 * k - sz.Width / 2, 496 * k - sz.Height / 2);
            }
            if (busy)
            {
                RectangleF c = R(814, 474, 858, 518);
                using (Pen ring = new Pen(Color.FromArgb(70, 255, 255, 255), 3f * k)) g.DrawEllipse(ring, c);
                using (Pen arc = new Pen(Color.FromArgb(235, 255, 255, 255), 3f * k)) g.DrawArc(arc, c, spin, 100);
            }
        }

        static float GDpi(Graphics g) { return g.DpiY > 0 ? g.DpiY : 96f; }

        void DrawVersion(Graphics g)
        {
            RectangleF r = R(versionBtn.Ref);
            bool hot = hover == versionBtn && hasJava;
            if (useJava)
            {
                // a arte já mostra "Versão Java (antiga)"
                if (hot) Fill(g, r, 10 * k, Color.FromArgb(22, 255, 255, 255));
                return;
            }
            Fill(g, RectangleF.Inflate(r, -1, -1), 10 * k, Color.FromArgb(hot ? 28 : 20, hot ? 27 : 19, hot ? 40 : 30));
            Outline(g, r, 10 * k, Color.FromArgb(58, 60, 78), 1.6f * k);
            DrawGrassBlock(g, 442 * k, 752 * k, 38 * k);
            using (Font f = new Font("Segoe UI", 18.5f * k * 96f / GDpi(g)))
            using (SolidBrush w = new SolidBrush(Color.FromArgb(232, 232, 240)))
            {
                string t = "Versão Rust (atual)";
                SizeF sz = g.MeasureString(t, f);
                g.DrawString(t, f, w, 498 * k, 772 * k - sz.Height / 2);
            }
            if (hasJava)
                using (Pen p = new Pen(Color.FromArgb(200, 200, 210), 2.4f * k))
                    g.DrawLines(p, new PointF[] { new PointF(839 * k, 766 * k), new PointF(848 * k, 775 * k), new PointF(857 * k, 766 * k) });
        }

        void DrawMenu(Graphics g)
        {
            RectangleF all = RectangleF.Union(MenuItem(0), MenuItem(1));
            Fill(g, RectangleF.Inflate(all, 4 * k, 4 * k), 12 * k, Color.FromArgb(245, 16, 16, 28));
            Outline(g, RectangleF.Inflate(all, 4 * k, 4 * k), 12 * k, Color.FromArgb(124, 70, 240), 2f * k);
            string[] names = { "Versão Rust (atual)", "Versão Java (antiga)" };
            Point m = PointToClient(Cursor.Position);
            using (Font f = new Font("Segoe UI", 16f * k * 96f / GDpi(g)))
                for (int i = 0; i < 2; i++)
                {
                    RectangleF it = MenuItem(i);
                    bool sel = (i == 1) == useJava;
                    if (it.Contains(m)) Fill(g, it, 8 * k, Color.FromArgb(70, 124, 70, 240));
                    Centered(g, (sel ? "✓  " : "") + names[i], f, sel ? Color.FromArgb(205, 170, 255) : Color.FromArgb(225, 225, 235), it.X + it.Width / 2, it.Y + it.Height / 2);
                }
        }

        void DrawStatus(Graphics g)
        {
            // apaga o texto da arte e escreve a situação atual
            using (Font f = new Font("Segoe UI", 15f * k * 96f / GDpi(g)))
            {
                // cobre só até um pouco depois do texto, sumindo aos poucos (a barra não é de uma cor só)
                float end = Math.Max(330 * k, 76 * k + g.MeasureString(status, f).Width + 20 * k);
                RectangleF solid = new RectangleF(20 * k, 868 * k, end - 20 * k, 60 * k);
                using (SolidBrush bg = new SolidBrush(Color.FromArgb(9, 9, 19))) g.FillRectangle(bg, solid);
                RectangleF fade = new RectangleF(end - 1, solid.Y, 40 * k, solid.Height);
                using (LinearGradientBrush lb = new LinearGradientBrush(new RectangleF(fade.X - 1, fade.Y, fade.Width + 2, fade.Height), Color.FromArgb(255, 9, 9, 19), Color.FromArgb(0, 9, 9, 19), 0f))
                    g.FillRectangle(lb, fade);
            }
            Color dot = statusKind == 2 ? Color.FromArgb(235, 80, 70) : statusKind == 1 ? Color.FromArgb(240, 190, 60) : Color.FromArgb(72, 196, 79);
            using (SolidBrush b = new SolidBrush(dot)) g.FillEllipse(b, R(38, 888, 56, 906));
            using (Font f = new Font("Segoe UI", 15f * k * 96f / GDpi(g)))
            using (SolidBrush b = new SolidBrush(statusKind == 2 ? Color.FromArgb(255, 170, 150) : Color.FromArgb(215, 215, 225)))
            {
                SizeF sz = g.MeasureString(status, f);
                g.DrawString(status, f, b, 76 * k, 897 * k - sz.Height / 2);
            }
        }

        /** Um bloco de grama em pixel art (8x8), como no jogo. */
        static void DrawGrassBlock(Graphics g, float x, float y, float size)
        {
            Random r = new Random(7);
            float p = size / 8f;
            SmoothingMode old = g.SmoothingMode;
            g.SmoothingMode = SmoothingMode.None;
            for (int py = 0; py < 8; py++)
                for (int px = 0; px < 8; px++)
                {
                    bool grass = py < 2 || (py == 2 && r.Next(3) > 0);
                    int v = r.Next(28);
                    Color c = grass ? Color.FromArgb(70 + v, 150 + v, 50 + v / 2) : Color.FromArgb(120 + v, 82 + v / 2, 52 + v / 3);
                    using (SolidBrush b = new SolidBrush(c)) g.FillRectangle(b, x + px * p, y + py * p, p + 0.5f, p + 0.5f);
                }
            g.SmoothingMode = old;
        }

        // ------------------------------------------------------------ mouse
        Btn At(Point pt)
        {
            foreach (Btn b in buttons) if (b.Enabled && R(b.Ref).Contains(pt)) return b;
            return null;
        }

        void OnMove(object o, MouseEventArgs e)
        {
            Btn h = menuOpen ? null : At(e.Location);
            if (menuOpen || h != hover)
            {
                hover = h;
                bool overMenu = menuOpen && (MenuItem(0).Contains(e.Location) || MenuItem(1).Contains(e.Location));
                Cursor = h != null || overMenu ? Cursors.Hand : Cursors.Default;
                Invalidate();
            }
        }

        void OnDown(object o, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            if (menuOpen)
            {
                for (int i = 0; i < 2; i++)
                    if (MenuItem(i).Contains(e.Location)) { useJava = i == 1; SaveChoice(); }
                menuOpen = false;
                Invalidate();
                return;
            }
            Btn b = At(e.Location);
            if (b != null) { if (!(busy && b.Primary)) b.Click(); return; }
            // arrastar a janela por qualquer lugar vazio
            ReleaseCapture();
            SendMessage(Handle, 0xA1, 2, 0);
        }

        /** Lembra a versão escolhida no settings.properties (launcherVersao=java). */
        void SaveChoice()
        {
            try
            {
                string f = Path.Combine(baseDir, "settings.properties");
                List<string> lines = new List<string>(File.Exists(f) ? File.ReadAllLines(f) : new string[0]);
                lines.RemoveAll(delegate (string l) { return l.StartsWith("launcherVersao="); });
                lines.Add("launcherVersao=" + (useJava ? "java" : "rust"));
                File.WriteAllLines(f, lines.ToArray());
            }
            catch { }
        }

        void LoadChoice()
        {
            try
            {
                string f = Path.Combine(baseDir, "settings.properties");
                if (hasJava && File.Exists(f))
                    foreach (string l in File.ReadAllLines(f)) if (l.Trim() == "launcherVersao=java") useJava = true;
            }
            catch { }
        }

        protected override void OnLoad(EventArgs e) { base.OnLoad(e); LoadChoice(); }

        /** Desenha a janela num arquivo e fecha (para testes: --foto arquivo.png [ocupado] [java] [menu]). */
        public void Snapshot(string file, string[] flags)
        {
            LoadChoice();
            foreach (string fl in flags)
            {
                if (fl == "ocupado") { busy = true; spin = 40; SetStatus("Abrindo o jogo...", false); statusKind = 1; }
                if (fl == "java") useJava = true;
                if (fl == "menu") menuOpen = true;
                if (fl == "marcado") showMessages = true;
                if (fl == "mouse") hover = playBtn;
            }
            using (Bitmap bmp = new Bitmap(ClientSize.Width, ClientSize.Height))
            {
                using (Graphics g = Graphics.FromImage(bmp)) OnPaint(new PaintEventArgs(g, ClientRectangle));
                bmp.Save(file, System.Drawing.Imaging.ImageFormat.Png);
            }
        }

        void SetStatus(string s, bool error)
        {
            status = s;
            statusKind = error ? 2 : busy ? 1 : 0;
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
            javaBtn.Enabled = false;
            Invalidate();
            bool messages = showMessages;
            Thread t = new Thread(delegate () { PlayWork(messages); });
            t.IsBackground = true;
            t.Start();
        }

        void Ui(Action a) { try { BeginInvoke(a); } catch { } }

        void Done(string msg, bool error)
        {
            Ui(delegate { busy = false; playBtn.Enabled = true; javaBtn.Enabled = true; SetStatus(msg, error); });
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
        /** O executável pronto que vem pelo GitHub (para quem não tem o Rust instalado). */
        string RustBinExe() { return Path.Combine(RustDir(), @"bin\mundo-de-blocos.exe"); }

        /** Qual abrir: o compilado aqui ou o pronto do GitHub, o mais novo dos dois. Null se não houver nenhum. */
        string RustExeToRun()
        {
            string a = RustExe(), b = RustBinExe();
            bool ha = File.Exists(a), hb = File.Exists(b);
            if (ha && hb) return File.GetLastWriteTimeUtc(a) >= File.GetLastWriteTimeUtc(b) ? a : b;
            return ha ? a : hb ? b : null;
        }

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
            if (Directory.Exists(Path.Combine(RustDir(), "dados"))) files.AddRange(Directory.GetFiles(Path.Combine(RustDir(), "dados")));
            foreach (string f in files)
                if (File.Exists(f) && File.GetLastWriteTimeUtc(f) > built) return true;
            return false;
        }

        void PlayRust()
        {
            if (busy) return;
            busy = true;
            playBtn.Enabled = false;
            javaBtn.Enabled = false;
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
                // quem tem o Rust instalado e a pasta do código compila quando o código muda;
                // os outros usam o executável pronto que vem pelo GitHub (rust\bin)
                string cargo = FindCargo();
                if (cargo != null && Directory.Exists(Path.Combine(RustDir(), "src")) && RustNeedsBuild())
                {
                    Ui(delegate { SetStatus("Compilando o jogo (a primeira vez demora alguns minutos)...", false); });
                    string output;
                    int code = Run(Path.Combine(cargo, "cargo.exe"), "build --release", cargo, RustDir(), Encoding.UTF8, out output);
                    if (code != 0)
                    {
                        Done("O jogo não compilou.", true);
                        Ui(delegate { ShowLog("Erro ao compilar o jogo", output); });
                        return;
                    }
                    // o executável novo também fica em rust\bin (é o que vai pelo GitHub para quem não tem o Rust)
                    try { Directory.CreateDirectory(Path.GetDirectoryName(RustBinExe())); File.Copy(RustExe(), RustBinExe(), true); } catch { }
                }
                string exe = RustExeToRun();
                if (exe == null)
                {
                    Done(@"Não encontrei o jogo (rust\bin\mundo-de-blocos.exe). Baixe de novo do GitHub.", true);
                    return;
                }
                Ui(delegate { SetStatus("Abrindo o jogo...", false); });
                StartProcess(exe, exe, "", Path.GetDirectoryName(exe), messages, "ultimo-jogo-rust.log");
            }
            catch (Exception ex)
            {
                Done("Não consegui abrir o jogo: " + ex.Message, true);
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
