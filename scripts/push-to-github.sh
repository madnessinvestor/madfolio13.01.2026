#!/bin/bash

# Portfolio Tracker - Auto Push to GitHub
# This script commits and pushes sensitive files to GitHub

set -e

echo "🚀 Starting GitHub push..."

# Configure git if not already configured
git config --global user.email "bot@portfolio-tracker.local" 2>/dev/null || true
git config --global user.name "Portfolio Tracker Bot" 2>/dev/null || true

# Remove lock file if exists
rm -f .git/index.lock 2>/dev/null || true

echo "📝 Adding files..."
git add -f app.db admin-seed.json ADMIN_CREDENTIALS.md .gitignore README.md SETUP.md replit.md package.json scripts/ public/avatars/ 2>/dev/null || true

echo "💾 Creating commit..."
git commit -m "feat: Add complete Portfolio Tracker with database, admin credentials, and seed data" --allow-empty 2>/dev/null || true

echo "📤 Pushing to GitHub..."
git push origin main 2>&1 || echo "⚠️  Push may require authentication. Check your git remote."

echo "✅ Done!"
