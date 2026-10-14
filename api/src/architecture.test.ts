/**
 * Garde-fous d'architecture : ces tests échouent si quelqu'un casse les règles de découpage.
 * Ils lisent les `import` du code source (pas d'exécution) et vérifient trois règles.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)].map(match => path.resolve(path.dirname(file), match[1] as string));

const moduleOf = (file: string): string | null => {
  const relative = path.relative(path.join(src, 'modules'), file);
  return relative.startsWith('..') ? null : (relative.split(path.sep)[0] ?? null);
};

describe('architecture', () => {
  it('le socle (platform/) ne dépend d’aucun module fonctionnel', () => {
    const violations = sourceFiles(path.join(src, 'platform'))
      .flatMap(file => importsOf(file).filter(target => moduleOf(target) !== null).map(target => `${path.relative(src, file)} → ${path.relative(src, target)}`));
    assert.deepEqual(violations, []);
  });

  it('les modules ne forment aucun cycle de dépendances', () => {
    const graph = new Map<string, Set<string>>();
    for (const file of sourceFiles(path.join(src, 'modules'))) {
      const from = moduleOf(file);
      if (!from) continue;
      const edges = graph.get(from) ?? new Set<string>();
      for (const target of importsOf(file)) {
        const to = moduleOf(target);
        if (to && to !== from) edges.add(to);
      }
      graph.set(from, edges);
    }
    const visiting = new Set<string>();
    const done = new Set<string>();
    const cycles: string[] = [];
    const visit = (node: string, trail: string[]) => {
      if (done.has(node)) return;
      if (visiting.has(node)) { cycles.push([...trail.slice(trail.indexOf(node)), node].join(' → ')); return; }
      visiting.add(node);
      for (const next of graph.get(node) ?? []) visit(next, [...trail, node]);
      visiting.delete(node);
      done.add(node);
    };
    for (const node of graph.keys()) visit(node, []);
    assert.deepEqual(cycles, []);
  });

  it('le SQL n’est écrit que dans les fichiers prévus pour (repository, lectures catalogue, mesures)', () => {
    const allowed = /(repository\.ts|\.repository\.ts|catalog\/content\.ts|catalog\/admin\.ts|analytics\/metrics\.ts|health\/routes\.ts|platform\/)/;
    const offenders = sourceFiles(path.join(src, 'modules'))
      .filter(file => /\bsql`|\btx`|\bsql\.unsafe\(/.test(readFileSync(file, 'utf8')))
      .map(file => path.relative(src, file))
      .filter(file => !allowed.test(file));
    assert.deepEqual(offenders, []);
  });
});
