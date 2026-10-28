// Creates missing tables / columns automatically, so updating the site never needs manual SQL.

let ready = null;

const NEW_PAGE_COLUMNS = [
  ['tags', "TEXT NOT NULL DEFAULT '[]'"],
  ['meta_description', "TEXT NOT NULL DEFAULT ''"],
  ['cover_url', "TEXT NOT NULL DEFAULT ''"],
  ['published_at', 'TEXT'],
];

async function migrate(db) {
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_pages_status ON pages (status)'),
    db.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL, first_at INTEGER NOT NULL)'),
  ]);

  const info = await db.prepare('PRAGMA table_info(pages)').all();
  const have = new Set((info.results || []).map((c) => c.name));
  for (const [name, def] of NEW_PAGE_COLUMNS) {
    if (!have.has(name)) await db.prepare(`ALTER TABLE pages ADD COLUMN ${name} ${def}`).run();
  }
  // Pages that were already published before this update keep a sensible date.
  await db.prepare("UPDATE pages SET published_at = created_at WHERE status = 'published' AND published_at IS NULL").run();
}

export function ensureSchema(env) {
  if (!ready) {
    ready = migrate(env.DB).catch((err) => {
      ready = null; // try again on the next request
      throw err;
    });
  }
  return ready;
}
