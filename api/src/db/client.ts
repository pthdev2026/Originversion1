import postgres from 'postgres';

export type Sql = postgres.Sql;

// Valeur de développement uniquement : l'instance locale n'écoute que sur 127.0.0.1.
export const DEV_DATABASE_URL = 'postgres://origin:origin_dev@127.0.0.1:5433/origin';

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL est obligatoire en production.');
  return DEV_DATABASE_URL;
}

export function connect(url = databaseUrl(), options: postgres.Options<Record<string, postgres.PostgresType>> = {}): Sql {
  return postgres(url, { max: 10, idle_timeout: 20, onnotice: () => undefined, ...options });
}
