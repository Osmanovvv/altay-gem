/**
 * Тестовый сид реплики Эвотора (этап 1): 8 реальных товаров из дампа клиента
 * по двум магазинам. На этапе 2 будет заменён первичным импортом из API —
 * сид идемпотентен (upsert), безопасно гонять повторно.
 *
 * Запуск: bun run db:seed
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import seedData from './seed-data/evotor-seed.json';
import { evotorProducts, evotorStores } from './schema';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан');
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  try {
    for (const s of seedData.stores) {
      await db
        .insert(evotorStores)
        .values({ id: s.id, name: s.name, address: s.address })
        .onConflictDoUpdate({
          target: evotorStores.id,
          set: { name: s.name, address: s.address },
        });
    }
    for (const p of seedData.products) {
      await db
        .insert(evotorProducts)
        .values({
          storeId: p.storeId,
          evotorUuid: p.uuid,
          name: p.name,
          priceKopecks: p.priceKopecks,
          costPriceKopecks: p.costPriceKopecks ?? null,
          quantity: p.quantity,
          measure: p.measure,
          groupName: p.groupName,
          barcodes: p.barcodes,
          article: p.article ?? null,
          code: p.code ?? null,
          evotorType: p.evotorType,
          isMarked: p.isMarked,
          matchKey: p.matchKey,
        })
        .onConflictDoUpdate({
          target: [evotorProducts.storeId, evotorProducts.evotorUuid],
          set: {
            name: p.name,
            priceKopecks: p.priceKopecks,
            quantity: p.quantity,
            matchKey: p.matchKey,
            updatedAt: sql`now()`,
          },
        });
    }
    const [stores, products] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(evotorStores),
      db.select({ n: sql<number>`count(*)` }).from(evotorProducts),
    ]);
    console.log(
      `[seed] магазинов: ${stores[0].n}, товаров в реплике: ${products[0].n}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[seed] ошибка:', err instanceof Error ? err.message : err);
  process.exit(1);
});
