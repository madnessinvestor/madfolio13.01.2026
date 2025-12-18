# Como Testar Localmente no Replit

## 🚀 Passo 1: Instalar Dependências

```bash
npm install
```

Isso irá instalar apenas as 4 dependências necessárias:
- express
- cors
- bcrypt
- better-sqlite3

Esperado: Mensagem `added X packages` sem erro.

## 🟢 Passo 2: Iniciar o Servidor

```bash
npm start
```

Esperado no console:
```
[DB] Database initialized, users table created if not exists
[DB] Admin user already exists
Server running on http://0.0.0.0:3000
```

O servidor agora está rodando e pronto para receber requisições.

## 🧪 Passo 3: Testar GET /health

Abra um **novo terminal** (não feche o do npm start) e execute:

```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{"status":"ok"}
```

**Sucesso:** Se recebeu a resposta acima, o servidor está respondendo corretamente.

## 🔐 Passo 4: Testar POST /login

### 4.1 - Login com USERNAME (correto)

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"admin","password":"admin123"}'
```

Resposta esperada (200 OK):
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

### 4.2 - Login com EMAIL (também funciona)

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"admin@localhost","password":"admin123"}'
```

Resposta esperada (200 OK):
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

### 4.3 - Login com SENHA ERRADA (teste erro)

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"admin","password":"senhaerrada"}'
```

Resposta esperada (401 Unauthorized):
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

## 📋 Checklist de Teste Completo

- [ ] `npm install` executou sem erros
- [ ] `npm start` exibiu mensagens de inicialização
- [ ] GET /health retornou `{"status":"ok"}`
- [ ] POST /login com username correto retornou user data (200)
- [ ] POST /login com email correto retornou user data (200)
- [ ] POST /login com senha errada retornou erro 401

Se todos os pontos acima passarem, **seu backend está 100% funcional**! ✅

## 🛑 Parar o Servidor

Para parar o servidor, volte ao terminal onde executou `npm start` e pressione:

```
CTRL + C
```

## 📝 Credenciais Padrão

```
Username: admin
Email:    admin@localhost
Senha:    admin123
```

Estas credenciais são criadas automaticamente no banco de dados na primeira execução.

## 🔍 Verificar Banco de Dados

Se quiser verificar o banco SQLite diretamente:

```bash
# Ver conteúdo da tabela users
sqlite3 data/app.db "SELECT id, username, email, role, created_at FROM users;"
```

Esperado:
```
1|admin|admin@localhost|admin|2024-12-18 ...
```

## 🐛 Troubleshooting

### Erro: "Port 3000 is already in use"
Já existe outro processo usando a porta 3000. Mude a porta em `server/index.js` linha 5:
```javascript
const PORT = 3001; // Mude para outra porta livre
```

### Erro: "Cannot find package 'express'"
Execute `npm install` novamente.

### Erro: "Database file not found"
A pasta `data/` deve ser criada automaticamente. Se não for, crie manualmente:
```bash
mkdir -p data
npm start
```

---

**Pronto!** Seu backend local está funcionando! 🎉
