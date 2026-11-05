import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultEpisode, findEpisode, type ProductionEpisode } from '@/lib/productions';
import { fetchProductionPage, setEpisodeWatched, withProgress } from '@/lib/program-api';
import { useProgramProgress } from '@/lib/use-program-progress';
import { episodeWatchState, progressForEpisode } from '@/lib/episode-progress';
import { ProgramPage } from '@/components/production/program-page';
import { PlaybackExperience } from '@/components/production/playback-experience';

type Search = { episode?: string; play?: '1' };

export const Route = createFileRoute('/production/$slug')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s['episode'] === 'string' ? { episode: s['episode'] } : {}),
    ...(s['play'] === '1' || s['play'] === 1 ? { play: '1' as const } : {}),
  }),
  // La fiche vient du serveur (programme, saisons, épisodes, similaires, rang) : introuvable = 404 ; panne = écran d'erreur, jamais de fiche inventée.
  loader: async ({ params }) => {
    const page = await fetchProductionPage(params.slug);
    if (!page) throw notFound();
    return page;
  },
  staleTime: 30_000,
  head: ({ loaderData }) => {
    const p = loaderData?.production;
    if (!p) return { meta: [{ title: 'Programme introuvable — ORIGIN' }, { name: 'robots', content: 'noindex' }] };
    const title = `${p.title} — ${p.label} | ORIGIN`;
    return { meta: [
      { title }, { name: 'description', content: p.synopsis },
      { property: 'og:title', content: title }, { property: 'og:description', content: p.synopsis },
      { property: 'og:type', content: p.kind === 'serie' ? 'video.tv_show' : 'video.movie' }, { name: 'twitter:card', content: 'summary_large_image' },
      ...(/^https:\/\//.test(p.heroImage) ? [{ property: 'og:image', content: p.heroImage }, { name: 'twitter:image', content: p.heroImage }] : []),
    ] };
  },
  notFoundComponent: ProductionNotFound,
  component: WatchLandingPage,
});

function ProductionNotFound() {
  return <main className="production-page production-missing"><p role="heading" aria-level={1}>Ce programme est introuvable.</p><Link to="/" className="hud-glass">Retour à l’accueil</Link></main>;
}

function WatchLandingPage() {
  const page = Route.useLoaderData();
  const slug = page.production.slug;
  const { episode: initialId, play } = Route.useSearch();
  // Progression réelle des épisodes (compte connecté) appliquée à la fiche chargée.
  const { progress, reload } = useProgramProgress(slug);
  const production = useMemo(() => withProgress(page.production, progress), [page.production, progress]);
  const initial = production ? findEpisode(production, initialId) ?? defaultEpisode(production) : undefined;
  const [selected, setSelected] = useState<ProductionEpisode | null>(initial?.episode ?? null);
  // « Regarder » depuis la rangée d'un autre film : cette page s'ouvre directement sur le lecteur.
  const [playing, setPlaying] = useState<ProductionEpisode | null>(play && initial ? initial.episode : null);
  const [watchedOverrides, setWatchedOverrides] = useState<Record<string, boolean>>({});
  const [language, setLanguage] = useState('');
  const [seenSlug, setSeenSlug] = useState(slug);
  if (seenSlug !== slug) { setSeenSlug(slug); setSelected(initial?.episode ?? null); setPlaying(play && initial ? initial.episode : null); setWatchedOverrides({}); }
  // Le paramètre ?play=1 est consommé : il quitte l'adresse pour qu'un rechargement n'ouvre pas le lecteur.
  const navigate = useNavigate();
  useEffect(() => { if (play) void navigate({ to: '/production/$slug', params: { slug }, search: initialId ? { episode: initialId } : {}, replace: true }); }, [play, slug, initialId, navigate]);
  const close = useCallback(() => setPlaying(null), []);
  if (!production) return <ProductionNotFound />;
  const playingSeason = playing ? findEpisode(production, playing.id)?.season : undefined;

  return (
    <>
      <ProgramPage production={production} similar={page.similar} previews={page.previews} ranks={page.ranks} selected={selected} onSelect={setSelected} launching={Boolean(playing)} onLanguage={setLanguage}
        onWatch={e => { setSelected(e); setPlaying(e); }}
        watchedOverrides={watchedOverrides} onToggleWatched={e => {
          const watched = episodeWatchState(progressForEpisode(e, watchedOverrides[e.id])).status !== 'watched';
          setWatchedOverrides(previous => ({ ...previous, [e.id]: watched }));
          void setEpisodeWatched(slug, e, watched, e.watchProgress?.durationSeconds ?? 0)
            .then(() => reload())
            .catch(() => undefined)
            .finally(() => setWatchedOverrides(previous => { const { [e.id]: _gone, ...rest } = previous; return rest; })); // le serveur fait foi : l'écran revient à l'état réel (enregistré ou refusé)
        }} />
      {playing && playingSeason && <PlaybackExperience slug={production.slug} title={production.title} season={playingSeason} episode={playing} language={language} onClose={close} onPick={e => { setSelected(e); setPlaying(e); }} />}
    </>
  );
}
