import { createFileRoute, useRouter } from "@tanstack/react-router";
import { fetchHome } from '@/lib/catalog-api';
import { applyServerCatalog } from '@/lib/origin-catalogs';
import { OriginHero } from '@/components/origin/origin-hero';
import { OriginTopTen } from '@/components/origin/origin-top-ten';
import { OriginSuggestions } from '@/components/origin/origin-suggestions';
import { OriginUniverses } from '@/components/origin/origin-universes';
import { PthOriginals } from '@/components/origin/pth-originals';
import { ContentCarousel } from '@/components/origin/content-carousel';
import { ThemeExplorer } from '@/components/origin/theme-explorer';
import { OriginCreators } from '@/components/origin/origin-creators';
import { useRef } from 'react';
import { useScrollScenes } from '@/components/origin/use-scroll-scenes';

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: 'ORIGIN — Des histoires qui nous transforment' },
    { name: 'description', content: 'Découvrez ORIGIN, l’expérience cinématographique de Partage Ton Histoire. Films, séries et récits humains de transformation.' },
    { property: 'og:title', content: 'ORIGIN — Des histoires qui nous transforment' },
    { property: 'og:description', content: 'Le contenu raconte l’émotion. L’interface prépare la rencontre. Découvrez les histoires à l’affiche sur ORIGIN.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  // Le catalogue vient du serveur (accueil complet en un appel), avant l'affichage : aucune donnée de remplacement inventée en cas d'échec.
  loader: () => fetchHome(),
  staleTime: 30_000,
  errorComponent: HomeError,
  component: Index,
});

function HomeError({ error }: { error: unknown }) {
  const router = useRouter();
  return <main className="origin-experience"><section className="empty-hero" role="alert">
    <span className="origin-wordmark">MILLENIUM</span>
    <p>Le catalogue est momentanément indisponible.</p>
    <p><button type="button" className="mx-btn" onClick={() => void router.invalidate()}>Réessayer</button></p>
    {import.meta.env.DEV && <small>{error instanceof Error ? error.message : String(error)}</small>}
  </section></main>;
}

function Index() {
  const home = Route.useLoaderData();
  // Les thématiques, « Ma liste », « Continuer à regarder »… lisent le même catalogue : on y place les fiches du serveur (idempotent).
  applyServerCatalog(home.contents, home.themes, { themeShowcase: home.themeShowcase, themeOrder: home.themeOrder, trending: home.trending });
  const root = useRef<HTMLElement>(null);
  useScrollScenes(root);
  return <main ref={root} className="origin-experience">
    <OriginHero programs={home.hero} />
    <OriginTopTen programs={home.topTen} />
    <ContentCarousel {...home.rails.newReleases} />
    <OriginSuggestions programs={home.suggestions} />
    <ThemeExplorer />
    <OriginUniverses programs={home.universes} />
    <PthOriginals episodes={home.pthEpisodes} />
    <OriginCreators creators={home.creators} />
    <ContentCarousel {...home.rails.suspense} />
    <ContentCarousel {...home.rails.drama} />
    <ContentCarousel {...home.rails.couple} />
    <ContentCarousel {...home.rails.scienceFiction} />
  </main>;
}
