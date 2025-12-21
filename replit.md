# Replit Project Documentation - MadFolio

## Project Overview

**MadFolio** é uma aplicação full-stack para rastreamento de investimentos em criptomoedas e mercado tradicional.

- **Status**: Imported and running
- **Type**: Full-Stack JavaScript (React + Express + SQLite)
- **Database**: SQLite (local app.db) with optional Supabase integration
- **Authentication**: Replit Auth + Local Credentials
- **Deployment**: Replit autoscale

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

## Future Enhancements

- [ ] Price update automation
- [ ] Multiple portfolio views
- [ ] Export reports to PDF
- [ ] Mobile app
- [ ] Email notifications
- [ ] Advanced analytics

## Deployment

The project is configured for Replit autoscale deployment:
- Build: `npm run build`
- Start: `node ./dist/index.cjs`
- Database: Uses DATABASE_URL environment variable

## Admin Credentials

Default admin user created for development:
- Username: madnessinvestor
- Email: madnessinvestor@yahoo.com
- Password: 123456

**Change these credentials before production deployment!**
