"""
Analisador de leilões JUDICIAIS de veículos do BuscaAii.

Fluxo:
  1. Faz login no BuscaAii (Supabase) com o e-mail/senha do arquivo .env
  2. Baixa todos os lotes de veículos judiciais ainda abertos
  3. Lê a descrição do edital (campo "observacao") e, opcionalmente, o PDF do edital
     no site do leiloeiro, para classificar estado, funcionamento, débitos e alertas
  4. Busca o preço FIPE de cada veículo (API parallelum, com cache local)
  5. Calcula custo total, lucro estimado e margem, e gera um Excel com o ranking

Uso:
  python analisar.py                 # análise completa
  python analisar.py --limite 100    # só os 100 lotes que encerram primeiro
  python analisar.py --editais 30    # também baixa/lê os PDFs dos 30 melhores
  python analisar.py --offline       # reusa os lotes baixados hoje (não faz login)
"""
import argparse
import base64
import io
import json
import logging
import os
import re
import sys
import time
import unicodedata
from datetime import date, datetime
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "cache"
SAIDA_DIR = BASE_DIR / "relatorios"

SITE = "https://www.buscaaii.com.br"
SUPABASE_URL = "https://wiwmqzocaribjhclptpu.supabase.co"
FIPE_API = "https://fipe.parallelum.com.br/api/v2"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36"

# ---------------------------------------------------------------- parâmetros
CONFIG = {
    # CAR, PICKUP_TRUCK, VAN, MOTORCYCLE, TRUCK ...
    "tipos_produto": ["CAR", "PICKUP_TRUCK", "VAN"],
    "comissao_leiloeiro": 0.05,      # 5% sobre o lance
    "custo_documentacao": 1500.0,    # transferência, vistoria, despachante
    "custo_remocao": 800.0,          # guincho / retirada do pátio ou do depositário
    "desagio_revenda": 0.10,         # vende ~10% abaixo da FIPE para girar rápido
    "margem_minima": 0.25,           # lucro / investimento mínimo para "vale a pena"
    # % da FIPE estimado para colocar o carro em ordem, por estado de conservação
    "reparo_por_condicao": {"bom": 0.05, "regular": 0.12, "desconhecido": 0.15, "ruim": 0.25},
    "reparo_extra_nao_funciona": 0.15,
}

# ---------------------------------------------------------------- utilidades


def norm(txt):
    txt = unicodedata.normalize("NFKD", str(txt or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", txt.lower()).strip()


def tokens(txt):
    return [t for t in re.split(r"[^a-z0-9.]+", norm(txt).replace("-", " ").replace("/", " ")) if t]


def brl_to_float(s):
    return float(s.replace("R$", "").replace(".", "").replace(",", ".").strip())


def carregar_env():
    env_path = BASE_DIR / ".env"
    if env_path.exists():
        for linha in env_path.read_text(encoding="utf-8").splitlines():
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------- BuscaAii


def obter_anon_key(sess):
    """A chave pública (anon) do Supabase fica no bundle JS do site."""
    html = sess.get(f"{SITE}/leiloes", timeout=30).text
    chunk = re.search(r"/_next/static/chunks/pages/_app-[a-f0-9]+\.js", html)
    if not chunk:
        raise RuntimeError("Não encontrei o bundle do site para ler a chave pública.")
    js = sess.get(SITE + chunk.group(0), timeout=30).text
    for jwt in re.findall(r"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[\w-]+\.[\w-]+", js):
        payload = jwt.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        dados = json.loads(base64.urlsafe_b64decode(payload))
        if dados.get("role") == "anon" and dados.get("ref") in SUPABASE_URL:
            return jwt
    raise RuntimeError("Chave pública do Supabase não encontrada no site.")


def login(sess, anon):
    email, senha = os.environ.get("BUSCAAII_EMAIL"), os.environ.get("BUSCAAII_SENHA")
    if not email or not senha:
        sys.exit("Preencha BUSCAAII_EMAIL e BUSCAAII_SENHA no arquivo .env (veja .env.example).")
    r = sess.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": anon},
        json={"email": email, "password": senha},
        timeout=30,
    )
    if r.status_code != 200:
        sys.exit(f"Falha no login do BuscaAii ({r.status_code}): {r.text[:200]}")
    return r.json()["access_token"]


CAMPOS = (
    "id,marca_veiculo,modelo_veiculo,ano_veiculo,cor_veiculo,tipo_leilao,tipo_produto,"
    "lance_inicial,lance_atual,lance_inicial_segunto_lote,valor_referencia,incremento,"
    "data_encerramento,cidade,estado,leiloeiro,fonte,imagem,observacao"
)


def baixar_lotes(sess, anon, token):
    hoje = date.today().isoformat()
    tipos = ",".join(CONFIG["tipos_produto"])
    headers = {"apikey": anon, "Authorization": f"Bearer {token}"}
    lotes, offset, pagina = [], 0, 500
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/ficha_leilao_veiculos_filtrada?select={CAMPOS}"
            f"&tipo_leilao=eq.JUDICIAL&deleted=eq.false&is_recuperacao=eq.false"
            f"&data_encerramento=gte.{hoje}&tipo_produto=in.({tipos})"
            f"&order=data_encerramento.asc,id.asc&offset={offset}&limit={pagina}"
        )
        r = sess.get(url, headers=headers, timeout=60)
        r.raise_for_status()
        bloco = r.json()
        lotes.extend(bloco)
        log(f"  {len(lotes)} lotes baixados...")
        if len(bloco) < pagina:
            break
        offset += pagina
        time.sleep(0.5)
    return lotes


# ---------------------------------------------------------------- análise do edital

BLOQUEIOS = {
    r"\bsucata\b": "Veículo declarado SUCATA",
    r"(veiculo|automovel|bem|carro)( penhorado)?( \w+)? nao (foi |esta |se encontra )?(localizad|encontrad)|paradeiro (do (veiculo|bem) )?(e )?(desconhecid|ignorad)": "Veículo NÃO LOCALIZADO",
    r"perda total": "Perda total",
    r"incendi": "Veículo incendiado",
    r"baixa (definitiva|do registro)": "Registro baixado",
    r"(apenas|somente) (para )?(pecas|desmanche)": "Somente para peças",
    r"(somente|so|apenas) (a )?lataria|carcaca": "Somente lataria/carcaça",
}

ALERTAS = {
    r"nao funciona|nao (da|esta dando) partida|sem funcionamento|motor (nao|fundido|travado)|sem motor|problema (de|no) (motor|cambio)|vaza\w* (muito )?oleo": "Não funciona / problema mecânico",
    r"sem (a )?chave|chave (nao|inexistente)": "Sem chave",
    r"alienacao fiduciaria|credor fiduciario|alienado fiduciariamente": "Alienação fiduciária (verificar quitação)",
    r"busca e apreensao": "Busca e apreensão",
    r"roubo|furto": "Menção a roubo/furto",
    r"sinistr|colisao|batid": "Sinistro / colisão",
    r"enchente|alagamento|submers": "Enchente / alagamento",
    r"restricao (judicial|administrativa|renajud)|renajud|bloqueio": "Restrição / bloqueio registrado",
    r"depositari": "Bem com depositário (retirada pode exigir diligência)",
    r"agravo|recurso pendente|embargos": "Recurso/embargos pendentes no processo",
    r"sem documento|documentacao (irregular|pendente)|sem crlv": "Documentação irregular",
    r"remarcad|adulterad": "Chassi/motor remarcado",
}

COND_RUIM = (r"pessimo|mau estado|mal estado|ruim|avaria|enferruj|podre|oxidad|amassad|quebrad|danificad|deteriorad"
             r"|precari|problema (de|no) (motor|cambio)|vaza\w* (muito )?oleo")
COND_REGULAR = r"regular|medio estado|razoave|estado medio|uso normal"
COND_BOM = r"(bom|otimo|excelente) estado|(boa|otima) conservacao|bom de conservacao|bem conservad"
FUNCIONA_SIM = r"funcionando|em funcionamento|funciona|da partida"
FUNCIONA_NAO = r"nao funciona|nao (da|esta dando) partida|sem funcionamento|motor (nao|fundido|travado)|sem motor|inoperante"

SUBROGACAO = (
    r"sub-?roga|art(igo|\.)? ?130|livres? (e desembaracad\w+ )?de (quaisquer )?onus|livre e desembaracad"
    r"|nao respondera|nao sera responsavel pel\w+ debit|debitos? .{0,60}(serao|sera) (quitad|pag)\w* com o (produto|valor)"
)
PALAVRAS_DEBITO = r"ipva|multa|licenciamento|divida|debito|dpvat|taxa|tributo|financiamento|saldo devedor|despesa"
COBRANCA_ARREMATANTE = r"arrematante (devera|deve|tera que) (pagar|arcar|recolher)"
NAO_DEBITO = r"avaliad|avaliacao|lance|minimo|arremat|incremento|valor de|venda|praca|leilao"
DINHEIRO = re.compile(r"r\$\s*([\d.]+,\d{2})")


def analisar_texto(texto):
    t = norm(texto)
    out = {"bloqueios": [], "alertas": [], "condicao": "desconhecido", "funciona": "?",
           "debitos": 0.0, "taxas": 0.0, "subrogacao": False, "avaliacao": None, "ano_modelo": None}

    for pad, desc in BLOQUEIOS.items():
        if re.search(pad, t):
            out["bloqueios"].append(desc)
    for pad, desc in ALERTAS.items():
        if re.search(pad, t):
            out["alertas"].append(desc)

    if re.search(FUNCIONA_NAO, t):
        out["funciona"] = "NÃO"
    elif re.search(FUNCIONA_SIM, t):
        out["funciona"] = "sim"

    if re.search(COND_RUIM, t) or out["funciona"] == "NÃO":
        out["condicao"] = "ruim"
    elif re.search(COND_REGULAR, t):
        out["condicao"] = "regular"
    elif re.search(COND_BOM, t):
        out["condicao"] = "bom"

    out["subrogacao"] = bool(re.search(SUBROGACAO, t))

    for m in DINHEIRO.finditer(t):
        antes = t[max(0, m.start() - 90):m.start()]
        valor = brl_to_float(m.group(1))
        if re.search(r"avaliad\w*\s*(em|por)?\s*(r\$)?\s*$", antes[-40:]) and out["avaliacao"] is None:
            out["avaliacao"] = valor
        elif re.search(COBRANCA_ARREMATANTE, antes[-70:]):
            out["taxas"] += valor  # despesas cobradas do arrematante: não se sub-rogam
        elif re.search(PALAVRAS_DEBITO, antes) and not re.search(NAO_DEBITO, antes[-45:]):
            out["debitos"] += valor

    m = re.search(r"ano\s*(?:/|de fabricacao\s*/?\s*)?\s*modelo\s*:?\s*(\d{4})\s*/\s*(\d{4})", t) or \
        re.search(r"\b((?:19|20)\d{2})\s*/\s*((?:19|20)\d{2})\b", t)
    if not m:  # anos colados, comuns em URL: ...anomodelo20102011
        m = re.search(r"(?<!\d)((?:19|20)\d{2})((?:19|20)\d{2})(?!\d)", t)
        if m and not 0 <= int(m.group(2)) - int(m.group(1)) <= 1:
            m = None
    if m:
        ano = int(m.group(2))
        if 1950 < ano <= date.today().year + 1:
            out["ano_modelo"] = ano
    return out


def texto_lote(l, extra=""):
    """Junta título, descrição do edital e o "slug" da URL (que às vezes diz 'somente-lataria', o ano etc.)."""
    slug = re.sub(r"[-_/]+", " ", requests.utils.urlparse(l.get("fonte") or "").path)
    return f"{l.get('modelo_veiculo') or ''}. {l.get('observacao') or ''}. {slug}. {extra}"


# ---------------------------------------------------------------- FIPE

# tokens genéricos que aparecem em quase todo nome FIPE e não ajudam a achar a versão
TOKENS_FRACOS = {"16v", "8v", "12v", "20v", "24v", "flex", "mi", "mpfi", "2p", "3p", "4p", "5p", "aut", "aut.", "mec", "mec.",
                 "total", "gasolina", "alcool", "diesel", "sedan", "sed.", "hatch", "hatch."}
# versões caras que só devem ser escolhidas quando o título do lote as cita
TOKENS_PREMIUM = {"gti", "gts", "cc", "turbo", "rs", "amg", "cabrio", "cabriolet", "conversivel", "coupe", "rallye",
                  "v6", "v8", "srt", "cupra", "gsi", "type", "tsi", "competition", "nismo", "sti", "racing"}


class Fipe:
    """Consulta a API FIPE (parallelum) com cache em disco e respeito ao limite diário."""

    def __init__(self):
        self.path = CACHE_DIR / "fipe_cache.json"
        self.cache = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
        self.sess = requests.Session()
        self.sess.headers["User-Agent"] = USER_AGENT
        if os.environ.get("FIPE_TOKEN"):
            self.sess.headers["X-Subscription-Token"] = os.environ["FIPE_TOKEN"]
        self.esgotado = False
        self.chamadas = 0
        self._sujo = 0

    def get(self, caminho):
        if caminho in self.cache:
            return self.cache[caminho]
        if self.esgotado:
            return None
        for tentativa in range(3):
            time.sleep(0.35)
            try:
                r = self.sess.get(FIPE_API + caminho, timeout=30)
            except requests.RequestException:
                time.sleep(2)
                continue
            self.chamadas += 1
            if r.status_code == 429:
                self.esgotado = True
                log("  ! Limite diário da API FIPE atingido. Os restantes ficam como 'FIPE pendente'.")
                return None
            if r.status_code == 404:
                self.cache[caminho] = None
                return None
            if r.ok:
                self.cache[caminho] = r.json()
                self._sujo += 1
                if self._sujo >= 20:
                    self.salvar()
                return self.cache[caminho]
            time.sleep(2)
        return None

    def salvar(self):
        CACHE_DIR.mkdir(exist_ok=True)
        self.path.write_text(json.dumps(self.cache, ensure_ascii=False), encoding="utf-8")
        self._sujo = 0

    def marca(self, marca, tipo="cars"):
        marcas = self.get(f"/{tipo}/brands") or []
        alvo = set(tokens(marca))
        if not alvo:
            return None
        candidatas = [b for b in marcas if alvo <= set(tokens(b["name"]))]
        if not candidatas:
            return None
        return min(candidatas, key=lambda b: len(b["name"]))

    def modelos_no_ano(self, tipo, marca_code, ano):
        """Versões que existem na FIPE naquele ano (flex=5, gasolina=1, diesel=3). Cache por marca+ano."""
        res = {}
        for comb in ("5", "1", "3"):
            ms = self.get(f"/{tipo}/brands/{marca_code}/years/{ano}-{comb}/models")
            if ms is None and self.esgotado:
                return None
            for m in ms or []:
                res.setdefault(m["code"], (m["name"], f"{ano}-{comb}"))
        return res

    def preco(self, marca, modelo, ano, tipo="cars"):
        """Retorna (preco, nome_fipe, status)."""
        b = self.marca(marca, tipo)
        if not b:
            return None, None, "FIPE pendente" if self.esgotado else "marca não encontrada na FIPE"
        ignorar = set(tokens(marca)) | set(tokens(b["name"])) | {"gm", "vw", "mb"}
        q = [t for t in tokens(modelo) if t not in ignorar]
        if not q:
            return None, None, "modelo não identificado"
        familia = q[0]
        peso = lambda t: 0.3 if t in TOKENS_FRACOS else 1.0
        total = sum(peso(t) for t in q)

        for a in (ano, ano + 1, ano - 1):  # o "ano" do lote às vezes é o de fabricação
            modelos = self.modelos_no_ano(tipo, b["code"], a)
            if modelos is None:
                return None, None, "FIPE pendente"
            pontuados = []
            for code, (nome, ano_code) in modelos.items():
                f = set(tokens(nome))
                if familia not in f:
                    continue
                score = sum(peso(t) for t in q if t in f) / total - 0.01 * len(f)
                score -= 0.3 * len((f & TOKENS_PREMIUM) - set(q))  # esportiva/conversível que o lote não cita
                pontuados.append((score, code, ano_code))
            if not pontuados:
                continue
            pontuados.sort(key=lambda x: -x[0])
            melhor = pontuados[0][0]

            # várias versões empatadas (ex.: "Gol" sem motor/versão): usa a mediana de até 3 delas
            precos, nomes = [], []
            for score, code, ano_code in pontuados[:3]:
                if score < melhor - 0.08:
                    break
                info = self.get(f"/{tipo}/brands/{b['code']}/models/{code}/years/{ano_code}")
                if info and info.get("price"):
                    precos.append(brl_to_float(info["price"]))
                    nomes.append(f"{info.get('model')} {a}")
                elif self.esgotado:
                    return None, None, "FIPE pendente"
            if precos:
                po = sorted(precos)
                n = len(po)
                mediana = po[n // 2] if n % 2 else (po[n // 2 - 1] + po[n // 2]) / 2
                nome = nomes[0] if n == 1 else f"mediana de {n} versões: " + " | ".join(nomes)
                return mediana, nome, "ok"
        return None, None, f"{familia} {ano} não encontrado na FIPE"


# ---------------------------------------------------------------- editais (PDF)


def recortar(texto, lote, tamanho=(1500, 2500)):
    """Recorta o trecho do texto que fala deste veículo (pela placa, renavam, chassi ou modelo)."""
    obs = norm(f"{lote.get('observacao') or ''} {lote.get('fonte') or ''}")
    chaves = re.findall(r"\b[a-z]{3}-?\d[a-z0-9]\d{2}\b", obs)  # placas
    chaves += re.findall(r"\b\d{9,11}\b", obs)                    # renavam
    chaves += re.findall(r"\b[a-z0-9]{17}\b", obs)                # chassi
    tn = norm(texto)
    for c in chaves:
        for v in (c, c.replace("-", "")):
            i = tn.find(v)
            if i >= 0:
                return texto[max(0, i - tamanho[0]): i + tamanho[1]]
    return None


def ler_edital(sess, lote):
    """Abre a página do lote no site do leiloeiro: usa o texto da página e procura o PDF do edital."""
    url = lote.get("fonte")
    if not url:
        return None, "sem link do leiloeiro"
    try:
        html = sess.get(url, timeout=30, headers={"User-Agent": USER_AGENT}).text
    except requests.RequestException as e:
        return None, f"site do leiloeiro inacessível ({type(e).__name__})"

    # texto visível da página do lote (muitos lotes vêm do BuscaAii sem descrição)
    visivel = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    visivel = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", visivel))
    pagina = ""
    if not (lote.get("observacao") or "").strip():
        pagina = recortar(visivel, lote, (300, 3000)) or ""
        if not pagina:
            m = re.search(r"(?i)descri[cç][aã]o", visivel)
            pagina = visivel[m.start(): m.start() + 3000] if m else ""

    links = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)
    pdfs = [l for l in links if re.search(r"edital", l, re.I) or l.lower().split("?")[0].endswith(".pdf")]
    pdfs.sort(key=lambda l: 0 if re.search(r"edital", l, re.I) else 1)
    if not pdfs:
        status = "PDF não encontrado na página" + ("; usei o texto da página" if pagina else " (pode exigir JavaScript)")
        return pagina or None, status
    try:
        from pypdf import PdfReader
        logging.getLogger("pypdf").setLevel(logging.ERROR)
    except ImportError:
        return pagina or None, "pypdf não instalado (pip install pypdf)"

    pasta = CACHE_DIR / "editais"
    pasta.mkdir(parents=True, exist_ok=True)
    for link in pdfs[:2]:
        link = requests.compat.urljoin(url, link)
        try:
            r = sess.get(link, timeout=60, headers={"User-Agent": USER_AGENT})
            if not r.ok or b"%PDF" not in r.content[:1024] or len(r.content) > 20_000_000:
                continue
            nome = re.sub(r"[^\w.-]", "_", link.split("/")[-1].split("?")[0])[:80] or "edital.pdf"
            (pasta / f"{lote['id'][:8]}_{nome}").write_bytes(r.content)
            texto = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(r.content)).pages)
        except Exception as e:  # PDFs de leiloeiro costumam vir quebrados
            log(f"    edital ilegível em {link}: {type(e).__name__}")
            continue
        trecho = recortar(texto, lote)
        if trecho:
            return f"{pagina} {trecho}", "edital PDF lido"
        # sem identificador: mantém só as cláusulas gerais (débitos, sub-rogação), sem valores de outros lotes
        gerais = [s for s in re.split(r"(?<=[.;])\s+", texto)
                  if re.search(SUBROGACAO, norm(s)) and not DINHEIRO.search(norm(s))]
        return f"{pagina} {' '.join(gerais)[:4000]}", "edital PDF lido (só cláusulas gerais)"
    return pagina or None, "PDF do edital não pôde ser baixado/lido"


# ---------------------------------------------------------------- cálculo


def lance_base(l):
    inicial = float(l.get("lance_inicial") or 0)
    atual = float(l.get("lance_atual") or 0)
    segunda = float(l.get("lance_inicial_segunto_lote") or 0)
    if atual > inicial > 0:          # já tem lances: vale o lance atual
        return atual, inicial, segunda, "lance atual"
    if 0 < segunda < inicial:
        return segunda, inicial, segunda, "2ª praça"
    return inicial or atual, inicial, segunda, "1ª praça"


def calcular(l, a, fipe_valor):
    c = CONFIG
    lance, l1, l2, praca = lance_base(l)
    debitos = a["taxas"] + (0.0 if a["subrogacao"] else a["debitos"])
    comissao = lance * c["comissao_leiloeiro"]
    custo = lance + comissao + debitos + c["custo_documentacao"] + c["custo_remocao"]
    res = {"lance": lance, "lance_1a": l1, "lance_2a": l2, "praca": praca, "comissao": comissao,
           "debitos_considerados": debitos, "custo_aquisicao": custo}
    if not fipe_valor:
        return res
    pct_reparo = c["reparo_por_condicao"][a["condicao"]]
    if a["funciona"] == "NÃO":
        pct_reparo += c["reparo_extra_nao_funciona"]
    reparo = fipe_valor * pct_reparo
    revenda = fipe_valor * (1 - c["desagio_revenda"])
    investimento = custo + reparo
    lucro = revenda - investimento
    res.update({
        "desconto_fipe": 1 - lance / fipe_valor if fipe_valor else None,
        "reparo": reparo, "revenda": revenda, "investimento": investimento,
        "lucro": lucro, "margem": lucro / investimento if investimento else None,
    })
    return res


# ---------------------------------------------------------------- relatório


COLUNAS = [
    ("Veredito", 16, None), ("Veículo", 34, None), ("Ano", 7, None), ("Cidade/UF", 20, None),
    ("Encerra", 11, "dd/mm/yyyy"), ("Leiloeiro", 20, None), ("Praça usada", 11, None),
    ("Lance 1ª praça", 14, "money"), ("Lance 2ª praça", 14, "money"), ("Lance considerado", 15, "money"),
    ("FIPE", 13, "money"), ("Modelo FIPE", 34, None), ("Desconto s/ FIPE", 11, "pct"),
    ("Comissão", 11, "money"), ("Débitos/taxas (edital)", 13, "money"), ("Sub-rogação?", 11, None),
    ("Reparo estimado", 13, "money"), ("Investimento total", 15, "money"), ("Revenda estimada", 15, "money"),
    ("Lucro estimado", 14, "money"), ("Margem", 9, "pct"), ("Condição", 12, None), ("Funciona?", 9, None),
    ("Bloqueios", 28, None), ("Alertas", 45, None), ("Edital PDF", 28, None), ("Avaliação judicial", 14, "money"),
    ("Descrição do edital", 80, None), ("Link do lote", 40, None),
]


def linha_relatorio(r):
    l, a, c = r["lote"], r["analise"], r["calc"]
    enc = l.get("data_encerramento")
    return [
        r["veredito"], l.get("modelo_veiculo"), r["ano"], f"{l.get('cidade') or ''}/{l.get('estado') or ''}",
        datetime.fromisoformat(enc[:10]) if enc else None, l.get("leiloeiro"), c["praca"],
        c["lance_1a"] or None, c["lance_2a"] or None, c["lance"], r["fipe"], r["fipe_modelo"] or r["fipe_status"],
        c.get("desconto_fipe"), c["comissao"], (a["debitos"] + a["taxas"]) or None, "sim" if a["subrogacao"] else "não/?",
        c.get("reparo"), c.get("investimento"), c.get("revenda"), c.get("lucro"), c.get("margem"),
        a["condicao"], a["funciona"], "; ".join(a["bloqueios"]), "; ".join(a["alertas"]),
        r.get("edital_status") or "", a["avaliacao"],
        re.sub(r"\s+", " ", l.get("observacao") or "")[:1500], l.get("fonte"),
    ]


def gerar_excel(resultados, caminho):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    abas = [
        ("Vale a pena", [r for r in resultados if r["veredito"] == "VALE A PENA"]),
        ("Talvez", [r for r in resultados if r["veredito"] == "TALVEZ"]),
        ("Todos", resultados),
    ]
    cores = {"VALE A PENA": "C6EFCE", "TALVEZ": "FFEB9C", "DESCARTAR": "FFC7CE", "SEM FIPE": "E7E6E6"}
    for i, (nome, linhas) in enumerate(abas):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = nome
        ws.append([c[0] for c in COLUNAS])
        for cel in ws[1]:
            cel.font = Font(bold=True, color="FFFFFF")
            cel.fill = PatternFill("solid", fgColor="1F3864")
            cel.alignment = Alignment(wrap_text=True, vertical="center")
        for r in linhas:
            ws.append(linha_relatorio(r))
            row = ws.max_row
            ws.cell(row, 1).fill = PatternFill("solid", fgColor=cores.get(r["veredito"], "FFFFFF"))
            link = r["lote"].get("fonte")
            if link:
                ws.cell(row, len(COLUNAS)).hyperlink = link
                ws.cell(row, len(COLUNAS)).style = "Hyperlink"
        for j, (_, larg, fmt) in enumerate(COLUNAS, start=1):
            ws.column_dimensions[get_column_letter(j)].width = larg
            if fmt:
                nf = {"money": 'R$ #,##0', "pct": "0%", "dd/mm/yyyy": "dd/mm/yyyy"}[fmt]
                for row in ws.iter_rows(min_row=2, min_col=j, max_col=j):
                    row[0].number_format = nf
        ws.freeze_panes = "C2"
        ws.auto_filter.ref = ws.dimensions

    ws = wb.create_sheet("Parâmetros")
    ws.append(["Parâmetro", "Valor"])
    for k, v in CONFIG.items():
        ws.append([k, json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v])
    ws.append([])
    ws.append(["Lucro = revenda estimada − (lance + comissão + débitos + documentação + remoção + reparo)"])
    ws.append(["Revenda estimada = FIPE × (1 − deságio). Reparo = FIPE × % pela condição do edital."])
    ws.append(["Débitos são ignorados quando o edital fala em sub-rogação/livre de ônus (CTN art. 130); taxas cobradas do arrematante sempre entram."])
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 70
    wb.save(caminho)


# ---------------------------------------------------------------- principal


def main():
    ap = argparse.ArgumentParser(description="Analisa leilões judiciais de veículos do BuscaAii")
    ap.add_argument("--limite", type=int, default=0, help="analisar só os N lotes que encerram primeiro")
    ap.add_argument("--editais", type=int, default=0, help="baixar e ler o PDF do edital dos N melhores")
    ap.add_argument("--offline", action="store_true", help="reusar os lotes já baixados hoje")
    ap.add_argument("--uf", help="filtrar por estado(s), ex: SP,MG")
    ap.add_argument("--lance-max", type=float, default=0, help="lance máximo em R$")
    ap.add_argument("--margem", type=float, help="margem mínima (ex: 0.3 para 30%%)")
    args = ap.parse_args()
    if args.margem is not None:
        CONFIG["margem_minima"] = args.margem

    carregar_env()
    CACHE_DIR.mkdir(exist_ok=True)
    SAIDA_DIR.mkdir(exist_ok=True)
    sess = requests.Session()
    sess.headers["User-Agent"] = USER_AGENT

    salvos = sorted(CACHE_DIR.glob("lotes_*.json"))
    if args.offline and salvos:
        lotes = json.loads(salvos[-1].read_text(encoding="utf-8"))
        hoje = date.today().isoformat()
        lotes = [l for l in lotes if (l.get("data_encerramento") or hoje) >= hoje]
        log(f"Usando {len(lotes)} lotes ainda abertos de {salvos[-1].name}.")
    else:
        log("Entrando no BuscaAii...")
        anon = obter_anon_key(sess)
        token = login(sess, anon)
        log("Baixando lotes judiciais de veículos...")
        lotes = baixar_lotes(sess, anon, token)
        (CACHE_DIR / f"lotes_{date.today().isoformat()}.json").write_text(
            json.dumps(lotes, ensure_ascii=False), encoding="utf-8")

    if args.uf:
        ufs = {u.strip().upper() for u in args.uf.split(",")}
        lotes = [l for l in lotes if (l.get("estado") or "").upper().strip()[:2] in ufs]
    if args.lance_max:
        lotes = [l for l in lotes if 0 < lance_base(l)[0] <= args.lance_max]
    if args.limite:
        lotes = lotes[: args.limite]
    log(f"{len(lotes)} lotes para analisar.")

    fipe = Fipe()

    def processar(r, extra=""):
        l = r["lote"]
        a = r["analise"] = analisar_texto(texto_lote(l, extra))
        r["ano"] = a["ano_modelo"] or l.get("ano_veiculo")
        if a["bloqueios"]:
            r["fipe"], r["fipe_modelo"], r["fipe_status"] = None, None, "não consultado (bloqueio)"
        elif lance_base(l)[0] <= 0:
            r["fipe_status"] = "sem lance informado"
        elif not l.get("marca_veiculo") or not r["ano"]:
            r["fipe_status"] = "sem marca/ano"
        elif not r.get("fipe"):
            r["fipe"], r["fipe_modelo"], r["fipe_status"] = fipe.preco(
                l["marca_veiculo"], l.get("modelo_veiculo"), int(r["ano"]))
        avaliar(r)

    def avaliar(r):
        a = r["analise"]
        r["calc"] = c = calcular(r["lote"], a, r["fipe"])
        if a["bloqueios"]:
            r["veredito"] = "DESCARTAR"
        elif not r["fipe"]:
            r["veredito"] = "SEM FIPE"
        elif c["lance"] < 0.05 * r["fipe"]:
            r["veredito"] = "TALVEZ"          # lance irrisório costuma ser erro de cadastro
            a["alertas"].append("Lance muito baixo vs FIPE: confira o valor no site")
        elif c["margem"] >= CONFIG["margem_minima"]:
            r["veredito"] = "VALE A PENA"
        elif c["margem"] >= CONFIG["margem_minima"] / 2:
            r["veredito"] = "TALVEZ"
        else:
            r["veredito"] = "DESCARTAR"

    resultados = []
    for i, l in enumerate(lotes, 1):
        r = {"lote": l, "fipe": None, "fipe_modelo": None, "fipe_status": ""}
        processar(r)
        resultados.append(r)
        if i % 50 == 0:
            log(f"  {i}/{len(lotes)} analisados ({fipe.chamadas} consultas FIPE novas)")
    fipe.salvar()

    if args.editais:
        # prioridade: melhores margens; depois lotes sem descrição/ano, que só a página do leiloeiro resolve
        def prioridade(r):
            if r["veredito"] in ("VALE A PENA", "TALVEZ"):
                return (0, -(r["calc"].get("margem") or 0))
            if r["fipe_status"] == "sem marca/ano":
                return (1, 0)
            return (9, 0)
        candidatos = [r for r in sorted(resultados, key=prioridade) if prioridade(r)[0] < 9][: args.editais]
        log(f"Lendo página/edital de {len(candidatos)} lotes no site do leiloeiro...")
        for r in candidatos:
            trecho, status = ler_edital(sess, r["lote"])
            r["edital_status"] = status
            if trecho:
                processar(r, trecho)
            log(f"  {r['lote'].get('modelo_veiculo')}: {status} -> {r['veredito']}")
            time.sleep(1)
        fipe.salvar()

    ordem = {"VALE A PENA": 0, "TALVEZ": 1, "SEM FIPE": 2, "DESCARTAR": 3}
    resultados.sort(key=lambda r: (ordem[r["veredito"]], -(r["calc"].get("margem") or -9)))

    caminho = SAIDA_DIR / f"leiloes_judiciais_{datetime.now():%Y-%m-%d_%H%M}.xlsx"
    gerar_excel(resultados, caminho)

    resumo = {k: sum(1 for r in resultados if r["veredito"] == k) for k in ordem}
    log("\nResumo: " + " | ".join(f"{k}: {v}" for k, v in resumo.items()))
    pend = sum(1 for r in resultados if r["fipe_status"] == "FIPE pendente")
    if pend:
        log(f"{pend} veículos ficaram sem FIPE pelo limite diário da API. Rode de novo amanhã "
            f"(o cache guarda o que já foi consultado) ou coloque um FIPE_TOKEN no .env.")
    log("\nTop 10:")
    for r in [r for r in resultados if r["veredito"] == "VALE A PENA"][:10]:
        c = r["calc"]
        log(f"  {r['lote'].get('modelo_veiculo')} {r['ano']} | lance R$ {c['lance']:,.0f} | FIPE R$ {r['fipe']:,.0f}"
            f" | lucro R$ {c['lucro']:,.0f} ({c['margem']:.0%}) | {r['lote'].get('cidade')}/{r['lote'].get('estado')}")
    log(f"\nRelatório: {caminho}")


if __name__ == "__main__":
    main()
