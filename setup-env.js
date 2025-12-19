#!/usr/bin/env node
/**
 * Setup Environment Variables
 * Creates .env file with Supabase configuration
 * Usage: npm run setup-env
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) =>
  new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });

async function setup() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║         Portfolio Tracker - Setup Environment              ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const envPath = path.join(__dirname, ".env");
  
  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    const overwrite = await question('📁 .env already exists. Overwrite? (y/n): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('\n✅ Setup cancelled. Using existing .env file.\n');
      rl.close();
      return;
    }
  }

  console.log("📋 Enter your Supabase credentials:\n");
  console.log("Get these from: https://supabase.com");
  console.log("  1. Login to your Supabase project");
  console.log("  2. Go to Settings → API for URL and Anon Key");
  console.log("  3. Go to Settings → Database for Connection String\n");

  const supabaseUrl = await question(
    "🔗 SUPABASE_URL (https://your-project.supabase.co): "
  );
  const anonKey = await question(
    "🔑 SUPABASE_ANON_KEY: "
  );
  const databaseUrl = await question(
    "🗄️  DATABASE_URL (postgresql://...): "
  );

  // Validate inputs
  if (!supabaseUrl || !anonKey || !databaseUrl) {
    console.error("\n❌ All fields are required!\n");
    rl.close();
    process.exit(1);
  }

  if (!supabaseUrl.includes("supabase.co")) {
    console.error("\n❌ Invalid SUPABASE_URL format!\n");
    rl.close();
    process.exit(1);
  }

  const envContent = `# ============================================
# Supabase Configuration
# ============================================
SUPABASE_URL=${supabaseUrl}
SUPABASE_ANON_KEY=${anonKey}

# ============================================
# Database Configuration
# ============================================
DATABASE_URL=${databaseUrl}

# ============================================
# Server Configuration
# ============================================
NODE_ENV=development
PORT=5000

# ============================================
# Authentication
# ============================================
REPLIT_IDENTITY_PROVIDER=https://replit.com/identity
`;

  fs.writeFileSync(envPath, envContent);

  console.log("\n✅ Environment file created successfully!\n");
  console.log("📝 Next steps:");
  console.log("   1. Run database migrations: npm run db:push");
  console.log("   2. Start development server: npm run dev");
  console.log("   3. Open http://localhost:5000 in your browser\n");
  console.log("👤 Default admin credentials:");
  console.log("   Email: madnessinvestor@yahoo.com");
  console.log("   Password: 123456\n");
  console.log("⚠️  Change the admin password on first login!\n");

  rl.close();
}

setup().catch((err) => {
  console.error("Setup error:", err.message);
  process.exit(1);
});
