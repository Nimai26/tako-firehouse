#!/usr/bin/env python3
"""Passerelle Scrapling parlant le protocole FlareSolverr.

Pourquoi une passerelle plutôt que réécrire les providers : Tako est en Node, Scrapling
en Python. Les **10 providers** (bedetheque, coleka, playmobil, lego, myfigurecollection,
transformerland, luluberlu, jvc, amazon, paninimania) parlent déjà le protocole
FlareSolverr. En le réimplémentant à l'identique, **aucun d'eux ne change** : il suffit
de pointer `FSR_URL` ici, et le repli consiste à le repointer sur FlareSolverr.

Ce qu'on y gagne (mesuré le 27/08) :
- **12× plus rapide** sur les cibles courantes (Bedetheque 0,2 s contre 1,3 s) ;
- **aucun Chromium** en mode rapide — l'en-tête de `FlareSolverrClient.js` rappelle
  qu'un navigateur par session a déjà mené à « 301 Chromium = 960 % CPU ».

Cascade identique à celle de `web_fetch` : rapide → furtif → (repli FlareSolverr si
configuré). Chaque étage n'est tenté que si le précédent a rendu une page de
vérification — un HTTP 200 ne prouve rien, et une page de 2 Ko de scripts au texte
vide non plus.
"""

from __future__ import annotations

import logging
import os
import re
import time
import uuid

import httpx
from fastapi import FastAPI, Request

# Scrapling écrit une ligne INFO par requête et crie « No Cloudflare challenge found »
# en ERREUR alors que la requête réussit.
logging.getLogger("scrapling").setLevel(logging.CRITICAL)

PORT = int(os.environ.get("SCRAPLING_GATEWAY_PORT", "8194"))
# Repli : FlareSolverr reste en dernier recours tant qu'on n'a pas éprouvé la passerelle
# en production. Vide = pas de repli.
FLARE = os.environ.get("SCRAPLING_GATEWAY_FLARE", "http://127.0.0.1:8191/v1")
# Mode furtif = un navigateur embarqué (~400 Mo d'image). Dans le conteneur de Tako on
# s'en passe : le mode rapide couvre la grande majorité des providers, et FlareSolverr —
# qui vit dans le MÊME réseau VPN — prend les cas durs. Sur l'hôte, il reste actif.
FURTIF = os.environ.get("SCRAPLING_GATEWAY_FURTIF", "1") not in ("0", "false", "no")

_LEURRES = ("just a moment", "checking your browser", "cf-browser-verification",
            "attention required", "enable javascript and then", "verifying you are human",
            "we need to verify that you're not a robot", "cf_chl_opt", "captcha-delivery",
            "px-captcha", "access denied", "robot check", "ddos protection")

app = FastAPI(title="Passerelle Scrapling (protocole FlareSolverr)")
_sessions: dict[str, float] = {}          # sessions simulées : Scrapling n'en a pas besoin
_stats = {"rapide": 0, "furtif": 0, "flaresolverr": 0, "echec": 0}


def _texte(html: str) -> str:
    h = re.sub(r"(?is)<(script|style|noscript|svg|head).*?</\1>", " ", html or "")
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    return re.sub(r"\s+", " ", h).strip()


def _est_leurre(html: str) -> bool:
    """Page de vérification, ou coquille vide. Juge le TEXTE, pas le HTML brut."""
    if not html:
        return True
    if any(m in html[:20000].lower() for m in _LEURRES):
        return True
    if len(html) < 1500:
        return True
    return len(_texte(html)[:4000]) < 200


def _corps(page) -> str:
    b = getattr(page, "body", "") or ""
    return b.decode("utf-8", "replace") if isinstance(b, (bytes, bytearray)) else b


def _scrapling(url: str, timeout: int, furtif: bool, proxy: str = "",
               post: dict | None = None):
    try:
        from scrapling.fetchers import Fetcher, StealthyFetcher
    except ImportError:
        return None
    kw: dict = {}
    if proxy:
        kw["proxy"] = proxy
    try:
        if furtif:
            p = StealthyFetcher.fetch(url, headless=True, solve_cloudflare=True,
                                      block_webrtc=True, timeout=timeout * 1000, **kw)
        elif post is not None:
            p = Fetcher.post(url, data=post, timeout=timeout, **kw)
        else:
            p = Fetcher.get(url, timeout=timeout, **kw)
        return _corps(p), int(getattr(p, "status", 0) or 0)
    except Exception:  # noqa: BLE001
        return None


def _flaresolverr(cmd: dict):
    if not FLARE:
        return None
    try:
        j = httpx.post(FLARE, json=cmd, timeout=cmd.get("maxTimeout", 60000) / 1000 + 15).json()
        if j.get("status") != "ok":
            return None
        sol = j.get("solution", {})
        return sol.get("response", ""), int(sol.get("status") or 0)
    except Exception:  # noqa: BLE001
        return None


@app.post("/v1")
async def v1(request: Request):
    b = await request.json()
    cmd = (b.get("cmd") or "").strip()

    # ── sessions : simulées. Scrapling n'ouvre pas de navigateur persistant, mais les
    # providers appellent create/destroy et attendent un identifiant.
    if cmd == "sessions.create":
        sid = b.get("session") or str(uuid.uuid4())
        _sessions[sid] = time.time()
        return {"status": "ok", "message": "Session created successfully", "session": sid}
    if cmd == "sessions.destroy":
        _sessions.pop(b.get("session") or "", None)
        return {"status": "ok", "message": "The session has been removed."}
    if cmd == "sessions.list":
        return {"status": "ok", "sessions": list(_sessions)}

    if cmd not in ("request.get", "request.post"):
        return {"status": "error", "message": f"commande inconnue : {cmd}"}

    url = b.get("url") or ""
    if not url.startswith("http"):
        return {"status": "error", "message": "url invalide"}
    timeout = max(10, int(b.get("maxTimeout", 60000)) // 1000)
    proxy = ((b.get("proxy") or {}).get("url") or "") if isinstance(b.get("proxy"), dict) else ""
    post = b.get("postData") if cmd == "request.post" else None
    if isinstance(post, str):                     # FlareSolverr accepte du form-urlencoded
        from urllib.parse import parse_qs
        post = {k: v[0] for k, v in parse_qs(post).items()}

    t0 = time.time()
    etages = [("rapide", lambda: _scrapling(url, timeout, False, proxy, post))]
    if FURTIF:
        etages.append(("furtif", lambda: _scrapling(url, min(timeout, 90), True, proxy)))
    etages.append(("flaresolverr", lambda: _flaresolverr(b)))
    for nom, tenter in etages:
        r = tenter()
        if r is None:
            continue
        html, status = r
        if _est_leurre(html):
            continue
        _stats[nom] += 1
        return {"status": "ok", "message": f"servi par {nom}",
                "startTimestamp": int(t0 * 1000), "endTimestamp": int(time.time() * 1000),
                "solution": {"url": url, "status": status or 200, "response": html,
                             "cookies": [], "userAgent": "", "headers": {}},
                "via": nom}

    _stats["echec"] += 1
    return {"status": "error", "message": "aucun moyen n'a rendu la page (rapide, furtif, repli)"}


@app.get("/health")
def health():
    return {"ok": True, "service": "passerelle Scrapling", "port": PORT,
            "mode_furtif": FURTIF, "repli_flaresolverr": FLARE or None,
            "sessions": len(_sessions), "servis": dict(_stats)}


if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0 dans un conteneur (le réseau est déjà cloisonné par Docker) ; 127.0.0.1
    # sur l'hôte, pour ne rien exposer.
    hote = os.environ.get("SCRAPLING_GATEWAY_HOST", "127.0.0.1")
    uvicorn.run(app, host=hote, port=PORT, log_level="warning")
