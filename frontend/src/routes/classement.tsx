import { createFileRoute, useRouter } from '@tanstack/react-router';
import { RankingPage } from '@/components/origin/ranking-page';
import { fetchRanking } from '@/lib/catalog-api';

export const Route = createFileRoute('/classement')({
  head: () => ({ meta: [
    { title: 'Classement complet | ORIGIN' },
    { name: 'description', content: 'Tous les films, séries et documentaires d’ORIGIN, classés selon leur audience de la semaine.' },
    { property: 'og:title', content: 'Classement complet | ORIGIN' },
    { property: 'og:type', content: 'website' },
  ] }),
  // Classement réel du serveur : Top 10 éditorial d'abord, puis audience. Aucune liste de remplacement en cas d'échec.
  loader: () => fetchRanking(),
  staleTime: 30_000,
  errorComponent: RankingError,
  component: RankingRoute,
});

function RankingRoute() {
  const ranking = Route.useLoaderData();
  // Catalogue vide (aucun programme publié avec visuel) : un message, jamais une page blanche.
  if (ranking.length === 0) return <main className="origin-experience"><section className="empty-hero">
    <span className="origin-wordmark">MILLENIUM</span>
    <p>Le classement se remplira dès que des programmes seront publiés.</p>
  </section></main>;
  return <RankingPage ranking={ranking} />;
}

function RankingError() {
  const router = useRouter();
  return <main className="origin-experience"><section className="empty-hero" role="alert">
    <span className="origin-wordmark">MILLENIUM</span>
    <p>Le classement est momentanément indisponible.</p>
    <p><button type="button" className="mx-btn" onClick={() => void router.invalidate()}>Réessayer</button></p>
  </section></main>;
}
