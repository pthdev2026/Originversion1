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

/**
 * Durée maximale d'UNE requête : une requête qui s'éternise (index manquant, volume imprévu) est interrompue au lieu de
 * garder une connexion du pool — avec 10 connexions, quelques requêtes bloquées suffiraient à paralyser l'API.
 * Les opérations longues légitimes (sauvegarde, restauration) passent par des outils externes, pas par ce pool.
 */
export const STATEMENT_TIMEOUT_MS = 20_000;

export function connect(url: string, options: postgres.Options<Record<string, postgres.PostgresType>> = {}): Sql {
  const { connection, ...rest } = options;
  return postgres(url, {
    max: 10, idle_timeout: 20, onnotice: () => undefined,
    connection: { statement_timeout: STATEMENT_TIMEOUT_MS, ...connection },
    ...rest,
  });
}
