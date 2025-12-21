# Wallet Tracker - Componentes Isolados

Este diretório contém **APENAS** a lógica do Wallet Tracker, completamente isolada do resto do aplicativo Portfolio Tracker.

## 🎯 O que é o Wallet Tracker?

Sistema que monitora saldos de carteiras em múltiplas plataformas blockchain usando Puppeteer para scraping automatizado de páginas de portfólio.

## 📁 Estrutura dos Arquivos

```
wallet-tracker-isolated/
├── backend/
│   ├── debankScraper.ts       # 🏗️ Orquestração de scraping + timeouts
│   ├── platformScrapers.ts    # 🔍 Lógica específica por plataforma (DeBank, Jupiter, etc)
│   ├── walletCache.ts         # 💾 Sistema de cache em JSON + histórico
│   └── walletRoutes.ts        # 🌐 Rotas API isoladas (/api/saldo/*)
├── frontend/
│   └── debank-balances.tsx    # ⚛️ Componente React completo
└── shared/
    └── walletSchema.ts        # 📋 Tipos TypeScript + schemas Drizzle
```

## 🚀 Como Usar em Outro Projeto

### 1. Pré-requisitos
```bash
npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
npm install drizzle-orm drizzle-zod zod
npm install @tanstack/react-query
```

### 2. Copie os arquivos
```bash
cp -r wallet-tracker-isolated/* seu-projeto/
```

### 3. Configure o Backend
```typescript
// No seu server/index.ts
import { registerWalletRoutes } from "./walletRoutes";

// Registre as rotas
registerWalletRoutes(app);

// Inicie o scraping automático (opcional)
import { startWalletMonitoring } from "./debankScraper";
startWalletMonitoring(); // Inicia scraping a cada 1 hora
```

### 4. Configure o Frontend
```typescript
// No seu componente React
import DebankBalances from "./debank-balances";

// Use o componente
<DebankBalances />
```

### 5. Configure o Banco de Dados
```sql
-- Execute esta migration
CREATE TABLE wallets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT,
  name TEXT NOT NULL,
  link TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'debank',
  created_at INTEGER DEFAULT (unixepoch())
);
```

## 🔄 Fluxo de Funcionamento

```
👤 Usuário abre página
  ↓
⚛️ Frontend: GET /api/saldo/detailed
  ↓
🖥️ Backend: retorna saldos do cache
  ↓
🤖 Background: Puppeteer scraping sequencial
  ↓
💾 Cache: atualiza wallet-cache.json
  ↓
🔄 Próxima requisição: retorna valores novos
```

## ⏱️ Características Técnicas

- **Scraping automático**: A cada 60 minutos
- **Timeouts por plataforma**: DeBank (65s), Jupiter (45s), outros (30s)
- **Fallback inteligente**: Cache → "Indisponível"
- **Histórico persistido**: Últimas 1000 entradas por wallet
- **Rate limiting**: 5 segundos entre wallets

## 🔧 Personalização

### Adicionar nova plataforma:
1. Edite `platformScrapers.ts`
2. Adicione função `extractPlataformaName()`
3. Configure timeout em `debankScraper.ts`

### Modificar intervalos:
```typescript
// Em debankScraper.ts
const SCRAPING_INTERVAL = 30 * 60 * 1000; // 30 minutos
```

## 📊 APIs Disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/saldo/detailed` | Saldos atuais (usado pelo frontend) |
| POST | `/api/saldo/refresh` | Força atualização de todas as wallets |
| POST | `/api/saldo/refresh/:name` | Atualiza wallet específica |
| GET | `/api/saldo/history/:name` | Histórico de uma wallet |
| GET | `/api/saldo/stats/:name` | Estatísticas de uma wallet |
| GET | `/api/wallets` | Lista todas as wallets |

## 🛡️ Segurança

- ✅ **Read-only**: Apenas coleta dados públicos
- ✅ **Sem chaves privadas**: URLs compartilháveis
- ✅ **Rate limiting**: Evita sobrecarga nas plataformas
- ⚠️ **Dependente de UI**: Pode quebrar se plataformas mudarem layout

## 📈 Exemplo de Uso

```typescript
// Forçar atualização manual
const response = await fetch('/api/saldo/refresh', { method: 'POST' });
const data = await response.json();
// data.balances contém saldos atualizados

// Obter histórico
const history = await fetch('/api/saldo/history/My DeFi Wallet?limit=50');
const entries = await history.json();
// entries contém últimas 50 entradas
```

---

**Nota**: Estes arquivos foram extraídos do Portfolio Tracker e funcionam de forma independente. Nenhuma modificação foi feita no código original.</content>
<parameter name="filePath">/workspaces/madfoliobackupok/wallet-tracker-isolated/README.md