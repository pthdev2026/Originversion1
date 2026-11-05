import { OfflineBanner } from '@/components/origin/offline-banner';
import { ListErrorToast } from '@/features/account/pages/list-error-toast';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { startTvMode } from "@/lib/tv-mode";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PageLoader } from "@/components/page-loader";
import { SmoothScroll } from "@/components/smooth-scroll";
import { OriginFooter } from "@/components/origin/origin-footer";
import { MobileTabBar } from '@/components/origin/mobile-tab-bar';
import { SiteHeader } from "@/components/origin/site-header";
import { FloatingMenu } from "@/components/origin/floating-menu";

function NotFoundComponent() {
  return (
    <main className="production-page production-missing">
      {/* React 19 place ces balises dans <head> */}
      <title>Page introuvable — MILLENIUM</title>
      <meta name="robots" content="noindex" />
      <p role="heading" aria-level={1}>Cette page est introuvable.</p>
      <Link to="/" className="hud-glass">Retour à l’accueil</Link>
    </main>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="production-page production-missing" role="alert">
      <p role="heading" aria-level={1}>Cette page n’a pas pu se charger.</p>
      <p>Un problème est survenu de notre côté. Vous pouvez réessayer ou revenir à l’accueil.</p>
      <div className="playback-row">
        <button
          type="button"
          className="hud-primary"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Réessayer
        </button>
        <a href="/" className="hud-glass">Retour à l’accueil</a>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { property: "og:site_name", content: "ORIGIN" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&family=Michroma&family=Montserrat:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const RELOAD_TO_TOP = "try{if('scrollRestoration'in history)history.scrollRestoration='manual';var n=performance.getEntriesByType('navigation')[0];if(n&&n.type==='reload'&&location.hash){history.replaceState(history.state,'',location.pathname+location.search);}}catch(e){}";

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
        {/* Runs before the app starts: a reload always opens on the top of the page, even if the address kept an anchor. */}
        <script dangerouslySetInnerHTML={{ __html: RELOAD_TO_TOP }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const BARE_PAGES = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/bienvenue', '/profils'];

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => startTvMode(), []);
  // Inner pages get the site bar; the homepage has its own in the hero, and the account pages stay bare.
  const pathname = useRouterState({ select: state => state.location.pathname });
  const showSiteHeader = pathname !== '/' && !BARE_PAGES.includes(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      {showSiteHeader && <SiteHeader />}
      {!BARE_PAGES.includes(pathname) && <FloatingMenu />}
      <Outlet />
      <OriginFooter />
      <OfflineBanner />
      <MobileTabBar />
      <ListErrorToast />
      <PageLoader />
      <SmoothScroll />
    </QueryClientProvider>
  );
}
