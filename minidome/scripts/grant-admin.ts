/** Makes an existing account a site administrator.  Usage: npx tsx scripts/grant-admin.ts --email you@example.com */
import pg from "pg";

async function main() {
  const i = process.argv.indexOf("--email");
  const email = i > 0 ? process.argv[i + 1] : undefined;
  if (!email) throw new Error("Usage: --email you@example.com");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const r = await db.query(`update profiles set is_site_admin = true where lower(email) = lower($1) returning id`, [email]);
  console.log(r.rowCount ? `${email} is now a site administrator.` : `No account found for ${email}. Sign up first.`);
  await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
