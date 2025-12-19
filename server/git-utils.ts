import { commitDatabaseChanges } from "./db-sync";

export async function autoCommit(message: string) {
  try {
    // Skip git commits due to authentication issues
    // Will be re-enabled with proper credentials setup
    console.log(`[GIT] Skipped (auth required): ${message}`);
    return;
    // await commitDatabaseChanges(message);
  } catch (error) {
    console.log(`[GIT] Commit error:`, error);
  }
}
