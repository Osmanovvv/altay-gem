/**
 * Накат миграций (bun run db:migrate).
 * Программный мигратор drizzle: журнал __drizzle_migrations, forward-only.
 * Используется локально, в CI и при деплое.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL не задан — накат миграций невозможен.');
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
    console.log('[migrate] все миграции применены');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const cause =
    err instanceof Error && err.cause instanceof Error
      ? `\n  причина: ${err.cause.message}`
      : '';
  console.error(
    '[migrate] ошибка:',
    (err instanceof Error ? err.message : String(err)) + cause,
  );
  process.exit(1);
});
