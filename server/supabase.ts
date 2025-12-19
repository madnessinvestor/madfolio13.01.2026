import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_ANON_KEY in Replit Secrets."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: "public",
  },
});

export async function initializeSupabase() {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Supabase connection error:", error);
      throw error;
    }

    console.log("✓ Supabase connection successful");
    return true;
  } catch (error) {
    console.error("Failed to initialize Supabase:", error);
    throw error;
  }
}
