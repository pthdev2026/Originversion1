/**
 * Connexion à PostgreSQL.
 *
 * Un seul « pool » de connexions est créé au démarrage et partagé par toute l'application.
 * Les modules ne se connectent jamais eux-mêmes : ils reçoivent `sql` en paramètre
 * (voir `createApp`). C'est ce qui permet de tester un module avec une base jetable.
 */
import postgres from 'postgres';

export type Sql = postgres.Sql;

/** Accepte la connexion normale OU une transaction : pour les fonctions de repository utilisables dans les deux cas. */
export type Executor = postgres.Sql | postgres.TransactionSql;

export function connect(url: string, options: postgres.Options<Record<string, postgres.PostgresType>> = {}): Sql {
  return postgres(url, { max: 10, idle_timeout: 20, onnotice: () => undefined, ...options });
}
