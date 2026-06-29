# 🗑️ Processo de Remoção do rustpanel-udp-capture

## Data: 2026-06-28
## Autor: JoaoCRJ

---

## 🔍 Motivo da Remoção
- **VPS Hostinger OpenVZ** não suporta `CAP_NET_RAW` nem módulo `af_packet` do kernel
- Tentativa de deploy standalone falhou pelos mesmos motivos
- Consumia **~700MB+** no repositório Git com artefatos de build (`target`)
- Obrigava a complicar scripts de CI/CD com flag `BUILD_UDP_CAPTURE=false`

---

## 🧹 Comando de Remoção

```bash
cd d:\AI\RustPanel
rmdir /s /q rustpanel-udp-capture
```

### Artefatos removidos:
- `/rustpanel-udp-capture/` diretório completo (**~700MB**)
- Dockerfile + Cargo.toml + código fonte
- Pasta `target` com builds em /target/release (**~500MB**)
- Artefatos de compilação Rust

---

## 🔄 Arquivos Atualizados

| Arquivo | Alteração | Razão |
|--------|---------|------|
| `build-and-push.sh` | Removido opção `udp-capture` | Simplificar CI/CD |
| `deploy-vps.sh` | Removido build udp-capture | Script deploy cleanup |
| `deploy/stack.yml` | Removido serviço udp-capture | Limpar infra as code |
| `README.md` | Removido menção udp-capture | Documentação atualizada |
| `ESTADO_IMPLEMENTACAO.md` | Removido módulo udp-capture | Estado consistente |
| `PROBLEMAS_E_SOLUCOES.md` | Add seção "Tentativa abandonada" | Documentar aprendizagem |

---

## ♻️ Ganhos

| Métrica | Antes | Depois |
|--------|------|-------|
| Tamanho repositório | ~1.2GB | ~500MB |
| Complexidade CI/CD | Alta (flag + condicional) | Baixa (build só agent+frontend) |
| Scripts de deploy | Complexos | Simples |
| Compatibilidade VPS | Falha OpenVZ | Full compatibilidade |

---

## ✅ Solução Alternativa
- **Backfill HBBS aumentado** para 24h/50k linhas
- **IP Map persistido a cada 60s** no `agent_state`
- **Heurística multi-peer NAT** via `getMostRecentPeerFromIds`

Resultado: resiliência igual mas **sem dependências hard** como `AF_PACKET`

---

## 📚 Comando para limpar repositório local

Após git pull com remoção:
```bash
git rm -r --cached rustpanel-udp-capture
git clean -fd
ccleaner /git      # Limpa cache git obsoleto
```