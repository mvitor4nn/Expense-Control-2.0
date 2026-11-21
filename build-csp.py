#!/usr/bin/env python3
"""Gera a Content-Security-Policy do Expense Control e o arquivo _headers.

Rode SEMPRE depois de editar qualquer <script> inline de index.html, privacy.html ou terms.html:
    python3 tools/build-csp.py

O que faz:
  1. calcula o hash SHA-256 de cada <script> inline (sem 'unsafe-inline' para scripts);
  2. grava a <meta http-equiv="Content-Security-Policy"> em cada página (vale em qualquer hospedagem);
  3. escreve _headers (Netlify / Cloudflare Pages) com a mesma política + cabeçalhos que só
     existem como header HTTP (frame-ancestors, HSTS, Permissions-Policy, nosniff...).
Se supabase-sync.js tiver CFG.url preenchida, connect-src usa só esse host (mais restrito).
"""
import base64, hashlib, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ['index.html', 'privacy.html', 'terms.html']
INLINE = re.compile(r'<script(?![^>]*\ssrc=)[^>]*>(.*?)</script>', re.S | re.I)
META = re.compile(r'<meta http-equiv="Content-Security-Policy" content="[^"]*">\n?')


def sha(txt):
    return "'sha256-" + base64.b64encode(hashlib.sha256(txt.encode('utf-8')).digest()).decode() + "'"


def supabase_host():
    try:
        t = (ROOT / 'supabase-sync.js').read_text(encoding='utf-8')
        m = re.search(r"CFG=\{url:'(https://[A-Za-z0-9.-]+)'", t)
        return m.group(1) if m else None
    except OSError:
        return None


def policy_app(hashes):
    sb = supabase_host()
    conn = ["'self'", sb or 'https://*.supabase.co']
    if not sb:
        conn.append('wss://*.supabase.co')
    else:
        conn.append(sb.replace('https://', 'wss://'))
    conn += ['https://www.googleapis.com', 'https://accounts.google.com']
    return '; '.join([
        "default-src 'self'",
        "script-src 'self' " + ' '.join(hashes) + ' https://cdn.jsdelivr.net https://accounts.google.com',
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        "media-src 'self' blob: data:",
        'connect-src ' + ' '.join(conn),
        'frame-src https://accounts.google.com',
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ])


def policy_legal(hashes):
    return '; '.join([
        "default-src 'none'",
        "script-src " + ' '.join(hashes),
        "style-src 'unsafe-inline'",
        "img-src 'self' data:",
        "base-uri 'none'",
        "form-action 'none'",
    ])


def main():
    per = {}
    for name in PAGES:
        f = ROOT / name
        txt = f.read_text(encoding='utf-8')
        per[name] = (f, txt, [sha(b) for b in INLINE.findall(txt)])
    union = []
    for _, _, h in per.values():
        for x in h:
            if x not in union:
                union.append(x)
    for name, (f, txt, hashes) in per.items():
        pol = policy_app(hashes) if name == 'index.html' else policy_legal(hashes)
        tag = '<meta http-equiv="Content-Security-Policy" content="%s">\n' % pol
        if META.search(txt):
            txt = META.sub(lambda m: tag, txt, count=1)
        else:
            txt = re.sub(r'(<meta charset="utf-8">\n)', lambda m: m.group(1) + tag, txt, count=1)
        f.write_text(txt, encoding='utf-8')
        print('%-14s %d script(s) inline com hash' % (name, len(hashes)))
    hdr_policy = policy_app(union) + "; frame-ancestors 'none'"
    headers = """# Gerado por tools/build-csp.py (não edite à mão). Netlify e Cloudflare Pages leem este arquivo.
/*
  Content-Security-Policy: %s
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  X-Frame-Options: DENY

/sw.js
  Cache-Control: no-cache
""" % hdr_policy
    (ROOT / '_headers').write_text(headers, encoding='utf-8')
    print('_headers escrito')


if __name__ == '__main__':
    sys.exit(main())
