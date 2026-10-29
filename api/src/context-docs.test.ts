/**
 * Garde-fou « dossier de contexte » : `contexte-agents/` (lu par les agents) ne doit pas oublier un élément du système.
 * Il vérifie la COUVERTURE (chaque migration, module et variable d'environnement est mentionné), pas le sens :
 * la relecture reste nécessaire, mais une omission grossière fait échouer les tests.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const contextDir = path.join(root, 'contexte-agents');

function readAll(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => (entry.isDirectory() ? [readAll(path.join(dir, entry.name))] : entry.name.endsWith('.md') ? [readFileSync(path.join(dir, entry.name), 'utf8')] : []))
    .join('\n');
}
const context = readAll(contextDir);

describe('dossier de contexte des agents', () => {
  it('mentionne chaque migration', () => {
    // Le numéro doit apparaître comme un mot entier dans la fiche des données (et non par hasard dans un autre nombre).
    const data = readFileSync(path.join(contextDir, '04-donnees-et-modules.md'), 'utf8');
    const missing = readdirSync(path.join(root, 'api', 'migrations')).filter(file => file.endsWith('.sql'))
      .map(file => file.slice(0, 3)).filter(number => !new RegExp(`\\b${number}\\b`).test(data));
    assert.deepEqual(missing, [], 'numéros de migration absents de contexte-agents/ (voir 04-donnees-et-modules.md)');
  });

  it('mentionne chaque module', () => {
    const missing = readdirSync(path.join(root, 'api', 'src', 'modules'), { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).filter(name => !context.includes(`\`${name}\``));
    assert.deepEqual(missing, [], 'modules absents de contexte-agents/ (voir 04-donnees-et-modules.md §3)');
  });

  it('mentionne chaque variable d’environnement', () => {
    const source = readFileSync(path.join(root, 'api', 'src', 'config', 'env.ts'), 'utf8');
    const variables = [...source.matchAll(/^ {2}([A-Z][A-Z0-9_]+): z\./gm)].map(match => match[1] as string);
    assert.ok(variables.length >= 40, `seulement ${variables.length} variables détectées : le format de env.ts a-t-il changé ?`);
    const missing = variables.filter(name => !context.includes(name));
    assert.deepEqual(missing, [], 'variables absentes de contexte-agents/ (voir 09-exploitation-et-deploiement.md §2)');
  });

  it('mentionne chaque table créée par les migrations', () => {
    const tables = readdirSync(path.join(root, 'api', 'migrations')).filter(file => file.endsWith('.sql'))
      .flatMap(file => [...readFileSync(path.join(root, 'api', 'migrations', file), 'utf8').matchAll(/CREATE TABLE (\w+)/g)].map(match => match[1] as string));
    const missing = tables.filter(table => !context.includes(`\`${table}\``));
    assert.deepEqual(missing, [], 'tables absentes de contexte-agents/ (voir 04-donnees-et-modules.md §2)');
  });

  it('chaque fiche porte sa date de vérification', () => {
    const files = readdirSync(contextDir).filter(file => /^\d\d-.*\.md$/.test(file));
    assert.ok(files.length >= 12);
    const undated = files.filter(file => !/Vérifié le : \d{2}\/\d{2}\/\d{4}/.test(readFileSync(path.join(contextDir, file), 'utf8')));
    assert.deepEqual(undated, []);
  });

  it('les liens relatifs entre fiches pointent vers des fichiers existants', () => {
    const broken: string[] = [];
    for (const file of ['README.md', ...readdirSync(contextDir).filter(name => /^\d\d-.*\.md$/.test(name))]) {
      const text = readFileSync(path.join(contextDir, file), 'utf8');
      for (const match of text.matchAll(/\]\(([^)#\s]+\.md)\)/g)) {
        const target = match[1] as string;
        if (/^https?:/.test(target)) continue;
        try { readFileSync(path.join(contextDir, target)); } catch { broken.push(`${file} → ${target}`); }
      }
    }
    assert.deepEqual(broken, []);
  });
});
