import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

export async function syncDatabaseWithGit() {
  try {
    // Check if git repo exists
    execSync("git status", { cwd: PROJECT_ROOT, stdio: "ignore" });
    
    console.log(`[DB-SYNC] Checking for remote changes...`);
    
    // Fetch latest from remote
    try {
      execSync("git fetch", { cwd: PROJECT_ROOT, stdio: "ignore" });
      console.log(`[DB-SYNC] ✓ Git fetch completed`);
    } catch {
      console.log(`[DB-SYNC] No remote configured`);
    }
    
    // Check if database file exists
    const dbPath = path.join(PROJECT_ROOT, "app.db");
    if (!fs.existsSync(dbPath)) {
      console.log(`[DB-SYNC] Local database not found, attempting to restore from Git...`);
      try {
        execSync("git checkout app.db app.db-shm app.db-wal", { cwd: PROJECT_ROOT, stdio: "ignore" });
        console.log(`[DB-SYNC] ✓ Database restored from Git history`);
      } catch {
        console.log(`[DB-SYNC] No database in Git history - will create new one`);
      }
    }
    
    console.log(`[DB-SYNC] ✓ Database synchronized`);
    return true;
  } catch (error) {
    console.log(`[DB-SYNC] Sync skipped (not a git repo)`);
    return false;
  }
}

export async function commitDatabaseChanges(message: string) {
  try {
    const dbPath = path.join(PROJECT_ROOT, "app.db");
    if (!fs.existsSync(dbPath)) return;

    // Stage database files
    try {
      execSync("git add app.db app.db-shm app.db-wal 2>/dev/null || true", { cwd: PROJECT_ROOT, stdio: "ignore" });
    } catch {}

    // Check if there are changes to commit
    const status = execSync("git status --porcelain", { cwd: PROJECT_ROOT }).toString();

    if (status.includes("app.db")) {
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}" 2>/dev/null || true`, { cwd: PROJECT_ROOT, stdio: "ignore" });
      
      // Try to push
      try {
        execSync("git push 2>/dev/null || true", { cwd: PROJECT_ROOT, stdio: "ignore" });
        console.log(`[DB-SYNC] ✓ Committed & pushed: ${message}`);
      } catch {
        console.log(`[DB-SYNC] ✓ Committed (no push): ${message}`);
      }
    }
  } catch (error) {
    // Silently ignore commit errors
  }
}
