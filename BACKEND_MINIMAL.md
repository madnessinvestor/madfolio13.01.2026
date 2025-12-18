# Backend Mínimo - Express.js + SQLite

## ✅ Status: Rodando

Backend Express com banco de dados SQLite configurado e rodando na **porta 3000**.

## 📋 Detalhes

- **Tecnologia:** Express.js + CORS + SQLite (better-sqlite3)
- **Porta:** 3000
- **Banco de dados:** `data/app.db` (versionado no Git)
- **Arquivos:** 
  - `server/index.js` (backend)
  - `server/db.js` (banco de dados)
- **Dependências:** express, cors, better-sqlite3, bcrypt

## 🚀 Como Rodar

```bash
# Instalar dependências
npm install

# Rodar o backend
node server/index.js
```

Ou, se configurado em package.json:
```bash
npm run backend-minimal
```

## 📡 Endpoints

### GET /health
```bash
curl http://localhost:3000/health
```

Resposta:
```json
{ "status": "ok" }
```

## 📂 Estrutura

```
server/
├── index.js          # Backend mínimo (Express + CORS)
└── db.js             # Banco de dados SQLite + criação de admin

data/
└── app.db            # Banco SQLite (versionado)
```

## 🔐 Usuário Admin Padrão

Criado automaticamente na primeira execução:
- **Username:** `admin`
- **Email:** `admin@localhost`
- **Senha:** `admin123`
- **Role:** `admin`

O usuário é criado com `INSERT OR IGNORE`, então se já existir, não será substituído.

## 📝 Banco de Dados

Tabela `users`:
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Senhas são hasheadas com **bcrypt** (10 salt rounds).

## 📝 Código Principal

**server/index.js:**
```javascript
import express from "express";
import cors from "cors";
import { initializeDatabase, createDefaultAdmin } from "./db.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize database and create default admin on startup
initializeDatabase();
createDefaultAdmin();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
```

**server/db.js:**
```javascript
import Database from "better-sqlite3";
import bcrypt from "bcrypt";

export const db = new Database("data/app.db");

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function createDefaultAdmin() {
  const passwordHash = bcrypt.hashSync("admin123", 10);
  db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password_hash, role)
    VALUES (?, ?, ?, 'admin')
  `).run("admin", "admin@localhost", passwordHash);
}
```

## 🔧 Próximos Passos

Você pode adicionar novas rotas ao arquivo `server/index.js`:

```javascript
app.post("/api/dados", (req, res) => {
  res.json({ message: "Dados recebidos" });
});

app.get("/api/status", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});
```

## ⚙️ Configurações

- ✅ CORS habilitado (permite requisições de qualquer origem)
- ✅ JSON parser ativado
- ✅ Porta 3000 (não bloqueada pelo Replit)
- ✅ Bind em 0.0.0.0 (acessível externamente)

---

**Criado:** 18 de dezembro de 2024  
**Stack:** Express.js (JavaScript puro)
