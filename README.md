# 🛡️ RustPanel

**Sistema de Monitoramento e Gerenciamento de Usuários RustDesk**

[![RustDesk](https://img.shields.io/badge/RustDesk-Server%20OSS-blue)](https://rustdesk.com)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-green)](https://supabase.com)
[![React](https://img.shields.io/badge/React-Frontend-61DAFB)](https://react.dev)
[![Docker Swarm](https://img.shields.io/badge/Docker-Swarm-2496ED)](https://docker.com)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org)
[![Rust](https://img.shields.io/badge/Rust-2021-orange)](https://rust-lang.org)

---

## 📋 Visão Geral

RustPanel é uma plataforma administrativa completa para monitorar e gerenciar dispositivos conectados ao seu servidor privado **RustDesk OSS**. O sistema captura dados em tempo real dos logs do RustDesk (HBBS/HBBR), processa via agentes dedicados e apresenta tudo em uma interface web moderna com Supabase como backend.

**URL de Produção:** `https://rustpanel.joaocrj.com.br`  
**Registro Docker:** `ghcr.io/joaocrj/rustpanel-frontend`, `ghcr.io/joaocrj/rustpanel-agent`, `ghcr.io/joaocrj/rustpanel-udp-capture`

### 🎯 Funcionalidades Principais

| Módulo | Descrição | Status |
|--------|-----------|--------|
| **📊 Dashboard** | Métricas em tempo real (peers online/offline/banned, sessões ativas, duração média, última atividade) | ✅ Completo |
| **👥 Gestão de Peers** | Tabela completa com busca, filtro por status, paginação, edição de alias, banimento direto | ✅ Completo |
| **🔗 Sessões Ativas** | Grid de sessões relay em tempo real com IPs público/local, uptime, exportação CSV/XLSX | ✅ Completo |
| **🚫 Banimentos** | CRUD completo de bans com motivo/observações, desbanimento, auditoria, exportação | ✅ Completo |
| **📝 Auditoria** | Log imutável de todas ações admin (login, ban, unban, update, export) com paginação e filtro | ✅ Completo |
| **📤 Exportação** | CSV e XLSX para peers, sessões, bans, auditoria (apenas Super Admin/Admin) | ✅ Completo |
| **🔐 Autenticação** | Supabase Auth com 3 roles (Super Admin, Admin, Operador), RLS por role, auto-profile creation | ✅ Completo |
| **⚡ Realtime** | Supabase Realtime nas tabelas `peers`, `sessions`, `bans` — sem polling | ✅ Completo |
| **🛡️ UDP Capture** | Captura de pacotes UDP `update_pk` do HBBS em Rust (pnet) — descoberta de peers sem logs | ✅ Completo |

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet                                  │
│                   rustpanel.joaocrj.com.br                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (Traefik + TLS Let's Encrypt)
┌────────────────────────────┴────────────────────────────────────┐
│                      Docker Swarm                                │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ rustpanel-       │  │ rustpanel-       │  │ rustpanel-    │  │
│  │ frontend         │  │ agent            │  │ udp-capture   │  │
│  │ (React/Nginx)    │  │ (Node.js/TS)     │  │ (Rust/pnet)   │  │
│  │ Port: 80         │  │ Docker API +     │  │ host network  │  │
│  │                  │  │ SQLite (ro)      │  │ CAP_NET_RAW   │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           │                    │                    │           │
│           │         ┌──────────┴──────────┐       │           │
│           │         ▼                     ▼       ▼           │
│  ┌────────┴──────────────────────────────────────────────┐    │
│  │           RustDesk Server (HBBS + HBBR)               │    │
│  │  ┌─────────────────┐  ┌──────────────────────────┐   │    │
│  │  │ hbbs (21115-    │  │ hbbr (21116-21119)       │   │    │
│  │  │  21116)         │  │ Relay server             │   │    │
│  │  │ ID/Rendezvous   │  │ Logs: relay_request,     │   │    │
│  │  │ Logs: update_pk │  │ relay_paired, closed     │   │    │
│  │  │ peer_register   │  │                          │   │    │
│  │  └─────────────────┘  └──────────────────────────┘   │    │
│  │  SQLite: /data/db_v2.sqlite3 (peer table)             │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST + Realtime (WebSocket)
┌────────────────────────────┴────────────────────────────────────┐
│                      Supabase (Cloud)                            │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │PostgreSQL│  │  Auth    │  │ Realtime  │  │ Edge Funcs   │  │
│  │(peers,   │  │(email/   │  │(peers,    │  │(futuro:      │  │
│  │sessions, │  │ password,│  │ sessions, │  │  webhooks,   │  │
│  │bans,     │  │ OAuth,   │  │ bans)     │  │  notificações)│  │
│  │audit,    │  │ 3 roles) │  │           │  │              │  │
│  │agent_st) │  │          │  │           │  │              │  │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```