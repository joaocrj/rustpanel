# =============================================================
# RustPanel - Build & Push para GHCR (linux/amd64)
# Execute este script no diretório d:\AI\RustPanel
# =============================================================
#
# Pré-requisitos:
#   - Docker Desktop rodando
#   - Logado no GHCR: docker login ghcr.io -u joaocrj -p <PAT>
#
# Para gerar o PAT: github.com → Settings → Developer settings
#   → Personal access tokens → Tokens (classic)
#   → New token → marcar: write:packages, read:packages
# =============================================================

$ErrorActionPreference = "Stop"

$GHCR_USER = "joaocrj"
$AGENT_IMAGE = "ghcr.io/$GHCR_USER/rustpanel-agent:latest"
$FRONTEND_IMAGE = "ghcr.io/$GHCR_USER/rustpanel-frontend:latest"
$VITE_SUPABASE_URL = "https://lznygimwqxfvfcpqntag.supabase.co"
$VITE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6bnlnaW13cXhmdmZjcHFudGFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjI3MDksImV4cCI6MjA5NzY5ODcwOX0.Ct1L2LwB-Mhysg_SN7gfNUZ4Brdjt5XB-RNrUitVyy0"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  RustPanel - Build & Push to GHCR" -ForegroundColor Cyan
Write-Host "  Target: linux/amd64 (VPS compatible)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---- Verificar se está logado no GHCR ----
Write-Host "[1/4] Verificando login no GHCR..." -ForegroundColor Yellow
$loginCheck = docker system info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Docker Desktop nao esta rodando. Inicie o Docker Desktop e tente novamente." -ForegroundColor Red
    exit 1
}

# Testar se tem acesso ao GHCR
$testPull = docker manifest inspect ghcr.io/library/alpine 2>&1
Write-Host "Docker Desktop OK." -ForegroundColor Green

# ---- Garantir que o builder linux/amd64 existe ----
Write-Host ""
Write-Host "[2/4] Configurando buildx para linux/amd64..." -ForegroundColor Yellow

$builderExists = docker buildx ls 2>&1 | Select-String "rustpanel-builder"
if (-not $builderExists) {
    docker buildx create --name rustpanel-builder --driver docker-container --platform linux/amd64 --use
    Write-Host "Builder 'rustpanel-builder' criado." -ForegroundColor Green
} else {
    docker buildx use rustpanel-builder
    Write-Host "Builder 'rustpanel-builder' ja existe." -ForegroundColor Green
}

# ---- Build Agent ----
Write-Host ""
Write-Host "[3/4] Building Agent (linux/amd64)..." -ForegroundColor Yellow
Write-Host "  Imagem: $AGENT_IMAGE" -ForegroundColor Gray
Write-Host ""

$agentDir = Join-Path $SCRIPT_DIR "agent"
docker buildx build `
    --platform linux/amd64 `
    --tag $AGENT_IMAGE `
    --push `
    --progress=plain `
    $agentDir

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERRO no build do Agent!" -ForegroundColor Red
    exit 1
}
Write-Host ""
Write-Host "Agent publicado com sucesso: $AGENT_IMAGE" -ForegroundColor Green

# ---- Build Frontend ----
Write-Host ""
Write-Host "[4/4] Building Frontend (linux/amd64)..." -ForegroundColor Yellow
Write-Host "  Imagem: $FRONTEND_IMAGE" -ForegroundColor Gray
Write-Host ""

$frontendDir = Join-Path $SCRIPT_DIR "frontend"
docker buildx build `
    --platform linux/amd64 `
    --tag $FRONTEND_IMAGE `
    --push `
    --progress=plain `
    --build-arg "VITE_SUPABASE_URL=$VITE_SUPABASE_URL" `
    --build-arg "VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY" `
    $frontendDir

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERRO no build do Frontend!" -ForegroundColor Red
    exit 1
}
Write-Host ""
Write-Host "Frontend publicado com sucesso: $FRONTEND_IMAGE" -ForegroundColor Green

# ---- Resumo ----
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  BUILD CONCLUIDO COM SUCESSO!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para atualizar na VPS, execute:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  docker service update --image $AGENT_IMAGE rustpanel_agent" -ForegroundColor White
Write-Host "  docker service update --image $FRONTEND_IMAGE rustpanel_frontend" -ForegroundColor White
Write-Host ""
Write-Host "Depois monitore os logs:" -ForegroundColor Yellow
Write-Host "  docker service logs rustpanel_agent -f --tail 30" -ForegroundColor White
Write-Host ""
