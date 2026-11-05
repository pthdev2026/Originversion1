import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { getCreatorUniverse } from '@/lib/creator-universes';
import { CreatorUniverseScreen } from '@/components/creator/creator-universe';

export const Route = createFileRoute('/createur/$slug')({
  loader: ({ params }) => {
    if (!getCreatorUniverse(params.slug)) throw notFound();
    return { slug: params.slug };
  },
  head: ({ loaderData }) => {
    const universe = loaderData && getCreatorUniverse(loaderData.slug);
    if (!universe) return { meta: [{ title: 'Univers introuvable — ORIGIN' }, { name: 'robots', content: 'noindex' }] };
    const title = `${universe.creator.name} — Son univers | ORIGIN`;
    return { meta: [
      { title }, { name: 'description', content: universe.tagline },
      { property: 'og:title', content: title }, { property: 'og:description', content: universe.tagline },
      { property: 'og:type', content: 'profile' }, { name: 'twitter:card', content: 'summary_large_image' },
    ] };
  },
  notFoundComponent: CreatorNotFound,
  component: CreatorUniversePage,
});

function CreatorNotFound() {
  return <main className="production-page production-missing"><p role="heading" aria-level={1}>Cet univers est introuvable.</p><Link to="/" hash="createurs" className="hud-glass">Retour aux créateurs</Link></main>;
}

function CreatorUniversePage() {
  const { slug } = Route.useLoaderData();
  return <CreatorUniverseScreen slug={slug} />;
}
