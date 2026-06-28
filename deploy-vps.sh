#!/bin/bash
# =============================================================
# RustPanel - Deploy direto na VPS (sem GitHub Actions)
# Execute este script na VPS (Hostinger)
# =============================================================

set -e

REPO_DIR="/opt/rustpanel"
REPO_URL="https://github.com/joaocrj/rustpanel.git"
STACK_NAME="rustpanel"
SERVICE_AGENT="rustpanel_agent"
SERVICE_UDP_CAPTURE="rustpanel_udp-capture"

echo ""
echo "============================================"
echo "  RustPanel - Deploy VPS"
echo "============================================"
echo ""

# 1. Pull do código mais recente
echo "[1/4] Atualizando código..."
if [ -d "$REPO_DIR/.git" ]; then
    cd "$REPO_DIR"
    git pull origin main
else
    mkdir -p "$REPO_DIR"
    git clone "$REPO_URL" "$REPO_DIR"
    cd "$REPO_DIR"
fi

echo "  Commit atual: $(git rev-parse --short HEAD)"

# 2. Build da imagem do Agent
echo ""
echo "[2/4] Build da imagem do Agent..."
cd "$REPO_DIR/agent"
docker build \
    -t ghcr.io/joaocrj/rustpanel-agent:latest \
    .

echo "  Imagem do Agent criada: ghcr.io/joaocrj/rustpanel-agent:latest"

# 3. Build da imagem do UDP Capture
echo ""
echo "[3/4] Build da imagem do UDP Capture..."
cd "$REPO_DIR/rustpanel-udp-capture"
docker build \
    -t ghcr.io/joaocrj/rustpanel-udp-capture:latest \
    .

echo "  Imagem do UDP Capture criada: ghcr.io/joaocrj/rustpanel-udp-capture:latest"

# 4. Atualizar os serviços no Docker Swarm
echo ""
echo "[4/4] Atualizando serviços no Docker Swarm..."
docker service update \
    --force \
    --image ghcr.io/joaocrj/rustpanel-agent:latest \
    "$SERVICE_AGENT"

docker service update \
    --force \
    --image ghcr.io/joaocrj/rustpanel-udp-capture:latest \
    "$SERVICE_UDP_CAPTURE"

echo ""
echo "============================================"
echo "  DEPLOY CONCLUIDO!"
echo "============================================"
echo ""
echo "Para monitorar os logs do Agent:"
echo "  docker service logs $SERVICE_AGENT -f --tail 30"
echo ""
echo "Para monitorar os logs do UDP Capture:"
echo "  docker service logs $SERVICE_UDP_CAPTURE -f --tail 30"
echo ""
echo "Para verificar o status dos serviços:"
echo "  docker service ps $SERVICE_AGENT"
echo "  docker service ps $SERVICE_UDP_CAPTURE"
echo ""
