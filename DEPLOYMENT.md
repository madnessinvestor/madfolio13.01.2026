# Deployment Guide - Portfolio Tracker

## 🚀 Quick Start - From GitHub

### Option 1: Replit (Recomendado)

1. **Clone no Replit**:
   - Vá em [replit.com](https://replit.com)
   - Clique em "Import from GitHub"
   - Cole a URL do seu repositório

2. **Configure o ambiente**:
   ```bash
   npm run setup-env
   # Insira suas credenciais Supabase quando solicitado
   ```

3. **Inicie o app**:
   ```bash
   npm run dev
   ```

4. **Acesse**: `https://seu-replit.repl.co`

---

### Option 2: Máquina Local / VPS

1. **Clone o repositório**:
   ```bash
   git clone <seu-repositorio>
   cd portfolio-tracker
   ```

2. **Instale dependências**:
   ```bash
   npm install
   ```

3. **Configure variáveis**:
   ```bash
   npm run setup-env
   # Ou edite .env manualmente
   ```

4. **Prepare o banco**:
   ```bash
   npm run db:push
   ```

5. **Inicie em desenvolvimento**:
   ```bash
   npm run dev
   ```

6. **Ou em produção**:
   ```bash
   npm run build
   npm start
   ```

---

### Option 3: Vercel / Heroku / Railway

1. **Build localmente para testar**:
   ```bash
   npm run build
   npm start
   ```

2. **Configure as variáveis no serviço**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `DATABASE_URL`
   - `NODE_ENV=production`
   - `PORT=5000`

3. **Deploy**:
   - Vercel: `vercel deploy`
   - Heroku: `git push heroku main`
   - Railway: Conecte seu GitHub

---

## 🔑 Configuração de Credenciais

### Passo 1: Criar projeto Supabase

1. Vá em [supabase.com](https://supabase.com)
2. Clique em "New Project"
3. Escolha um nome e locação
4. Deixe ativar "Database Password" (você vai precisar)

### Passo 2: Obter credenciais

**SUPABASE_URL**:
- Settings → API → Project URL

**SUPABASE_ANON_KEY**:
- Settings → API → Anon Key

**DATABASE_URL**:
- Settings → Database → Connection String (URI)
- Ou Settings → Database → Connection Pooling

### Passo 3: Configurar no seu app

```bash
# Interativo (recomendado)
npm run setup-env

# Ou manual
echo "SUPABASE_URL=https://..." >> .env
echo "SUPABASE_ANON_KEY=..." >> .env
echo "DATABASE_URL=postgresql://..." >> .env
```

---

## 📦 Scripts Disponíveis

| Script | O que faz |
|--------|-----------|
| `npm run dev` | Inicia em desenvolvimento |
| `npm run build` | Faz build para produção |
| `npm start` | Inicia servidor pronto |
| `npm run db:push` | Sincroniza schema do banco |
| `npm run setup-env` | Setup interativo de variáveis |
| `npm run seed:admin` | Cria usuário admin padrão |
| `npm run check` | Verifica tipos TypeScript |

---

## ⚙️ Estrutura de Deploy

```
Portfolio Tracker
├── Backend: Express.js (Node.js 20+)
├── Frontend: React + Vite
├── Database: PostgreSQL (Supabase)
├── Session Storage: PostgreSQL
└── Port: 5000 (único que funciona em Replit)
```

---

## 🔐 Segurança

### ✅ Fazer
- ✅ Use HTTPS em produção
- ✅ Mude senha admin padrão no primeiro acesso
- ✅ Nunca commite `.env` com credenciais reais
- ✅ Use `.env.example` como template
- ✅ Rotacione credenciais Supabase periodicamente

### ❌ Não Fazer
- ❌ Não exponha `SUPABASE_ANON_KEY` em código
- ❌ Não use senhas fracas para admin
- ❌ Não deixe `NODE_ENV=development` em produção
- ❌ Não compartilhe `DATABASE_URL` publicamente

---

## 🆘 Troubleshooting

### "Cannot find module '@shared/schema'"
```bash
npm install
npm run build
```

### "Supabase connection error"
- Verifique `SUPABASE_URL` e `SUPABASE_ANON_KEY`
- Confirme que são credenciais válidas do Supabase

### "Database connection refused"
- Verifique `DATABASE_URL`
- Confirme que o banco de dados Supabase está ativo
- Tente reconectar

### "Port 5000 already in use"
```bash
# Mude a porta
export PORT=3000
npm run dev

# Ou mate o processo
lsof -ti:5000 | xargs kill -9
```

---

## 📊 Monitoring

Após deploy, monitore:
- Logs da aplicação
- Conexão Supabase (Status)
- Uso de banco de dados
- Erros de autenticação

---

## 🆙 Updates & Maintenance

### Atualizar código
```bash
git pull
npm install
npm run db:push
npm run build
npm start
```

### Fazer backup
```bash
# Supabase faz backup automático (free tier: 7 dias)
# Para backup manual, exporte via Settings → Backups
```

### Resetar banco (cuidado!)
```bash
# Supabase Dashboard → SQL Editor
DROP DATABASE portfolio;
CREATE DATABASE portfolio;
```

---

## 📞 Suporte

Para problemas:
1. Verifique os logs: `npm run dev` e procure erros
2. Veja se está em `.env.example` faltando algo
3. Verifique conexão Supabase em https://supabase.com
4. Abra issue no repositório GitHub
