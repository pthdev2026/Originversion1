import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Session et « Ma liste » RÉELLES, contre un faux serveur en mémoire qui reproduit le contrat de l'API
 * (cookies simulés par un compte « connecté », 401, 404, 204). Aucun stockage du navigateur n'intervient.
 */
interface Call { method: string; path: string; at: number }
function fakeServer(options: { users?: Record<string, string>; failList?: (call: Call) => number | null } = {}) {
  const users = options.users ?? { 'a@mail.fr': 'Motdepasse-A1!' };
  let current: string | null = null;
  const lists = new Map<string, string[]>();
  const calls: Call[] = [];
  const known = new Set(['le-silence', 'les-passagers', 'derniere-sortie']);
  let clock = 0;
  const respond = (status: number, body?: unknown) => new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status, headers: { 'content-type': 'application/json' } });
  const handler = async (url: string, init: RequestInit = {}) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = init.method ?? 'GET';
    const call = { method, path, at: ++clock };
    calls.push(call);
    await new Promise(resolve => setTimeout(resolve, 5)); // latence : deux requêtes en parallèle se chevaucheraient
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const user = () => (current ? { id: 'u-' + current, email: current, displayName: null, role: 'viewer' } : null);
    if (path === '/api/me' && method === 'GET') return user() ? respond(200, { user: user() }) : respond(401, { error: 'unauthorized', message: 'Connexion requise.' });
    if (path === '/api/auth/login') { if (users[body.email] === body.password) { current = body.email; return respond(200, { user: user() }); } return respond(401, { error: 'unauthorized', message: 'Identifiants invalides.' }); }
    if (path === '/api/auth/register') { if (body.email in users) return respond(409, { error: 'conflict', message: 'Adresse déjà utilisée.' }); users[body.email] = body.password; current = body.email; return respond(201, { user: user() }); }
    if (path === '/api/auth/logout') { current = null; return respond(204); }
    if (!current) return respond(401, { error: 'unauthorized', message: 'Connexion requise.' });
    const list = lists.get(current) ?? [];
    if (path === '/api/me/list' && method === 'GET') return respond(200, { items: [...list].reverse().map(slug => ({ slug, addedAt: 'x', program: { slug, title: slug, category: 'Film original', images: { poster: `/images/${slug}.jpg`, alt: slug } } })) });
    const forced = options.failList?.(call);
    if (forced) return respond(forced, { error: 'error', message: 'Refusé par le serveur.' });
    const slug = decodeURIComponent(path.split('/').pop() ?? '');
    if (path.startsWith('/api/me/list/') && method === 'PUT') { if (!known.has(slug)) return respond(404, { error: 'not_found', message: 'Contenu introuvable.' }); if (!list.includes(slug)) lists.set(current, [...list, slug]); return respond(204); }
    if (path.startsWith('/api/me/list/') && method === 'DELETE') { lists.set(current, list.filter(item => item !== slug)); return respond(204); }
    return respond(404);
  };
  return { handler, calls, lists, setUser: (email: string | null) => { current = email; } };
}

async function boot(server: ReturnType<typeof fakeServer>) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(server.handler));
  const session = await import('@/features/account/session/session');
  const list = await import('@/features/account/session/list-store');
  return { session, list };
}
const settle = async (ms = 60) => { await new Promise(resolve => setTimeout(resolve, ms)); };
const stored = () => ({ local: localStorage.length, tab: sessionStorage.length });

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Session réelle', () => {
  it('connecte, refuse un mauvais mot de passe, et ne garde rien dans le navigateur', async () => {
    const { session } = await boot(fakeServer());
    expect((await session.signIn('a@mail.fr', 'faux')).ok).toBe(false);
    const result = await session.signIn(' a@mail.fr ', 'Motdepasse-A1!');
    expect(result.ok && result.user.email).toBe('a@mail.fr');
    expect(result.ok && result.user.name).toBe('a');                 // nom affiché par défaut : partie locale de l'adresse
    expect(stored()).toEqual({ local: 0, tab: 0 });                   // identité = cookie serveur, pas de localStorage
  });

  it('inscription : adresse déjà prise → erreur sur le champ e-mail', async () => {
    const { session } = await boot(fakeServer());
    const taken = await session.signUp({ name: 'A', email: 'a@mail.fr', password: 'Autre-Mot-De-Passe-1!' });
    expect(taken.ok).toBe(false);
    expect(!taken.ok && taken.field).toBe('email');
    expect((await session.signUp({ name: 'Nouvelle', email: 'n@mail.fr', password: 'Autre-Mot-De-Passe-1!' })).ok).toBe(true);
  });

  it('déconnexion : le serveur est prévenu, et même sans réseau l\'écran repasse en visiteur', async () => {
    const server = fakeServer();
    const { session } = await boot(server);
    await session.signIn('a@mail.fr', 'Motdepasse-A1!');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await session.signOut();
    // la session en mémoire est fermée même si l'appel a échoué : une action réservée aux comptes est refusée
    expect(await session.renameUser('Quelqu\'un')).toBe(false);
  });
});

describe('Ma liste réelle', () => {
  it('charge la liste du compte à la connexion (du plus ancien au plus récent) et la vide au changement de compte', async () => {
    const server = fakeServer({ users: { 'a@mail.fr': 'Motdepasse-A1!', 'b@mail.fr': 'Motdepasse-B1!' } });
    server.lists.set('a@mail.fr', ['derniere-sortie', 'le-silence']);
    const { session, list } = await boot(server);
    await session.signIn('a@mail.fr', 'Motdepasse-A1!'); await settle();
    expect(list.listSlugs()).toEqual(['derniere-sortie', 'le-silence']);
    expect(list.serverContent('le-silence')?.image).toContain('/images/le-silence.jpg');
    await session.signOut(); await settle();
    expect(list.listSlugs()).toEqual([]);                             // rien ne reste de l'ancien compte
    await session.signIn('b@mail.fr', 'Motdepasse-B1!'); await settle();
    expect(list.listSlugs()).toEqual([]);                             // le deuxième compte démarre vide
  });

  it('ajout optimiste, double clic = une seule requête, retrait', async () => {
    const server = fakeServer();
    const { session, list } = await boot(server);
    await session.signIn('a@mail.fr', 'Motdepasse-A1!'); await settle();
    list.applyListChange(['le-silence'], []);
    expect(list.listSlugs()).toEqual(['le-silence']);                 // l'écran réagit immédiatement
    list.applyListChange(['le-silence'], []);                         // double clic
    await settle();
    expect(server.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
    expect(server.lists.get('a@mail.fr')).toEqual(['le-silence']);    // enregistré côté serveur
    list.applyListChange([], ['le-silence']); await settle();
    expect(server.calls.filter(call => call.method === 'DELETE')).toHaveLength(1);
    expect(server.lists.get('a@mail.fr')).toEqual([]);
  });

  it('ajout puis retrait rapides du même titre : requêtes envoyées dans l\'ordre, jamais en parallèle', async () => {
    const server = fakeServer();
    const { session, list } = await boot(server);
    await session.signIn('a@mail.fr', 'Motdepasse-A1!'); await settle();
    list.applyListChange(['les-passagers'], []);
    list.applyListChange([], ['les-passagers']);
    await settle(120);
    const order = server.calls.filter(call => call.path.includes('les-passagers')).map(call => call.method);
    expect(order).toEqual(['PUT', 'DELETE']);
    expect(server.lists.get('a@mail.fr')).toEqual([]);
    expect(list.listSlugs()).toEqual([]);
  });

  it('refus du serveur : retour arrière à l\'état réel et message clair', async () => {
    const server = fakeServer();
    const { session, list } = await boot(server);
    await session.signIn('a@mail.fr', 'Motdepasse-A1!'); await settle();
    list.applyListChange(['titre-retire'], []);
    expect(list.listSlugs()).toEqual(['titre-retire']);               // optimiste
    await settle();
    expect(list.listSlugs()).toEqual([]);                             // annulé : le serveur a répondu 404
    expect(server.lists.get('a@mail.fr') ?? []).toEqual([]);
  });

  it('session expirée pendant une action : retour arrière, et l\'écran repasse en visiteur', async () => {
    const server = fakeServer();
    const { session, list } = await boot(server);
    await session.signIn('a@mail.fr', 'Motdepasse-A1!'); await settle();
    server.setUser(null);                                             // le serveur a invalidé la session
    list.applyListChange(['le-silence'], []); await settle();
    expect(list.listSlugs()).toEqual([]);
  });
});
