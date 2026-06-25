# 🛡️ RustPanel

**Sistema de Monitoramento e Gerenciamento de Usuários RustDesk**

[![RustDesk](https://img.shields.io/badge/RustDesk-Server%20OSS-blue)](https://rustdesk.com)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-green)](https://supabase.com)
[![React](https://img.shields.io/badge/React-Frontend-61DAFB)](https://react.dev)
[![Docker Swarm](https://img.shields.io/badge/Docker-Swarm-2496ED)](https://docker.com)

---

## 📋 Visão Geral

RustPanel é uma plataforma administrativa para monitorar e gerenciar dispositivos conectados ao seu servidor privado RustDesk (OSS).

**URL de Produção:** `https://rustpanel.joaocrj.com.br`

### Funcionalidades

- 📊 **Dashboard** — Métricas em tempo real (peers online, sessões, atividade)
- 👥 **Gestão de Peers** — Tabela completa de dispositivos detectados
- 🔗 **Sessões Ativas** — Monitoramento em tempo real de conexões relay
- 🚫 **Banimentos** — Sistema de ban/unban com auditoria
- 📝 **Auditoria** — Log completo de ações administrativas
- 📤 **Exportação** — CSV e XLSX
- 🔐 **Autenticação** — Supabase Auth com perfis (Super Admin, Admin, Operador)
- ⚡ **Realtime** — Atualizações via Supabase Realtime (sem polling)

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────────┐
│                  Internet                     │
│          rustpanel.joaocrj.com.br             │
└──────────────────┬───────────────────────────┘
                   │ HTTPS (Traefik)
┌──────────────────┴───────────────────────────┐
│              Docker Swarm                     │
│  ┌─────────────────┐  ┌──────────────────┐   │
│  │  rustpanel-      │  │  rustpanel-      │   │
│  │  frontend        │  │  agent           │   │
│  │  (React/Nginx)   │  │  (Node.js)       │   │
│  └────────┬────────┘  └──┬──────┬────────┘   │
│           │              │      │             │
│           │         Docker API  SQLite (ro)   │
│           │              │      │             │
│  ┌────────┴──────────────┴──────┴────────┐   │
│  │     RustDesk Server (HBBS + HBBR)     │   │
│  └───────────────────────────────────────┘   │
└──────────────────┬───────────────────────────┘
                   │ REST + Realtime
┌──────────────────┴───────────────────────────┐
│           Supabase (Cloud)                    │
│   PostgreSQL · Auth · Realtime · Edge Fn      │
└──────────────────────────────────────────────┘
```

---

## 📁 Estrutura do Projeto

```
rustpanel/
├── frontend/          # React + Vite + TypeScript + shadcn/ui
├── agent/             # Node.js agent de monitoramento
├── deploy/            # Docker Swarm stack + configs
└── README.md
```

---

## 🚀 Quick Start

### Pré-requisitos

- Node.js 20+
- Docker + Docker Swarm
- Conta Supabase
- RustDesk Server OSS rodando

### Desenvolvimento Local

```bash
# Frontend
cd frontend
npm install
npm run dev

# Agent
cd agent
npm install
npm run dev
```

### Deploy (Docker Swarm)

```bash
cd deploy
docker stack deploy -c stack.yml rustpanel
```

---

### Scripts de Build e Deploy

| Script | Descrição |
|--------|------------|
| `build-and-push.sh` | Build e push das imagens Docker para GHCR (Bash, CI/CD) |
| `build-and-push.ps1` | Build e push das imagens Docker para registro (PowerShell) |
| `deploy-vps.sh` | Deploy automático da stack em VPS |

---

## 📄 Licença

Uso privado.
