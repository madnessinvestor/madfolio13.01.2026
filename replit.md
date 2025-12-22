# Replit Project Documentation - MadFolio

## Project Overview

**MadFolio** é uma aplicação full-stack para rastreamento de investimentos em criptomoedas e mercado tradicional.

- **Status**: Imported and running on Replit
- **Type**: Full-Stack JavaScript (React + Express + SQLite)
- **Database**: SQLite (local app.db) with optional Supabase integration
- **Authentication**: Replit Auth + Local Credentials
- **Deployment**: Replit autoscale (build: npm run build, run: node dist/index.cjs)
- **Last Import**: December 22, 2025

## Architecture

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **State**: TanStack Query v5
- **Styling**: Tailwind CSS + shadcn/ui
- **Routing**: wouter

### Backend
- **Runtime**: Node.js 20
- **Framework**: Express
- **ORM**: Drizzle ORM
- **Database**: SQLite (better-sqlite3)
- **Auth**: Replit Auth + Passport.js + Local credentials

### Database
- SQLite database (app.db)
- Schema managed by Drizzle ORM
- Tables: users, sessions, assets, snapshots, wallets, portfolios, activities, monthly_statements

## Recent Changes

### Dec 21, 2025 - Ajuste Wallet Tracker
- **CORRIGIDO: Wallet Tracker agora atualiza a cada 5 minutos** (antes: 60 minutos)
  - `startStepMonitor()` alterado de 60 * 60 * 1000ms para 5 * 60 * 1000ms
  - Valores das carteiras rastreadas (DeBanK, Step.finance) atualizam mais frequentemente
  - Aplicado em `server/routes.ts` linha 34

- **CORRIGIDO: "Preço não encontrado" para ativos simplificados**
  - Ativos com mercado "crypto_simplified", "variable_income_simplified", "fixed_income", "real_estate" não tentam mais buscar preço online
  - Usa automaticamente o `acquisitionPrice` como valor padrão
  - Evita erros de API para símbolos customizados (ex: EVM-MADNESSMAIN, APTOS-MADNESS)
  - Aplicado em `server/services/pricing.ts` função `fetchAssetPrice()`

- **MELHORADO: Tratamento de preços ao adicionar investimento**
  - Se busca de preço falhar para crypto/variable_income real, usa acquisitionPrice como fallback
  - Mantém fallback para mercados simplificados
  - Aplicado em `server/routes.ts` POST `/api/investments`

### Dec 21, 2025
- Implemented auto-refresh for crypto holdings (Holdings Cripto)
  - Auto-updates every 5 minutes with live cryptocurrency prices
  - Refetches on page load
  - Refetches when window regains focus
  - Uses CoinGecko API for real-time price data (BTC, ETH, SOL, ERGO, etc.)
  - Locked monthly snapshots prevent auto-updates for that month
  - Price updates do not affect manually edited values in unlocked months
- Added auto-price-lookup when editing crypto assets (Holdings Cripto only)
  - Type symbol (e.g., BTC) → automatically fetches current price
  - 500ms debounce prevents excessive API calls
  - Visual feedback: loading spinner, price success indicator, error messages
  - Displays "(Obtido automaticamente)" when price is auto-fetched
  - Works identically to "Adicionar Investimento" feature

### Dec 19, 2025
- Migrated project to Replit environment
- Set up Node.js 20 module
- Configured npm run dev workflow
- Created admin user (madnessinvestor)
- Prepared project for GitHub deployment
- Created `.gitignore`, `.env.example`, `README.md`, `SETUP.md`

## User Preferences

- Portuguese language for UI and documentation
- Full-stack approach with frontend-heavy architecture
- Use shadcn/ui + Tailwind CSS for styling
- Follow modern web app patterns

## Key Files

- `shared/schema.ts` - Drizzle ORM schemas
- `server/index.ts` - Express server entry point
- `server/routes.ts` - API routes
- `server/storage.ts` - Database storage layer
- `client/src/App.tsx` - React app entry point
- `client/src/pages/` - Page components
- `drizzle.config.ts` - Drizzle configuration (DO NOT EDIT)
- `vite.config.ts` - Vite configuration (DO NOT EDIT)

## Environment Variables

Required:
- `NODE_ENV` - development/production

Optional:
- `PORT` - Server port (default: 5000)
- `DATABASE_URL` - PostgreSQL connection string (if using external DB)

## Running the Project

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm run start

# Database sync
npm run db:push
```

## Database Schema

### Core Tables

**users**
- id (UUID, PK)
- email (unique)
- username (unique)
- passwordHash
- firstName, lastName
- profileImageUrl
- authProvider (local/google/replit)
- createdAt, updatedAt

**assets**
- id (UUID, PK)
- userId
- symbol, name
- category (crypto/fixed-income/variable-income)
- market (crypto/traditional)
- quantity, acquisitionPrice
- currentPrice
- lastPriceUpdate

**snapshots**
- id (UUID, PK)
- assetId (FK → assets)
- value, amount, unitPrice
- date

**wallets**
- id (UUID, PK)
- userId
- name, link
- platform (debank/step)

**portfolio_history**
- id (UUID, PK)
- userId
- totalValue, month, year
- date

**activity_logs**
- id (UUID, PK)
- userId, assetId
- type, action, details
- createdAt

## Workflow Configuration

**Current Workflow**: "Start application"
- Command: `npm run dev`
- Output: webview
- Port: 5000
- Status: Running

## Important Notes

- `.replit` file should not be edited directly via tools (use workflow config)
- Don't modify `vite.config.ts` or `server/vite.ts` - already properly configured
- Don't edit `package.json` scripts without user approval
- Don't modify `drizzle.config.ts`
- Always use `npm run db:push` for database schema changes
- Use `.env.local` for local development settings (not committed)

## Crypto Holdings Auto-Update & Price Lookup Features

### Auto-Update (Holdings Cripto Section)
The application automatically updates all cryptocurrency holdings in the "Holdings Cripto" section:

**How it works:**
- Backend: `startPriceUpdater()` runs every 5 minutes and fetches live prices from CoinGecko
- Frontend: The crypto page (`client/src/pages/crypto.tsx`) auto-refetches the portfolio summary every 5 minutes
- Data is also refetched when:
  - Page loads
  - Window regains focus (after switching tabs/windows)
  - User manually triggers a page refresh

**Price locking:**
- When a user creates a "snapshot" (monthly lock), that value is frozen and won't be auto-updated
- The `isLocked` flag in the snapshots table prevents auto-updates for that month
- Unlocked months continue to auto-update

### Auto-Price-Lookup When Editing (Holdings Cripto Only)
When editing a crypto asset in Holdings Cripto, typing the symbol automatically fetches the current price:

**Features:**
- Type symbol (e.g., BTC, ETH, SOL) → automatic price fetch after 500ms
- Visual feedback shows:
  - Loading spinner while fetching
  - ✓ Green checkmark when price is found
  - ⚠ Error message if price is not found
  - "(Obtido automaticamente)" label on the price field
- User can still manually override the price
- Only works for market === "crypto" (Holdings Cripto)
- Does not affect other market types

**Supported cryptocurrencies:**
- Direct mapping: BTC, ETH, SOL, ADA, DOT, AVAX, MATIC, LINK, ATOM, XRP, DOGE, SHIB, LTC, BCH, XLM, ALGO, VET, FIL, THETA, TRX, EOS, XTZ, AAVE, MKR, COMP, SNX, YFI, SUSHI, CRV, ERGO, and others
- Dynamic search: Any cryptocurrency supported by CoinGecko

## Future Enhancements

- [ ] Multiple portfolio views
- [ ] Export reports to PDF
- [ ] Mobile app
- [ ] Email notifications
- [ ] Advanced analytics
- [ ] Real-time price notifications/alerts

## Deployment

The project is configured for Replit VM deployment (stateful, always-on):
- Build: `npm run build`
- Start: `node dist/index.cjs`
- Database: SQLite (app.db) local file
- WebSocket support: Enabled for real-time features

## Admin Credentials

Default admin user created for development:
- Username: madnessinvestor
- Email: madnessinvestor@yahoo.com
- Password: 123456

**Change these credentials before production deployment!**
