# Backend Mínimo - Express.js + SQLite

## ✅ Status: Rodando

Backend Express com banco de dados SQLite e sistema de login configurado e rodando na **porta 3000**.

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

## 📡 Endpoints

### GET /health
```bash
curl http://localhost:3000/health
```

Resposta:
```json
{ "status": "ok" }
```

### POST /login
Permite login com **username OU email** + senha.

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"admin","password":"admin123"}'
```

**Resposta (sucesso - 200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@localhost",
    "role": "admin"
  }
}
```

**Resposta (erro - 401):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

**Exemplos de uso:**

Login com username:
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"admin","password":"admin123"}'
```

Login com email:
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"admin@localhost","password":"admin123"}'
```

Senha errada (retorna 401):
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"admin","password":"wrongpassword"}'
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
import { initializeDatabase, createDefaultAdmin, validateLogin } from "./db.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

initializeDatabase();
createDefaultAdmin();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/login", (req, res) => {
  const { usernameOrEmail, password } = req.body;
  
  if (!usernameOrEmail || !password) {
    return res.status(401).json({ 
      success: false, 
      message: "Username/Email and password are required" 
    });
  }
  
  const result = validateLogin(usernameOrEmail, password);
  
  if (!result.success) {
    return res.status(401).json({ 
      success: false, 
      message: "Invalid credentials" 
    });
  }
  
  res.json({ success: true, user: result.user });
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
db.pragma("foreign_keys = ON");

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

export function findUserByUsernameOrEmail(usernameOrEmail) {
  return db.prepare(`
    SELECT * FROM users WHERE username = ? OR email = ?
  `).get(usernameOrEmail, usernameOrEmail);
}

export function validateLogin(usernameOrEmail, password) {
  const user = findUserByUsernameOrEmail(usernameOrEmail);
  
  if (!user) {
    return { success: false, user: null };
  }
  
  const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
  
  if (!isPasswordValid) {
    return { success: false, user: null };
  }
  
  return { 
    success: true, 
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    }
  };
}
```

## ⚙️ Configurações

- ✅ CORS habilitado (permite requisições de qualquer origem)
- ✅ JSON parser ativado
- ✅ Porta 3000 (não bloqueada pelo Replit)
- ✅ Bind em 0.0.0.0 (acessível externamente)
- ✅ SQLite local em data/app.db
- ✅ Senhas hasheadas com bcrypt
- ✅ Admin criado automaticamente

## 🔧 Próximos Passos

1. **Adicionar mais usuários:** Implemente uma rota POST `/register` ou admin panel
2. **Adicionar JWT/Sessões:** Para manter login entre requisições
3. **Adicionar mais rotas:** Qualquer coisa que precisar autenticação
4. **Validações:** Adicione mais validações nos campos (email format, etc)

---

**Criado:** 18 de dezembro de 2024  
**Stack:** Express.js (JavaScript puro) + SQLite + bcrypt
