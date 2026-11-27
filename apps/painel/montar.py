#!/usr/bin/env python3
"""Monta o painel web do Araguaia Connect (apps/painel).

  python3 montar.py            -> public/  (produção: fala com o Supabase, sem dados simulados)
  python3 montar.py --previa   -> previa/  (mesmo site + imitação das funções ca_* com dados SIMULADOS)

Valida antes de terminar (para com erro se algo falhar):
  placeholders resolvidos · node --check em todo JS · nenhuma URL externa fora da lista ·
  nenhum segredo (service_role, sb_secret_, JWT) · nenhum atributo on*= · favicon presente.
Nunca editar public/ ou previa/ à mão: são gerados.
"""
import base64, json, os, re, shutil, subprocess, sys, time, urllib.parse

RAIZ = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(RAIZ, "site")
SRC = os.path.join(RAIZ, "src")
MIGR = os.environ.get("MIGRACOES", os.path.normpath(os.path.join(RAIZ, "..", "..", "supabase", "migrations")))
AMB = os.path.normpath(os.path.join(RAIZ, "..", "..", "ambientes.json"))

NOME = "Araguaia Connect"            # nome provisório: único ponto de configuração
SUPABASE_URL = os.environ.get("SUPABASE_URL") or "https://hajteevwnliqykvlsucb.supabase.co"
CHAVE_PUBLICAVEL = os.environ.get("SUPABASE_KEY") or "sb_publishable_IWLDS9ucg41QuX0X6z8BJg_sIBYMwDb"   # publicável: pode ficar no front
PERMITIDOS = [SUPABASE_URL, "http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink"]
JS = ["config.js", "app.js", "fluxo_motor.js", "motor.js", "console.js", "cadastros.js", "fluxos.js", "indicadores.js", "iniciar.js"]


def falha(msg):
    print("FALHOU:", msg)
    sys.exit(1)


def ler(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def svg_data_uri(svg):
    return "data:image/svg+xml," + urllib.parse.quote(svg, safe=" =:/'-")


def sem_fundo(svg):
    """Ícone dentro da página: sem o quadrado de fundo (A4.2)."""
    return re.sub(r'<rect width="64" height="64"[^>]*/>', "", svg, count=1).replace('viewBox="0 0 64 64"', 'viewBox="8 8 48 46"')


def seed_das_migracoes():
    """Cadastros e fluxos da prévia saem da migração de carga inicial (nunca digitados)."""
    arq = [f for f in sorted(os.listdir(MIGR)) if "carga_inicial" in f]
    if not arq:
        falha("migração de carga inicial não encontrada em " + MIGR)
    sql = ler(os.path.join(MIGR, arq[-1]))
    tup = lambda bloco: [re.findall(r"'((?:[^']|'')*)'|\b(null|true|false|\d+)\b", t) for t in re.findall(r"\(([^()]*(?:\([^()]*\)[^()]*)*)\)", bloco)]

    def valores(inicio, fim):
        i = sql.index(inicio)
        j = sql.index(fim, i)
        return sql[i:j]

    def lim(t):
        return [a.replace("''", "'") if a or not b else (None if b == "null" else b == "true" if b in ("true", "false") else int(b)) for a, b in t]
    areas = [lim(t) for t in tup(valores("insert into areas", "on conflict"))[1:]]
    filas = [lim(t) for t in tup(valores("from (values", ") v(area, codigo"))]
    i = sql.index("insert into assuntos")
    assuntos = [lim(t) for t in tup(sql[sql.index("from (values", i):sql.index(") v(area, fila", i)])]
    fluxos = dict((c, json.loads(j)) for c, j in re.findall(r"\('([A-Z_]+)', \$j\$(.*?)\$j\$\)", sql, re.S))
    i = sql.index("insert into respostas_rapidas")
    resp = [lim(t) for t in tup(sql[i:sql.index("on conflict", i)])[1:]]
    seed = {
        "areas": [dict(codigo=a[0], nome=a[1], descricao=a[2], icone=a[3], cor=a[4], ordem=a[5]) for a in areas if len(a) == 6],
        "filas": [dict(area=f[0], codigo=f[1], nome=f[2], sla_e=f[3], sla_a=f[4]) for f in filas if len(f) == 5],
        "assuntos": [dict(area=s[0], fila=s[1], codigo=s[2], nome=s[3], descr=s[4], icone=s[5], ordem=s[6], doc=s[7], obrig=s[8]) for s in assuntos if len(s) == 9],
        "fluxos": fluxos,
        "respostas": [dict(atalho=r[0], titulo=r[1], texto=r[2]) for r in [[x for x in t if x is not None] for t in resp] if len(r) == 3],
    }
    for k, minimo in (("areas", 3), ("filas", 9), ("assuntos", 9), ("fluxos", 9), ("respostas", 4)):
        if len(seed[k]) < minimo:
            falha("seed: esperava ao menos %d %s, li %d" % (minimo, k, len(seed[k])))
    return seed


def montar(previa):
    if not CHAVE_PUBLICAVEL.startswith("sb_publishable_"):
        falha("SUPABASE_KEY precisa ser a chave publicável (sb_publishable_...), nunca a secreta")
    destino = os.path.join(RAIZ, "previa" if previa else "public")
    if os.path.isdir(destino):
        shutil.rmtree(destino)
    os.makedirs(destino)
    versao = time.strftime("%Y%m%d.%H%M", time.localtime())
    icone = ler(os.path.join(SRC, "icone.svg"))
    logo = ler(os.path.join(SRC, "logo_branco.svg")).replace("<svg ", '<svg class="logo" role="img" aria-label="Araguaia" ', 1)
    png = base64.b64encode(open(os.path.join(SRC, "favicon32.png"), "rb").read()).decode()
    favicon = '<link rel="icon" type="image/svg+xml" href="%s">\n<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,%s">' % (svg_data_uri(icone), png)
    csp = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
           "connect-src 'self' %s; base-uri 'none'; form-action 'none'; object-src 'none'" % SUPABASE_URL)
    html = ler(os.path.join(SITE, "index.html"))
    mock = '<script src="mock_seed.js?v=%s"></script>\n<script src="mock.js?v=%s"></script>' % (versao, versao) if previa else ""
    for k, v in (("__FAVICON__", favicon), ("__LOGO__", logo), ("__ICONE_SOLTO__", sem_fundo(icone).replace("<svg ", '<svg class="ic" aria-hidden="true" ', 1)),
                 ("__CSP__", csp), ("__MOCK__", mock), ("__VERSAO__", versao), ("__NOME__", NOME)):
        html = html.replace(k, v)
    sobra = re.findall(r"__[A-Z_]+__", html)
    if sobra:
        falha("placeholders sobrando: %s" % sobra)
    open(os.path.join(destino, "index.html"), "w", encoding="utf-8").write(html)
    shutil.copy(os.path.join(SITE, "styles.css"), destino)
    shutil.copy(os.path.join(SRC, "favicon32.png"), destino)
    cfg = {"supabaseUrl": SUPABASE_URL, "chave": CHAVE_PUBLICAVEL, "nomeProduto": NOME, "versao": versao, "iconeMini": icone.replace("<svg ", '<svg width="34" height="34" ', 1)}
    open(os.path.join(destino, "config.js"), "w", encoding="utf-8").write(
        "/* gerado por montar.py — não editar */\nwindow.CFG=%s;\n" % json.dumps(cfg, ensure_ascii=False))
    for f in JS[1:]:
        shutil.copy(os.path.join(SITE, f), destino)
    if previa:
        shutil.copy(os.path.join(SITE, "mock.js"), destino)
        open(os.path.join(destino, "mock_seed.js"), "w", encoding="utf-8").write(
            "/* gerado por montar.py a partir da migração de carga inicial */\nwindow.__SEED__=%s;\n" % json.dumps(seed_das_migracoes(), ensure_ascii=False))
    validar(destino, previa)
    total = sum(os.path.getsize(os.path.join(destino, f)) for f in os.listdir(destino))
    print("OK %s · %d arquivos · %.0f KB · versão %s" % (os.path.relpath(destino, RAIZ), len(os.listdir(destino)), total / 1024, versao))


def validar(destino, previa):
    erros = []
    for f in sorted(os.listdir(destino)):
        p = os.path.join(destino, f)
        if f.endswith(".js"):
            r = subprocess.run(["node", "--check", p], capture_output=True, text=True)
            if r.returncode:
                erros.append("%s: %s" % (f, r.stderr.strip().splitlines()[-1] if r.stderr else "erro de sintaxe"))
        if f.endswith((".js", ".html", ".css")):
            t = ler(p)
            for url in re.findall(r"https?://[^\s\"'<>()\\]+", t):
                if not any(url.startswith(ok) for ok in PERMITIDOS):
                    erros.append("%s: URL externa fora da lista: %s" % (f, url))
            for padrao, nome in ((r"service_role", "service_role"), (r"sb_secret_", "chave secreta"), (r"eyJ[A-Za-z0-9_-]{30,}\.", "JWT")):
                if re.search(padrao, t):
                    erros.append("%s: possível segredo (%s)" % (f, nome))
            if re.search(r"<[^>]+\son[a-z]+\s*=", t, re.I):
                erros.append("%s: atributo on*= (proibido pela CSP)" % f)
            if f.endswith(".html") and re.search(r"<script(?![^>]*\bsrc=)[^>]*>", t):
                erros.append("%s: script inline (proibido pela CSP)" % f)
            if f.endswith(".js") and ("innerHTML" in t) and re.search(r"\.onclick\s*=", t):
                pass
    html = ler(os.path.join(destino, "index.html"))
    if 'rel="icon"' not in html:
        erros.append("index.html: sem favicon")
    if not previa and ("mock" in html.lower()):
        erros.append("index.html de produção referencia a prévia")
    if erros:
        falha("\n  " + "\n  ".join(erros))


if __name__ == "__main__":
    montar("--previa" in sys.argv)
