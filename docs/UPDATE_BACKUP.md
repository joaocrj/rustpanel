# 🔄 RustPanel - Guia de Atualização

## Atualização do Frontend

### 1. Build nova imagem

```bash
cd frontend
git pull origin main

docker build \
  --build-arg VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=SUA-ANON-KEY \
  -t ghcr.io/SEU-USUARIO/rustpanel-frontend:latest .

docker push ghcr.io/SEU-USUARIO/rustpanel-frontend:latest
```

### 2. Atualizar serviço

```bash
docker service update --image ghcr.io/SEU-USUARIO/rustpanel-frontend:latest rustpanel_frontend
```

Ou via Portainer: **Services → rustpanel_frontend → Update Service**.

---

## Atualização do Agent

```bash
cd agent
git pull origin main

docker build -t ghcr.io/SEU-USUARIO/rustpanel-agent:latest .
docker push ghcr.io/SEU-USUARIO/rustpanel-agent:latest

docker service update --image ghcr.io/SEU-USUARIO/rustpanel-agent:latest rustpanel_agent
```

---

## Atualização do Banco de Dados (Migrations)

Se houver novas migrations em `deploy/supabase/`:

1. Acesse **SQL Editor** no Supabase
2. Execute as novas migrations **em ordem numérica**
3. Verifique que as alterações foram aplicadas

> ⚠️ Sempre faça backup antes de executar migrations.

---

## Rollback

```bash
# Voltar à versão anterior do frontend
docker service update --rollback rustpanel_frontend

# Voltar à versão anterior do agent
docker service update --rollback rustpanel_agent
```

---

# 💾 RustPanel - Guia de Backup

## O que fazer backup

| Item | Método | Frequência |
|------|--------|-----------|
| Banco Supabase (PostgreSQL) | Supabase Dashboard ou pg_dump | Diário |
| RustDesk db_v2.sqlite3 | Cópia do arquivo | Diário |
| Variáveis de ambiente (.env) | Cópia segura | Quando alterar |
| Imagens Docker | Registry (ghcr.io) | Automático no push |

## Backup do Supabase

### Via Dashboard
1. Acesse **Project Settings → Database**
2. Clique **Download Backup**

### Via pg_dump
```bash
pg_dump -h db.SEU-PROJETO.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f backup_$(date +%Y%m%d).sql
```

## Backup do RustDesk Data

```bash
# Copiar db_v2.sqlite3
cp /opt/rustdesk/data/db_v2.sqlite3 /backups/rustdesk_db_$(date +%Y%m%d).sqlite3
```

## Restore

### Supabase
```bash
psql -h db.SEU-PROJETO.supabase.co -p 5432 -U postgres -d postgres < backup.sql
```

### RustDesk Data
```bash
# Parar o hbbs, copiar o backup, reiniciar
docker service scale rustdesk_hbbs=0
cp /backups/rustdesk_db_YYYYMMDD.sqlite3 /opt/rustdesk/data/db_v2.sqlite3
docker service scale rustdesk_hbbs=1
```
