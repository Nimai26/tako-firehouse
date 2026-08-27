# Passerelle Scrapling parlant le protocole FlareSolverr.
# Image VOLONTAIREMENT légère : pas de navigateur embarqué. Le mode rapide couvre la
# grande majorité des providers (12× plus vite que FlareSolverr — mesuré le 27/08) ; les
# cibles dures partent au repli sur tako-flaresolverr, qui vit dans le MÊME réseau VPN.
FROM python:3.12-slim

WORKDIR /app
# curl : pour le healthcheck. Pas de navigateur, pas de dépendances graphiques.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "scrapling[fetchers]>=0.4" fastapi uvicorn httpx

COPY scrapling_gateway.py /app/

ENV SCRAPLING_GATEWAY_PORT=8195 \
    SCRAPLING_GATEWAY_HOST=0.0.0.0 \
    SCRAPLING_GATEWAY_FURTIF=0 \
    SCRAPLING_GATEWAY_FLARE=http://127.0.0.1:8191/v1

EXPOSE 8195
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fs http://127.0.0.1:8195/health || exit 1

CMD ["python", "scrapling_gateway.py"]
