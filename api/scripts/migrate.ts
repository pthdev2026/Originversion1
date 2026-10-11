import { connect } from '../src/db/client.ts';
import { migrate } from '../src/db/migrate.ts';

const sql = connect();
try {
  const applied = await migrate(sql);
  console.log(applied.length ? `Migrations appliquées : ${applied.join(', ')}` : 'Base à jour.');
} finally {
  await sql.end();
}
