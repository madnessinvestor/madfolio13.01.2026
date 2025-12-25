#!/bin/bash
# .devcontainer/setup.sh
# Script executado automaticamente ao criar o dev container

set -e

echo "🚀 Configurando ambiente de desenvolvimento..."

# 1. Instalar dependências do Puppeteer (SEM libgbm1 que causa erro no Nix)
echo "📦 Instalando dependências do Puppeteer..."
sudo apt-get update
sudo apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2

# 2. Instalar dependências Node.js
echo "📦 Instalando dependências Node.js..."
npm install

# 3. Setup inicial do banco de dados (se necessário)
echo "🗄️ Configurando banco de dados..."
if [ ! -f "app.db" ]; then
    echo "Criando banco de dados..."
    npm run db:push || echo "⚠️ Aviso: Não foi possível criar o banco de dados automaticamente"
fi

echo ""
echo "✅ Ambiente configurado com sucesso!"
echo ""
echo "🎯 Próximos passos:"
echo "  1. Execute: npm run dev"
echo "  2. Acesse: http://localhost:5000"
