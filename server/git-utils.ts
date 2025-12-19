import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

export async function autoCommit(message: string) {
  try {
    execSync("git add app.db app.db-shm app.db-wal 2>/dev/null || true", { cwd: PROJECT_ROOT, stdio: "ignore" });
    
    const status = execSync("git status --porcelain", { cwd: PROJECT_ROOT }).toString().trim();
    
    if (status.length > 0 && status.includes("app.db")) {
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: PROJECT_ROOT, stdio: "ignore" });
      console.log(`[GIT] ✓ Committed: ${message}`);
    }
  } catch (error) {
    console.log(`[GIT] Commit skipped`);
  }
}
