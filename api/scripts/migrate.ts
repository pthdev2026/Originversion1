// Applique les migrations SQL en attente. Usage : npm run db:migrate
import { loadConfig } from '../src/config/env.ts';
import { connect } from '../src/platform/database/client.ts';
import { migrate } from '../src/platform/database/migrate.ts';

const config = loadConfig();
const sql = connect(config.databaseUrl);
try {
  const applied = await migrate(sql);
  console.log(applied.length ? `Migrations appliquées : ${applied.join(', ')}` : 'Base à jour.');
} finally {
  await sql.end();
}
