/** Liest die Umgebung ein und bricht frueh ab, wenn Pflichtwerte fehlen. */
export function loadConfig(env = process.env) {
  const token = env.DISCORD_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'DISCORD_TOKEN fehlt. Trage den Bot-Token in die .env ein (siehe docs/setup.md).',
    );
  }
  return {
    token,
    databasePath: env.DATABASE_PATH?.trim() || '/data/bot.sqlite',
    settingsPollMs: Number(env.SETTINGS_POLL_MS ?? 15_000),
  };
}
