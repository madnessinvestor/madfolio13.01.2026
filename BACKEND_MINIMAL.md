# Backend Mínimo - Express.js

## ✅ Status: Rodando

Backend Express mínimo configurado e rodando na **porta 3000**.

## 📋 Detalhes

- **Tecnologia:** Express.js + CORS
- **Porta:** 3000
- **Arquivo:** `server/index.js` (JavaScript puro)
- **Dependências:** express, cors

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
└── index.js          # Backend mínimo (Express + CORS)
```

## 📝 Código

```javascript
import express from "express";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
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
