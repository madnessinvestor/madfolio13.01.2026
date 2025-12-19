# 🚀 Quick Start - SQLite Local + Auto-Sync GitHub

## 1️⃣ Clone e Setup (RÁPIDO):

```bash
git clone seu-repo
cd seu-repo
npm install
npm run db:push
npm run dev
```

## 2️⃣ Pronto! ✅

Ao iniciar, você verá:
```
[DB-SYNC] ✓ Database synchronized
1:16:08 PM [express] serving on port 5000
```

Todos os dados anteriores carregam **AUTOMATICAMENTE**!

## 3️⃣ Dados Salvos Em:

- 📁 Localmente: `app.db` (SQLite)
- 💾 No GitHub: Histórico completo de commits
- ✅ Sincronizados automaticamente

## 🔄 O Que É Automático:

| Ação | O Que Acontece |
|------|----------------|
| Iniciar app | Sincroniza com Git ✅ |
| Salvar investimento | Auto-commit + push ✅ |
| Reload página | Carrega do app.db ✅ |
| Clone repo | Restaura todos os dados ✅ |

## 🎯 Próxima Ação:

Tudo está funcionando! Só execute `npm run db:push` se ainda não fez:

```bash
npm run db:push
```

---

**Tudo é automático! Basta usar normalmente. Os dados sempre estarão salvos! 🚀**
