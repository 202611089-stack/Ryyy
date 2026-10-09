require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }

  if (!username || !password) {
    console.error("Error: Missing ADMIN_USERNAME or ADMIN_PASSWORD environment variable.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { data, error } = await supabase
      .from("admins")
      .insert([{ username: username, password_hash: passwordHash }])
      .select();

    if (error) {
      if (error.code === "23505") {
        console.log(`Error: Admin user "${username}" already exists.`);
      } else {
        console.error("Database error creating admin:", error.message);
      }
      process.exit(1);
    }

    console.log(`Success: Admin user "${username}" successfully created.`);
    process.exit(0);
  } catch (err) {
    console.error("Unexpected error:", err.message);
    process.exit(1);
  }
}

main();