# InvestTracker - Portfolio Management Application

## Overview

InvestTracker is a personal investment portfolio tracking web application that allows users to manually track their cryptocurrency and traditional market investments. It functions as a manual portfolio tracker (similar to Blockfolio) without blockchain/wallet connections. Users input investment values manually, and the system maintains historical records, generates charts, and provides monthly statements to track portfolio evolution over time.

Key features:
- Manual asset registration across four market types:
  - Crypto: Bitcoin, Ethereum, etc. (auto-priced via CoinGecko)
  - Renda Variável: Brazilian stocks, FIIs, ETFs (auto-priced via BRAPI)
  - Renda Fixa: CDBs, LCIs, LCAs, Tesouro Direto (manual entry only)
  - Imóveis: Real estate properties (manual entry only)
- Snapshot-based value tracking (each update creates history, no overwrites)
- Automatic price updates for crypto and variable income assets
- Manual value entry for fixed income and real estate investments
- Portfolio performance visualization with charts
- Monthly statement generation

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Charts**: Recharts library for data visualization (line charts, pie charts, bar charts)
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful JSON API with `/api` prefix
- **Authentication**: Replit Auth integration using OpenID Connect with Passport.js
- **Session Management**: PostgreSQL-backed sessions via connect-pg-simple

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Key Tables**:
  - `assets`: Investment holdings with quantity, acquisition price, current price
  - `snapshots`: Historical value records for assets
  - `monthly_statements`: Aggregated monthly portfolio summaries
  - `users` and `sessions`: Authentication tables (required for Replit Auth)

### Build and Deployment
- **Development**: `tsx` for TypeScript execution, Vite dev server with HMR
- **Production Build**: esbuild for server bundling, Vite for client bundling
- **Output**: `dist/` directory with `index.cjs` (server) and `public/` (static assets)

### Design System
- Material Design 3 inspired with fintech adaptations
- Inter font family for data-heavy interfaces
- Responsive grid layout (12-column on desktop, stacked on mobile)
- Color scheme uses CSS custom properties for theme switching

## External Dependencies

### Third-Party APIs
- **CoinGecko API**: Free cryptocurrency price data (`https://api.coingecko.com/api/v3`)
- **BRAPI**: Brazilian stock market data (`https://brapi.dev/api`)

### Database
- **PostgreSQL**: Required for data persistence and session storage
- Connection via `DATABASE_URL` environment variable
- Schema migrations via `drizzle-kit push`

### Authentication
- **Replit Auth**: OpenID Connect provider for user authentication
- Requires `ISSUER_URL`, `REPL_ID`, and `SESSION_SECRET` environment variables

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `@tanstack/react-query`: Async state management
- `@radix-ui/*`: Accessible UI primitives
- `recharts`: Charting library
- `passport` / `openid-client`: Authentication
- `express-session` / `connect-pg-simple`: Session management