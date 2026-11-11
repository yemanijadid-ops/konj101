export const DEFAULT_SETTINGS = {
  site_name: 'konj.101',
  tagline: 'گوشه‌ای برای روانشناسی و خلاصه‌ی کتاب‌ها',
  show_hero: '1',
  hero_title: 'به کنج خوش اومدی',
  hero_text: 'اینجا درباره‌ی روانشناسی می‌نویسم و خلاصه‌ی کتاب‌هایی رو که خوندم می‌ذارم.',
  list_title: 'نوشته‌ها',
  footer_text: '',
  meta_description: '',
};

export async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const row of results || []) if (row.key in DEFAULT_SETTINGS) s[row.key] = row.value;
  return s;
}

export async function saveSettings(env, values) {
  const stmts = Object.entries(values).map(([k, v]) =>
    env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v))
  );
  if (stmts.length) await env.DB.batch(stmts);
}
