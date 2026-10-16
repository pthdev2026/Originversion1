// Crée (ou promeut) un compte administrateur.
// Usage : npm run user:create-admin -- admin@exemple.fr
// Le mot de passe est saisi au clavier sans s'afficher (ou fourni par ADMIN_PASSWORD pour l'automatisation).
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { loadConfig } from '../src/config/env.ts';
import { insertUser } from '../src/modules/identity/repository.ts';
import { checkPasswordPolicy, hashPassword } from '../src/modules/identity/password.ts';
import { connect } from '../src/platform/database/client.ts';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage : npm run user:create-admin -- adresse@exemple.fr');
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (text: string) => void });
    write._writeToOutput = text => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const password = process.env['ADMIN_PASSWORD'] ?? (await askHidden('Mot de passe (10 caractères minimum) : '));
const problem = checkPasswordPolicy(password, email);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const config = loadConfig();
const sql = connect(config.databaseUrl);
try {
  const passwordHash = await hashPassword(password);
  const created = await insertUser(sql, { id: randomUUID(), email, passwordHash, displayName: null, role: 'admin', emailVerified: true });
  if (created) {
    console.log(`Administrateur créé : ${email}`);
  } else {
    await sql`UPDATE users SET role = 'admin', password_hash = ${passwordHash}, failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE email = ${email}`;
    console.log(`Compte existant promu administrateur (mot de passe mis à jour) : ${email}`);
  }
} finally {
  await sql.end();
}
