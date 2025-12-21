# Wallet Tracker - Documentação Completa

## 📊 Visão Geral
O Wallet Tracker é um sistema que monitora saldos de carteiras em múltiplas plataformas blockchain usando Puppeteer (navegador automatizado) para fazer scraping de páginas de portfólio.

---

## 🔄 FLUXO PRINCIPAL: Frontend → Backend → Puppeteer → Cache → Retorno

### 1️⃣ USUÁRIO ACESSA A ABA "WALLET TRACKER" (Frontend)
**Arquivo:** `client/src/pages/debank-balances.tsx`

**O que acontece:**
- React Query faz uma requisição GET para `/api/saldo/detailed`
- Exibe loading spinner enquanto aguarda
- A página refaz a query a cada 60 segundos automaticamente

```typescript
[Frontend] useQuery({
  queryKey: ["/api/saldo/detailed"],
  refetchInterval: 60000  // 1 minuto
})
```

---

### 2️⃣ BACKEND RETORNA SALDOS EM CACHE (Backend)
**Arquivo:** `server/routes.ts` - Linha 548-555

**Rota:** `GET /api/saldo/detailed`

```typescript
[Backend]
// Chamada: getDetailedBalances()
// Retorna: Array de WalletBalance armazenados em memória
// Não faz scraping aqui - apenas retorna o que está em cache
```

**Response example:**
```json
[
  {
    "id": "wallet-1",
    "name": "My DeFi Wallet",
    "link": "https://debank.com/profile/0x123...",
    "balance": "$45,250.32",
    "lastUpdated": "2025-12-21T16:52:00Z",
    "status": "success",
    "lastKnownValue": "$45,250.32"
  }
]
```

---

### 3️⃣ SCRAPING AUTOMÁTICO A CADA 1 HORA (Background Task)
**Arquivo:** `server/services/debankScraper.ts` - Linha 273-286

**Processo:**
```
[Step.finance] Starting monitor with 60 minute interval
↓
updateWalletsSequentially() é chamado
↓
Para CADA wallet: scrapeWalletWithTimeout(wallet, 65000ms)
↓
5 SEGUNDOS DE ESPERA entre wallets (para não sobrecarregar)
```

**Timeline:**
- **T=0min:** Coleta Wallet 1 (até 65s)
- **T=5min:** Coleta Wallet 2 (até 65s)
- **T=10min:** Coleta Wallet 3 (até 65s)
- **T=60min:** Ciclo completa e começa novamente

---

### 4️⃣ PUPPETEER FAZE SCRAPING DA PÁGINA (Automation)
**Arquivo:** `server/services/platformScrapers.ts`

**Para cada wallet:**

#### A) Se for DeBank (debank.com)
```
1. Browser abre a URL da wallet (DeBank link)
2. Define User Agent para parecer navegador normal
3. Tenta API primeiro: https://api.debank.com/v1/user/total_balance?id=0x123...
4. Se API falha → Extrai DOM e procura padrão: "$X,XXX -Y.YY%" (valor + percentual)
5. Extrai valor como string: "$45,250.32"
```

**Seletores especiais (DOM):**
```javascript
// Procura o padrão de portfolio total no topo da página
const line = "$45,250.32 +2.15%"
// Extrai: $45,250.32
```

#### B) Se for Jupiter/Solana (jup.ag)
```
1. Browser abre URL do portfolio Jupiter
2. Espera 3 segundos para renderização JS
3. Extrai TODO o texto da página
4. Procura TODOS os valores em formato $X,XXX.XX
5. Escolhe o MAIOR valor (estratégia oportunista)
// Resultado: "$1,234.56"
```

#### C) Se for outras plataformas (Starknet, Aptos, Sei, etc)
```
1. Mesma estratégia do Jupiter: maior valor encontrado
2. Timeout específico por plataforma (30-45 segundos)
```

---

### 5️⃣ FALLBACK E TRATAMENTO DE ERROS

**Se scraping falha:**
```
Tentativa → Timeout ou erro
↓
Tem valor em cache?
  → SIM: Retorna última coleta com status "temporary_error"
  → NÃO: Retorna "Indisponível" com status "unavailable"
```

**Exemplo:**
- Wallet A: Scrape bem-sucedido → balance="$50,000", status="success"
- Wallet B: Timeout → usa cache → balance="$45,250", status="temporary_error"
- Wallet C: Sem conexão → balance="Indisponível", status="unavailable"

---

### 6️⃣ ARMAZENAMENTO EM CACHE (Cache)
**Arquivo:** `server/services/walletCache.ts`

**Arquivo físico:** `wallet-cache.json` (raiz do projeto)

**Cada scraping adiciona entrada:**
```json
{
  "walletName": "My DeFi Wallet",
  "balance": "$45,250.32",
  "platform": "debank",
  "timestamp": "2025-12-21T16:52:00Z",
  "status": "success"
}
```

**Regra:** Mantém apenas últimas 1000 entradas por wallet (arquivo não fica gigante)

---

### 7️⃣ RETORNO PARA FRONTEND

**Frontend recebe:**
```
GET /api/saldo/detailed

Response:
[
  {
    name: "Wallet 1",
    balance: "$45,250.32",
    status: "success",
    lastUpdated: "2025-12-21T16:52:00Z"
  }
]
```

**UI exibe:**
- ✅ Valor do saldo
- ✅ Última hora de atualização
- ✅ Status (Atualizado / Valor anterior / Indisponível)
- ✅ Badge com ícone de plataforma
- ✅ Botão para ver histórico

---

## 🎯 FUNCIONALIDADES ESPECÍFICAS

### Atualização Manual (Botão "Atualizar Agora")
```
[Frontend] POST /api/saldo/refresh
↓
[Backend] forceRefreshAndWait()
↓
updateWalletsSequentially() executa agora (sem esperar 1 hora)
↓
Retorna balances atualizado imediatamente
```

### Atualizar Wallet Individual
```
[Frontend] POST /api/saldo/refresh/:walletName
↓
[Backend] forceRefreshWallet(walletName)
↓
Scraping apenas dessa wallet (não abre browser para outras)
↓
Retorna saldo atualizado
```

### Histórico de Uma Wallet
```
[Frontend] GET /api/saldo/history/:walletName?limit=100
↓
[Backend] getWalletHistory() lê wallet-cache.json
↓
Retorna últimas 100 entradas dessa wallet
↓
Modal exibe: gráfico com estatísticas (min, max, média, variação %)
```

### Estatísticas de Uma Wallet
```
[Frontend] GET /api/saldo/stats/:walletName
↓
[Backend] getWalletStats() calcula:
  - Current balance
  - Min/Max balance
  - Average balance
  - Change (valor absoluto)
  - Change % (variação percentual)
↓
Card exibe as 6 métricas principais
```

---

## 📁 ESTRUTURA DE ARQUIVOS

```
server/
├── services/
│   ├── debankScraper.ts       # Orquestração de scraping + timeouts
│   ├── platformScrapers.ts    # Lógica específica por plataforma (DeBank, Jupiter, etc)
│   └── walletCache.ts         # Persistência em JSON + histórico
└── routes.ts                  # Rotas API (/api/saldo/*)

client/
└── src/pages/
    └── debank-balances.tsx    # UI - Grid de wallets + modal histórico

shared/
└── schema.ts                  # Modelo Wallet (para banco de dados)

wallet-cache.json             # Arquivo onde fica o histórico
```

---

## ⏱️ TIMEOUTS POR PLATAFORMA

```
- DeBank (EVM): 65 segundos (API + DOM)
- Jupiter (Solana): 45 segundos
- Ready (Starknet): 45 segundos
- Aptoscan (Aptos): 30 segundos
- Seiscan (Sei): 30 segundos
- Genérico (fallback): 30 segundos
```

Se timeout → fallback para cache

---

## 🔐 SEGURANÇA & LIMITAÇÕES

✅ **Seguro:**
- Nenhum privkey/seed armazenado
- Apenas read-only (coleta informações públicas)
- URLs compartilháveis publicamente

⚠️ **Limitações:**
- Scraping pode quebrar se UI mudar
- Rate limits em plataformas (resolvido com 5s delay entre wallets)
- Algumas wallets requerem JS rendering (resolvido com Puppeteer)

---

## 📊 EXEMPLO PASSO A PASSO

**Cenário:** Usuário adiciona wallet DeBank e clica "Atualizar Agora"

```
1. [UI] POST /api/saldo/refresh
2. [Backend] forceRefreshAndWait()
3. [Puppeteer] Abre browser
4. [Puppeteer] Navega para: https://debank.com/profile/0x123...
5. [Puppeteer] Tenta API: https://api.debank.com/v1/user/total_balance?id=0x123...
6. [Puppeteer] Extrai: response.total_usd_value = 45250.32
7. [Cache] Salva em wallet-cache.json: { walletName, balance: "$45,250.32", status: "success", timestamp }
8. [Memory] Atualiza: balanceCache.set("My Wallet", { balance: "$45,250.32", ... })
9. [UI] Recebe resposta com novo balance
10. [UI] Exibe "$45,250.32" + "Atualizado" badge
```

---

## 🚀 RESUMO

**Frontend solicitação** → **Backend retorna cache** → **(Assincronamente) Puppeteer scraping em background** → **Atualiza cache JSON** → **Próxima requisição retorna valor novo**

Toda hora: scraping automático sequencial de todas as wallets com fallback para cache e histórico persistido.

---

# Wallet Tracker - Arquivos Isolados

Este diretório contém APENAS a lógica do Wallet Tracker, isolada do resto do aplicativo.

## Como usar em outro Replit:

1. Copie estes arquivos para seu novo Replit
2. Mantenha a mesma estrutura de pastas
3. Instale as dependências (Puppeteer, Drizzle, etc)
4. Execute as rotas

## Arquivos incluídos:

- `backend/debankScraper.ts` - Orquestração de scraping
- `backend/platformScrapers.ts` - Scrapers específicas por plataforma
- `backend/walletCache.ts` - Sistema de cache
- `backend/walletRoutes.ts` - Rotas API
- `frontend/debank-balances.tsx` - Componente React
- `shared/walletSchema.ts` - Tipos TypeScript

## Fluxo:

```
Frontend (UI)
  ↓
GET /api/saldo/detailed (retorna cache)
  ↓
Background: scraping sequencial com Puppeteer
  ↓
Atualiza wallet-cache.json
  ↓
Próxima requisição retorna valor novo
```

Nenhuma modificação foi feita. Este é exatamente o código usado no Portfolio Tracker.</content>
<parameter name="filePath">/workspaces/madfoliobackupok/WALLET_TRACKER_DOCUMENTATION.md