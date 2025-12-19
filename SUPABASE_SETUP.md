# Integração Supabase - Guia de Configuração

## 📋 O QUE FOI FEITO

A aplicação foi configurada para usar **Supabase (free tier)** como banco de dados externo persistente. Todo o código de integração está versionado no GitHub, mas as credenciais ficam seguras em Replit Secrets.

---

## 🔐 VARIÁVEIS NECESSÁRIAS EM REPLIT SECRETS

Você precisa adicionar **2 variáveis de ambiente** em Replit Secrets:

### 1. `SUPABASE_URL`
- **O que é**: URL da sua instância Supabase
- **Exemplo**: `https://seu-projeto.supabase.co`
- **Onde encontrar**: Dashboard Supabase → Project Settings → API

### 2. `SUPABASE_ANON_KEY`
- **O que é**: Chave anonimato pública do Supabase
- **Exemplo**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Onde encontrar**: Dashboard Supabase → Project Settings → API

### 3. `DATABASE_URL`
- **O que é**: String de conexão PostgreSQL do Supabase
- **Formato**: `postgresql://postgres:password@db.seu-projeto.supabase.co:5432/postgres`
- **Onde encontrar**: 
  1. Dashboard Supabase → Project Settings → Database
  2. Copie a string de conexão (URI)
  3. Cole em Replit Secrets

---

## 🗄️ COMO CRIAR NO SUPABASE (Free Tier)

1. **Acesse** [supabase.com](https://supabase.com)
2. **Sign Up** (cadastre-se)
3. **Create Project** (criar novo projeto)
4. **Nome**: `portfolio-tracker` (ou qualquer nome)
5. **Region**: Escolha a mais próxima (ex: `us-east-1`)
6. **Database Password**: Crie uma senha forte (será usada em DATABASE_URL)
7. **Create Project**
8. Aguarde 2-3 minutos o projeto ser criado
9. Vá em **Settings → API** para pegar `SUPABASE_URL` e `SUPABASE_ANON_KEY`
10. Vá em **Settings → Database** para pegar `DATABASE_URL`

---

## 🎯 ARQUIVOS MODIFICADOS/CRIADOS

### ✅ CRIADOS
- `server/supabase.ts` - Cliente Supabase com inicialização
- `SUPABASE_SETUP.md` - Este arquivo

### ✅ MODIFICADOS
- `server/db.ts` - Agora usa `postgres-js` com DATABASE_URL do Supabase
- `.env.example` - Adicionadas variáveis Supabase
- `server/index.ts` - Adicionada inicialização Supabase no startup

### ✅ NÃO MODIFICADOS
- `shared/schema.ts` - Mesmo schema funciona com Supabase
- `server/storage.ts` - Mesmo interface de armazenamento
- `server/routes.ts` - Mesmo endpoints funcionam
- Frontend - Sem mudanças

---

## 🚀 FLUXO DE DADOS AGORA

```
Frontend (React)
    ↓
Express API (server/routes.ts)
    ↓
Drizzle ORM (server/storage.ts)
    ↓
PostgreSQL no Supabase (DATABASE_URL)
    ↓
Dados persistem na nuvem
```

---

## 🔑 SEGURANÇA

✅ **Credenciais SEGURAS**
- `SUPABASE_URL` → Replit Secrets (não vai pro GitHub)
- `SUPABASE_ANON_KEY` → Replit Secrets (não vai pro GitHub)
- `DATABASE_URL` → Replit Secrets (não vai pro GitHub)

✅ **Código VERSIONADO**
- Toda lógica de integração está em `server/supabase.ts`
- Toda lógica está no GitHub
- Senhas SEMPRE com bcrypt hash

---

## ✅ PRÓXIMOS PASSOS

1. **Crie conta no Supabase**: [supabase.com](https://supabase.com)
2. **Crie projeto** (free tier)
3. **Copie as 3 credenciais** (SUPABASE_URL, SUPABASE_ANON_KEY, DATABASE_URL)
4. **Adicione em Replit Secrets**
5. **Reinicie o app** (npm run dev)
6. **Pronto!** Tudo funciona automaticamente

---

## 🧪 COMO TESTAR

1. Inicie o app: `npm run dev`
2. Veja logs: `✓ Supabase connection successful`
3. Crie um investimento (POST /api/assets)
4. Verifique no Dashboard Supabase → Table Editor → assets
5. Dados aparecem lá!

---

## ❓ TROUBLESHOOTING

**Erro: "Missing Supabase credentials"**
- Verifique se adicionou SUPABASE_URL e SUPABASE_ANON_KEY em Replit Secrets
- Reinicie o app

**Erro: "Failed to initialize Supabase"**
- Verifique se DATABASE_URL está correto
- Verifique se o projeto Supabase está ativo

**Conexão lenta**
- Pode ser a região Supabase → Replit
- Escolha a região mais próxima ao criar projeto

---

## 📚 REFERÊNCIAS

- [Supabase Docs](https://supabase.com/docs)
- [Drizzle with PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)
- [postgres-js Client](https://github.com/pgsql/postgres)
