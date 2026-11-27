#!/usr/bin/env python3
"""Monta o app do consultor: src/ -> public/. Injeta configurações, gera ícones PNG
e valida (placeholders, JS, URLs externas, segredos, favicon, eventos inline).
Uso: python3 montar.py            (prévia, dados simulados)
     SUPABASE_URL=https://x.supabase.co SUPABASE_KEY=sb_publishable_... python3 montar.py
"""
import os, re, sys, json, shutil, subprocess, datetime, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent
SRC, PUB = RAIZ / "src", RAIZ / "public"
APP_NOME = os.environ.get("APP_NOME", "Araguaia Connect")
APP_CURTO = os.environ.get("APP_CURTO", "Connect")
MIGRACOES = pathlib.Path(os.environ.get("MIGRACOES", RAIZ.parent.parent / "supabase" / "migrations"))
if not MIGRACOES.exists(): MIGRACOES = pathlib.Path("/mnt/project-files/central-atendimento/supabase/migrations")
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_KEY", "")
VERSAO = datetime.datetime.now().strftime("%Y%m%d%H%M")
ERROS = []

def falha(m): ERROS.append(m)

if KEY and not KEY.startswith("sb_publishable_"):
    sys.exit("ERRO: SUPABASE_KEY precisa ser a chave PUBLICÁVEL (sb_publishable_...). Nunca use a secreta no front.")
if URL and not re.fullmatch(r"https://[a-z0-9]+\.supabase\.co", URL):
    sys.exit("ERRO: SUPABASE_URL inválida.")

PERMITIDOS = [URL] if URL else []
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:" + ((' ' + URL) if URL else '') + "; "
       f"connect-src 'self'{(' ' + URL + ' ' + URL.replace('https://', 'wss://')) if URL else ''}; manifest-src 'self'; worker-src 'self'; "
       "base-uri 'none'; form-action 'none'; object-src 'none'")

icone = (SRC / "icone.svg").read_text(encoding="utf-8").strip()
inline = re.sub(r'<rect[^>]*/>', '', icone).replace('viewBox="0 0 64 64"', 'viewBox="8 8 48 46" aria-hidden="true"')
completo = icone.replace('viewBox="0 0 64 64"', 'viewBox="0 0 64 64" aria-hidden="true"')
# Dentro da página o ícone vai sem quadrado: balão branco, seta verde (A4.2)

PUB.mkdir(exist_ok=True)
for velho in PUB.iterdir():
    if velho.is_file(): velho.unlink()
SUBS = {"__APP_CURTO__": APP_CURTO, "__APP_NOME__": APP_NOME, "__VERSAO__": VERSAO, "__SUPABASE_URL__": URL, "__SUPABASE_KEY__": KEY,
        "__CSP__": CSP, "__ICONE_INLINE__": inline, "__ICONE__": completo}
for f in SRC.iterdir():
    if f.suffix in (".html", ".js", ".css", ".webmanifest", ".svg"):
        t = f.read_text(encoding="utf-8")
        for k, v in SUBS.items(): t = t.replace(k, v)
        (PUB / f.name).write_text(t, encoding="utf-8")

# Fluxos da prévia lidos da migração de carga (fonte única das perguntas)
carga = sorted(MIGRACOES.glob("*carga_inicial*.sql"))
if not carga: falha(f"migração de carga inicial não encontrada em {MIGRACOES}")
else:
    sql = carga[-1].read_text(encoding="utf-8")
    fluxos = {m.group(1): json.loads(m.group(2)) for m in re.finditer(r"\('([A-Z_]+)',\s*\$j\$(.*?)\$j\$\)", sql, re.S)}
    if len(fluxos) < 9: falha(f"só {len(fluxos)} fluxos lidos de {carga[-1].name}")
    (PUB / "fluxos-previa.js").write_text("/* Gerado pelo montar.py a partir de " + carga[-1].name + ". Não editar. */\nwindow.FLUXOS_PREVIA = " + json.dumps(fluxos, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"Fluxos da prévia: {len(fluxos)} lidos de {carga[-1].name}")

# Ícones PNG a partir do mesmo SVG (Playwright).
# "any": com cantos arredondados e fundo transparente. "cheio" (iOS e maskable do Android):
# fundo azul até a borda e símbolo reduzido para a zona segura (o sistema recorta o formato).
simbolo = re.sub(r'<rect[^>]*/>', '', re.sub(r'^<svg[^>]*>|</svg>\s*$', '', icone.strip()))
fundo = re.search(r'<rect[^>]*fill="(#[0-9A-Fa-f]{6})"', icone).group(1)
def cheio(escala):
    d = 32 * (1 - escala)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{fundo}"/>'
            f'<g transform="translate({d:.2f} {d:.2f}) scale({escala})">{simbolo}</g></svg>')
ALVOS = [("icone-32.png", 32, icone), ("icone-192.png", 192, icone), ("icone-512.png", 512, icone),
         ("icone-180-ios.png", 180, cheio(0.9)), ("icone-512-maskable.png", 512, cheio(0.78))]
alvos_js = json.dumps([[n, t, s.replace("<svg ", f'<svg width="{t}" height="{t}" ', 1)] for n, t, s in ALVOS])
js = """
const {chromium} = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [nome, n, svg] of %s) {
    const p = await b.newPage({viewport: {width: n, height: n}});
    await p.setContent('<html><body style="margin:0;background:transparent">' + svg + '</body></html>');
    await p.screenshot({path: '%s/' + nome, omitBackground: true});
  }
  await b.close();
})();
""" % (alvos_js, PUB)
# Os PNGs ficam versionados em src/png (o Render não tem navegador para gerá-los).
# Regerar depois de trocar o icone.svg: GERAR_ICONES=1 python3 montar.py
PNG = SRC / "png"; PNG.mkdir(exist_ok=True)
if os.environ.get("GERAR_ICONES") == "1" or not all((PNG / n).exists() for n, _, _ in ALVOS):
    js = js.replace(str(PUB), str(PNG))
    r = subprocess.run(["node", "-e", js], capture_output=True, text=True)
    if r.returncode: falha("ícones PNG: " + r.stderr[-400:])
for n, _, _ in ALVOS:
    if (PNG / n).exists(): shutil.copy(PNG / n, PUB / n)

# ---------- Validações ----------
for f in PUB.iterdir():
    if f.suffix not in (".html", ".js", ".css", ".webmanifest"): continue
    t = f.read_text(encoding="utf-8")
    sobra = re.findall(r"__[A-Z_]{3,}__", t)
    if sobra: falha(f"{f.name}: placeholder sobrando {sobra}")
    for u in re.findall(r"https?://[^\s'\"`)<>]+", t):
        if not any(u.startswith(p) for p in PERMITIDOS) and "w3.org/2000/svg" not in u:
            falha(f"{f.name}: URL externa {u}")
    if re.search(r"sb_secret_|service_role|eyJ[A-Za-z0-9_-]{40,}", t): falha(f"{f.name}: possível chave secreta")
    if f.suffix == ".html" and re.search(r"\son[a-z]+\s*=", t): falha(f"{f.name}: evento inline (on*=) proibido pela CSP")
    if f.suffix == ".html" and re.search(r"<script(?![^>]*\bsrc=)[^>]*>", t): falha(f"{f.name}: script inline proibido pela CSP")
    if f.suffix == ".js":
        r = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True)
        if r.returncode: falha(f"{f.name}: {r.stderr.strip()[:300]}")
    if f.suffix == ".webmanifest": json.loads(t)
idx = (PUB / "index.html").read_text(encoding="utf-8")
if 'rel="icon"' not in idx: falha("favicon ausente")
for nome, _, _ in ALVOS:
    if not (PUB / nome).exists(): falha(f"{nome} não gerado")

# ---------- Prévia em arquivo único (para abrir no celular sem servidor) ----------
import base64
PREV = RAIZ / "previa"; PREV.mkdir(exist_ok=True)
idx = (PUB / "index.html").read_text(encoding="utf-8")
corpo = idx[idx.index("<body>") + 6: idx.index("</body>")]
for nome in re.findall(r'<script src="([^"?]+)\?v=[^"]*"></script>', corpo):
    js_ = (PUB / nome).read_text(encoding="utf-8")
    if nome == "config.js": js_ = js_.replace("intervaloListaMs: 8000", "intervaloListaMs: 8000,\n  navInterna: true")
    corpo = re.sub(r'<script src="' + re.escape(nome) + r'\?v=[^"]*"></script>', lambda m: "<script>\n" + js_.replace("</script", "<\\/script") + "\n</script>", corpo)
fav = base64.b64encode((PUB / "icone-32.png").read_bytes()).decode()
unico = (f'<title>{APP_NOME}</title>\n<meta name="theme-color" content="#003D7C">\n'
         f'<link rel="icon" type="image/png" href="data:image/png;base64,{fav}">\n'
         f'<style>\n{(PUB / "styles.css").read_text(encoding="utf-8")}\n</style>\n{corpo}')
if 'src="' in re.sub(r"<script>.*?</script>", "", unico, flags=re.S): falha("prévia única ainda referencia arquivo externo")
(PREV / "araguaia-connect-previa.html").write_text(unico, encoding="utf-8")
print(f"Prévia em arquivo único: previa/araguaia-connect-previa.html ({len(unico)/1024:.0f} KB)")

tam = sum(p.stat().st_size for p in PUB.iterdir())
print(f"Montado em public/ · versão {VERSAO} · modo {'SUPABASE ' + URL if URL else 'PRÉVIA (dados simulados)'} · {tam/1024:.0f} KB")
if ERROS:
    print("FALHOU:"); [print(" -", e) for e in ERROS]; sys.exit(1)
print("Validações OK: placeholders, node --check, URLs externas, segredos, CSP, favicon, ícones.")
