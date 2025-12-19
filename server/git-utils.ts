import { commitDatabaseChanges } from "./db-sync";

export async function autoCommit(message: string) {
  try {
    await commitDatabaseChanges(message);
  } catch (error) {
    console.log(`[GIT] Commit skipped`);
  }
}
