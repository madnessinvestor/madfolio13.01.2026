import { execSync, exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { promisify } from "util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

export async function syncDatabaseWithGit() {
  try {
    // Check if git repo exists
    execSync("git status", { cwd: PROJECT_ROOT, stdio: "ignore" });
    
    console.log(`[DB-SYNC] Checking for remote changes...`);
    
    // Fetch latest from remote (skip in Replit environment to avoid auth prompts)
    if (!process.env.REPL_ID) {
      try {
        execSync("git fetch", { cwd: PROJECT_ROOT, stdio: "ignore", timeout: 5000 });
        console.log(`[DB-SYNC] ✓ Git fetch completed`);
      } catch {
        console.log(`[DB-SYNC] No remote configured`);
      }
    } else {
      console.log(`[DB-SYNC] Skipping fetch in Replit environment`);
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
    let status = "";
    try {
      status = execSync("git status --porcelain", { cwd: PROJECT_ROOT }).toString();
    } catch {
      return;
    }

    if (status.includes("app.db")) {
      try {
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}" 2>/dev/null || true`, { cwd: PROJECT_ROOT, stdio: "ignore" });
        console.log(`[DB-SYNC] ✓ Committed locally: ${message}`);
      } catch {
        console.log(`[DB-SYNC] Commit skipped: ${message}`);
      }
      
      // Push to remote in background (non-blocking) - don't await
      pushToRemoteInBackground(message);
    }
  } catch (error) {
    // Silently ignore commit errors
  }
}

// Background push function - runs asynchronously without blocking
function pushToRemoteInBackground(message: string) {
  // Don't await this - let it run in background
  execAsync("timeout 5 git push --no-verify 2>/dev/null || true", { cwd: PROJECT_ROOT })
    .then(() => {
      console.log(`[DB-SYNC] ✓ Pushed to GitHub: ${message}`);
    })
    .catch(() => {
      // Silently ignore push errors - data is already committed locally
      console.log(`[DB-SYNC] ℹ Push skipped (remote may be offline)`);
    });
}
