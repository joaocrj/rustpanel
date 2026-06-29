# =============================================================
# RustPanel - Deploy direto na VPS (sem GitHub Actions)
# Execute este script na VPS (Hostinger)
# =============================================================

set -e

REPO_DIR="/opt/rustpanel"
REPO_URL="https://github.com/joaocrj/rustpanel.git"
STACK_NAME="rustpanel"
SERVICE_AGENT="rustpanel_agent"

echo ""
echo "============================================"
echo "  RustPanel - Deploy VPS"
echo "============================================"
echo ""

# 1. Pull do código mais recente
echo "[1/3] Atualizando código..."
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
echo "[2/3] Build da imagem do Agent..."
cd "$REPO_DIR/agent"
docker build \
    -t ghcr.io/joaocrj/rustpanel-agent:latest \
    .

echo "  Imagem do Agent criada: ghcr.io/joaocrj/rustpanel-agent:latest"

# 3. Atualizar os serviços no Docker Swarm
echo ""
echo "[3/3] Atualizando serviços no Docker Swarm..."
docker service update \
    --force \
    --image ghcr.io/joaocrj/rustpanel-agent:latest \
    "$SERVICE_AGENT"

echo ""
echo "============================================"
echo "  DEPLOY CONCLUIDO!"
echo "============================================"
echo ""
echo "Para monitorar os logs do Agent:"
echo "  docker service logs $SERVICE_AGENT -f --tail 30"
echo ""
echo "Para verificar o status dos serviços:"
echo "  docker service ps $SERVICE_AGENT"
echo ""
