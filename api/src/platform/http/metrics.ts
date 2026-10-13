/**
 * Compteurs de supervision au format texte « Prometheus » (lisible par la plupart des outils d'alerte).
 * Cardinalité volontairement faible : on regroupe par famille de routes et par classe de statut, jamais par URL.
 */
import type { MiddlewareHandler } from 'hono';

export interface MetricsRegistry {
  middleware: MiddlewareHandler;
  /** Texte d'exposition, en ajoutant les jauges calculées par l'appelant. */
  render(gauges?: Record<string, number | { help: string; value: number; labels?: Record<string, string> }[]>): string;
}

function family(pathname: string): string {
  if (pathname.startsWith('/media/')) return 'media';
  if (pathname.startsWith('/uploads')) return 'uploads';
  if (pathname.startsWith('/api/')) return 'api';
  return 'other';
}

export function createMetrics(): MetricsRegistry {
  const requests = new Map<string, { count: number; seconds: number }>();
  const startedAt = Date.now();

  return {
    middleware: async (c, next) => {
      const begin = performance.now();
      await next();
      const key = `${family(new URL(c.req.url).pathname)}|${Math.floor(c.res.status / 100)}xx`;
      const entry = requests.get(key) ?? { count: 0, seconds: 0 };
      entry.count += 1;
      entry.seconds += (performance.now() - begin) / 1000;
      requests.set(key, entry);
    },
    render(gauges = {}) {
      const lines: string[] = [
        '# HELP origin_http_requests_total Requêtes HTTP par famille de routes et classe de statut.',
        '# TYPE origin_http_requests_total counter',
      ];
      for (const [key, value] of requests) {
        const [route, status] = key.split('|');
        lines.push(`origin_http_requests_total{route="${route}",status="${status}"} ${value.count}`);
      }
      lines.push('# HELP origin_http_request_duration_seconds_sum Temps cumulé de traitement.', '# TYPE origin_http_request_duration_seconds_sum counter');
      for (const [key, value] of requests) {
        const [route, status] = key.split('|');
        lines.push(`origin_http_request_duration_seconds_sum{route="${route}",status="${status}"} ${value.seconds.toFixed(3)}`);
      }
      lines.push(
        '# HELP origin_process_uptime_seconds Durée depuis le démarrage.', '# TYPE origin_process_uptime_seconds gauge',
        `origin_process_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`,
        '# HELP origin_process_memory_bytes Mémoire résidente.', '# TYPE origin_process_memory_bytes gauge',
        `origin_process_memory_bytes ${process.memoryUsage().rss}`,
      );
      for (const [name, gauge] of Object.entries(gauges)) {
        if (typeof gauge === 'number') {
          lines.push(`# TYPE ${name} gauge`, `${name} ${gauge}`);
        } else {
          lines.push(`# HELP ${name} ${gauge[0]?.help ?? ''}`, `# TYPE ${name} gauge`);
          for (const sample of gauge) {
            const labels = sample.labels ? `{${Object.entries(sample.labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : '';
            lines.push(`${name}${labels} ${sample.value}`);
          }
        }
      }
      return `${lines.join('\n')}\n`;
    },
  };
}
