# 🛡️ RustPanel - Guia de Instalação

## Pré-requisitos

| Componente | Versão Mínima | Verificar |
|-----------|---------------|-----------|
| Node.js | 20+ | `node --version` |
| Docker | 24+ | `docker --version` |
| Docker Swarm | Ativado | `docker node ls` |
| Traefik | v2/v3 | Rodando no Swarm |
| Conta Supabase | — | https://supabase.com |
| RustDesk Server | OSS latest | `docker ps \| grep hbbs` |

---

## Passo 1: Criar Projeto Supabase

1. Acesse [https://supabase.com](https://supabase.com)
2. Crie uma nova organização chamada **RustDesk** (ou use uma existente)
3. Crie um novo projeto chamado **RustPanel**
4. Escolha a região mais próxima (ex: São Paulo)
5. Defina uma senha forte para o banco de dados
6. Aguarde a criação do projeto (~2 minutos)

### Obter credenciais

Acesse **Project Settings → API** e anote:

| Credencial | Uso |
|-----------|-----|
| **Project URL** | `VITE_SUPABASE_URL` e `SUPABASE_URL` |
| **anon public key** | `VITE_SUPABASE_ANON_KEY` |
| **service_role secret key** | `SUPABASE_SERVICE_ROLE_KEY` (⚠️ nunca expor no frontend) |

### Executar migration

1. Acesse **SQL Editor** no painel do Supabase
2. Copie o conteúdo de `deploy/supabase/001_initial_schema.sql`
3. Cole no editor e clique **Run**
4. Verifique que todas as tabelas foram criadas em **Table Editor**

### Tabelas esperadas:
- `profiles`
- `peers`
- `sessions`
- `bans`
- `audit_logs`
- `agent_state`

### Criar primeiro usuário

1. Acesse **Authentication → Users**
2. Clique **Add User → Create New User**
3. Informe email e senha
4. O primeiro usuário receberá automaticamente o role `super_admin`

---

## Passo 2: Configurar Repositório (Opcional - GitHub)

```bash
# Na sua máquina de desenvolvimento
cd rustpanel
git init
git add .
git commit -m "feat: initial project structure"

# Criar repo no GitHub e adicionar remote
git remote add origin https://github.com/joaocrj/rustpanel.git
git branch -M main
git push -u origin main

# Criar branch develop
git checkout -b develop
git push -u origin develop
```

---

## Passo 3: Build das Imagens Docker

### Frontend

```bash
cd frontend

# Build da imagem (no Windows PowerShell, use crase ` no lugar de \ para quebra de linha)
docker build --build-arg VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=SUA-ANON-KEY -t ghcr.io/SEU-USUARIO/rustpanel-frontend:latest .
```

### Agent

```bash
cd agent

# Instalar dependências primeiro
npm install

# Build da imagem
docker build -t ghcr.io/joaocrj/rustpanel-agent:latest .
```

### Push para Registry (usando GitHub Container Registry)

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u joaocrj --password-stdin

docker push ghcr.io/joaocrj/rustpanel-frontend:latest
docker push ghcr.io/joaocrj/rustpanel-agent:latest
```

---

## Passo 4: Deploy no Docker Swarm

### 4.1 Verificar redes existentes

```bash
# Deve existir a rede do Traefik (ajuste o nome se for diferente de traefik_public)
docker network ls | grep traefik_public

# Se não existir:
docker network create --driver overlay --attachable traefik_public
```

### 4.2 Criar arquivo .env no servidor

```bash
# No servidor VPS, crie o arquivo de ambiente
cat > /opt/rustpanel/.env << 'EOF'
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA-SERVICE-ROLE-KEY
HBBS_CONTAINER_NAME=hbbs
HBBR_CONTAINER_NAME=hbbr
EOF
```

### 4.3 Deploy via Docker Stack

```bash
cd deploy

# Carregar variáveis
export $(cat /opt/rustpanel/.env | xargs)

# Deploy
docker stack deploy -c stack.yml rustpanel
```

### 4.4 Deploy via Portainer

1. Acesse seu Portainer
2. Vá em **Stacks → Add Stack**
3. Nome: `rustpanel`
4. Cole o conteúdo de `deploy/stack.yml`
5. Adicione as variáveis de ambiente:
   - `SUPABASE_URL` (ex: https://SEU-PROJETO.supabase.co)
   - `SUPABASE_SERVICE_ROLE_KEY` (sua service role key obtida do Supabase)
   - `HBBS_CONTAINER_NAME` (opcional, padrão: `hbbs`)
   - `HBBR_CONTAINER_NAME` (opcional, padrão: `hbbr`)
6. Clique **Deploy the stack**

---

## Passo 5: Verificar Deploy

```bash
# Verificar serviços
docker service ls | grep rustpanel

# Logs do frontend
docker service logs rustpanel_frontend --tail 20

# Logs do agent
docker service logs rustpanel_agent --tail 20 -f
```

### Verificar no navegador

Acesse `https://rustpanel.joaocrj.com.br`

Você deverá ver a tela de login. Use o email/senha criados no Passo 1.

---

## Passo 6: Configurar RustDesk para Relay Total (Recomendado)

Para rastrear **todas** as sessões (não apenas relay), configure o HBBS:

```yaml
# No docker-compose/stack do RustDesk, adicione ao hbbs:
environment:
  - ALWAYS_USE_RELAY=Y
```

> ⚠️ Isso fará com que todas as conexões passem pelo relay (HBBR), aumentando o uso de bandwidth mas permitindo rastreamento completo de sessões.

---

## Troubleshooting

### Agent não conecta ao Docker

```bash
# Verificar que o socket está montado corretamente
docker exec -it $(docker ps -q -f name=rustpanel_agent) ls -la /var/run/docker.sock
```

### Agent não encontra db_v2.sqlite3

```bash
# Verificar o volume
docker exec -it $(docker ps -q -f name=rustpanel_agent) ls -la /data/

# O arquivo db_v2.sqlite3 deve existir
```

### Frontend retorna 502

```bash
# Verificar se o container está rodando
docker service ps rustpanel_frontend

# Verificar logs do Traefik
docker service logs traefik_traefik --tail 50
```

### Supabase Realtime não funciona

Verifique no Supabase Dashboard:
1. **Database → Replication** — as tabelas `peers`, `sessions`, `bans` devem estar publicadas
2. **Settings → API** — Realtime deve estar habilitado
