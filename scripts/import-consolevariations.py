#!/usr/bin/env python3
"""
Import de l'archive ConsoleVariations dans la mega-DB (table consolevariations_items).

Le site consolevariations.com ayant refondu ses URLs (scraping live → 404), le provider
lit une ARCHIVE LOCALE pré-scrapée. Ce script (ré)importe cette archive dans Postgres.

Prérequis :
  1. La table existe (seed src/infrastructure/database/seeds/004_consolevariations_table.sql).
  2. L'archive est présente : <ARCHIVE>/_metadata.jsonl (+ img/).

Usage (depuis l'hôte, DB dans le conteneur tako_db) :
  python3 scripts/import-consolevariations.py            # archive par défaut
  ARCHIVE=/chemin/vers/consolevariations-archive python3 scripts/import-consolevariations.py

Le script génère un CSV puis le charge via `\copy` dans le conteneur tako_db.
"""
import json
import csv
import os
import subprocess
import sys

ARCHIVE = os.environ.get("ARCHIVE", "/mnt/storage/consolevariations-archive")
SRC = os.path.join(ARCHIVE, "_metadata.jsonl")
OUT = "/tmp/cv_import.csv"
DB_CONTAINER = os.environ.get("DB_CONTAINER", "tako_db")
DB_USER = os.environ.get("DB_USER", "tako")
DB_NAME = os.environ.get("DB_NAME", "tako_cache")

# accessoires / manettes : mots-clés dans le nom ; sinon « console » (majorité des variations)
ACC = ["memory card", "cable", "adapter", "adaptor", "headset", "stand", "remote", "charger",
       "battery", " case", "cover", " dock", "sensor", "mouse", "keyboard", "light gun",
       "lightgun", "accessor", "strap", "pouch"]
CTRL = ["controller", "gamepad", "joystick", "joypad"]


def derive_type(name: str, slug: str) -> str:
    s = f"{name} {slug}".lower()
    if any(k in s for k in CTRL):
        return "controller"
    if any(k in s for k in ACC):
        return "accessory"
    return "console"


def main() -> int:
    if not os.path.isfile(SRC):
        print(f"❌ archive introuvable : {SRC}", file=sys.stderr)
        return 1
    n = 0
    with open(SRC) as f, open(OUT, "w", newline="") as o:
        w = csv.writer(o)
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            slug = d.get("slug")
            if not slug:
                continue
            bc = d.get("breadcrumb") or []
            brand = d.get("brand") or (bc[1] if len(bc) > 1 else "")
            platform = bc[2] if len(bc) > 2 else ""
            props = d.get("props") or {}
            try:
                rs = int(d.get("rarity_score") or props.get("Rarity Score") or 0)
            except (TypeError, ValueError):
                rs = 0
            name = d.get("name") or ""
            w.writerow([
                slug, name, d.get("description") or "", brand, platform,
                derive_type(name, slug), rs,
                d.get("rarity_tier") or props.get("Rarity Tier") or "",
                d.get("image_main") or "",
                json.dumps(d.get("images") or [], ensure_ascii=False),
                json.dumps(bc, ensure_ascii=False),
                json.dumps(props, ensure_ascii=False),
                d.get("url") or "",
            ])
            n += 1
    print(f"CSV généré : {n} lignes")

    cols = ("slug,name,description,brand,platform,type,rarity_score,rarity_tier,"
            "image_main,images,breadcrumb,props,url")
    subprocess.run(["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
                    "-c", "TRUNCATE consolevariations_items;"], check=True)
    with open(OUT, "rb") as fh:
        subprocess.run(["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
                        "-c", f"\\copy consolevariations_items({cols}) FROM STDIN WITH (FORMAT csv)"],
                       stdin=fh, check=True)
    os.remove(OUT)
    print(f"✅ import terminé : {n} items dans consolevariations_items")
    return 0


if __name__ == "__main__":
    sys.exit(main())
