"""
Interface web do analisador de leilões judiciais.

    python app.py      -> abre http://127.0.0.1:8787 no navegador
"""
import os
import threading
import traceback
import webbrowser
from datetime import datetime
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_file

import analisar as A

PORTA = 8787
app = Flask(__name__, static_folder="web", static_url_path="/static")
ESTADO = {"rodando": False, "erro": None, "inicio": None, "fim": None}
_trava = threading.Lock()

CHAVES_CONFIG = {
    "comissao_leiloeiro": float, "custo_documentacao": float, "custo_remocao": float,
    "desagio_revenda": float, "margem_minima": float, "reparo_extra_nao_funciona": float,
    "lance_suspeito_pct_fipe": float,
}


def ler_env():
    path = A.BASE_DIR / ".env"
    dados = {}
    if path.exists():
        for linha in path.read_text(encoding="utf-8").splitlines():
            if "=" in linha and not linha.strip().startswith("#"):
                k, v = linha.split("=", 1)
                dados[k.strip()] = v.strip().strip('"').strip("'")
    return dados


def gravar_env(dados):
    linhas = ["# Gerado pela interface web. Fica só no seu computador.\n"]
    linhas += [f"{k}={v}\n" for k, v in dados.items()]
    (A.BASE_DIR / ".env").write_text("".join(linhas), encoding="utf-8")
    os.environ.update({k: v for k, v in dados.items() if v})


@app.get("/")
def index():
    return send_file(A.BASE_DIR / "web" / "index.html")


@app.get("/api/estado")
def estado():
    env = ler_env()
    dados = A.carregar_resultado()
    return jsonify({
        **ESTADO,
        "progresso": A.PROGRESSO,
        "log": A.LOG[-80:],
        "login_configurado": bool(env.get("BUSCAAII_EMAIL") and env.get("BUSCAAII_SENHA")),
        "email": env.get("BUSCAAII_EMAIL", ""),
        "fipe_token": bool(env.get("FIPE_TOKEN")),
        "gerado_em": dados and dados.get("gerado_em"),
    })


@app.get("/api/resultados")
def resultados():
    dados = A.carregar_resultado()
    if not dados:
        return jsonify({"gerado_em": None, "resultados": [], "config": A.CONFIG})
    return jsonify({**dados, "config": A.CONFIG})


def _rodar(editais, offline):
    try:
        A.LOG.clear()
        A.executar(editais=editais, offline=offline)
        ESTADO["erro"] = None
    except RuntimeError as e:
        ESTADO["erro"] = str(e)
        A.log(f"ERRO: {e}")
    except Exception as e:  # mostra na tela em vez de morrer calado
        ESTADO["erro"] = f"{type(e).__name__}: {e}"
        A.log(traceback.format_exc())
    finally:
        ESTADO.update(rodando=False, fim=datetime.now().isoformat(timespec="seconds"))
        A.PROGRESSO.update(etapa="Concluído" if not ESTADO["erro"] else "Erro", atual=0, total=0)


@app.post("/api/rodar")
def rodar():
    corpo = request.get_json(silent=True) or {}
    with _trava:
        if ESTADO["rodando"]:
            return jsonify({"ok": False, "erro": "Já existe uma análise em andamento."}), 409
        ESTADO.update(rodando=True, erro=None, inicio=datetime.now().isoformat(timespec="seconds"), fim=None)
    t = threading.Thread(target=_rodar, args=(int(corpo.get("editais", 40)), bool(corpo.get("offline"))), daemon=True)
    t.start()
    return jsonify({"ok": True})


@app.get("/api/config")
def ver_config():
    A.carregar_config()
    return jsonify(A.CONFIG)


@app.post("/api/config")
def salvar_config():
    corpo = request.get_json(silent=True) or {}
    novos = {k: CHAVES_CONFIG[k](corpo[k]) for k in CHAVES_CONFIG if k in corpo}
    if isinstance(corpo.get("reparo_por_condicao"), dict):
        novos["reparo_por_condicao"] = {k: float(v) for k, v in corpo["reparo_por_condicao"].items()
                                        if k in A.CONFIG["reparo_por_condicao"]}
    for chave in ("descartar_sem_foto", "descartar_sinistro"):
        if chave in corpo:
            novos[chave] = bool(corpo[chave])
    if isinstance(corpo.get("tipos_produto"), list) and corpo["tipos_produto"]:
        novos["tipos_produto"] = [str(t) for t in corpo["tipos_produto"]]
    A.carregar_config()
    A.salvar_config(novos)
    if ESTADO["rodando"]:
        return jsonify({"ok": True, "recalculado": False})
    A.reavaliar()  # recalcula na hora, sem baixar de novo
    return jsonify({"ok": True, "recalculado": True})


@app.post("/api/login")
def salvar_login():
    corpo = request.get_json(silent=True) or {}
    env = ler_env()
    email = (corpo.get("email") or "").strip()
    senha = corpo.get("senha") or ""
    if email:
        env["BUSCAAII_EMAIL"] = email
    if senha:
        env["BUSCAAII_SENHA"] = senha
    if "fipe_token" in corpo:
        env["FIPE_TOKEN"] = (corpo.get("fipe_token") or "").strip()
    gravar_env(env)

    # testa o login na hora para dar retorno imediato
    try:
        s = requests.Session()
        s.headers["User-Agent"] = A.USER_AGENT
        A.login(s, A.obter_anon_key(s))
        return jsonify({"ok": True, "mensagem": "Login no BuscaAii funcionando."})
    except RuntimeError as e:
        return jsonify({"ok": False, "mensagem": str(e)})
    except requests.RequestException:
        return jsonify({"ok": False, "mensagem": "Sem conexão com o BuscaAii agora; dados salvos mesmo assim."})


@app.get("/api/excel")
def excel():
    dados = A.carregar_resultado()
    caminho = Path(dados["excel"]) if dados and dados.get("excel") else None
    if not caminho or not caminho.exists():
        return "Nenhuma planilha gerada ainda.", 404
    return send_file(caminho, as_attachment=True, download_name=caminho.name)


if __name__ == "__main__":
    A.carregar_env()
    A.carregar_config()
    url = f"http://127.0.0.1:{PORTA}"
    print(f"\n  Radar de Leilões aberto em {url}\n  (feche esta janela para desligar)\n")
    if not os.environ.get("NAO_ABRIR_NAVEGADOR"):
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=PORTA, debug=False, threaded=True)
