<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## ORIGIN frontend architecture
- Keep the first ORIGIN experience in the index route and compose it from independent feature components; this preserves the approved hero without creating unrequested pages.
- Keep typed demonstration program data separate from presentation, with optional playback URLs and title-logo assets; this allows an independent backend to replace data without redesigning the UI.
- Keep video playback as an explicit unavailable integration point until a real service is supplied. Account access currently runs on a local demo session (src/lib/demo-session.ts, test accounts in src/lib/demo-accounts.ts) requested for testing the menu → sign-in → sign-up flow; keep it isolated so the real account service can replace it without touching the pages. « Votre espace » (/compte, /ma-liste, /continuer, /parametres) reads its per-account demo data (photo, list, progress, devices, preferences) from src/lib/demo-space.ts, isolated the same way; progress there is demo data until the video service supplies real positions.
- Render approved homepage sections as sibling feature components in their editorial order, and keep Top 10 rankings in separate typed demo data; this preserves the hero and allows independent catalog integration.
- Apply atmospheric background tokens on the shared homepage container rather than separate section backgrounds; this prevents visible color seams between editorial sections.
- Keep chromo effects in shared CSS tokens and render film grain as a pointer-transparent homepage pseudo-element; this preserves consistent treatments without blocking carousel interactions.
- Compose the testimonial panels from an explicit typed selection independent of the recommendations, with focus, pointer and touch sharing one selection state; this prevents recommendation additions from expanding the approved composition.
- Keep PTH Originals episode data separate from its synchronized image/episode slider, and pause automatic rotation offscreen, during interaction and for reduced motion; this preserves catalog portability and accessible playback controls.
- Every homepage content opens the universal watch landing at /production/$slug, resolved by src/lib/watch-catalog.ts into one Production shape (kind film/serie/documentaire; films hold a single feature entry, series without supplied episodes stay empty); playback stays a timed visual state machine so the future video service can drive the same states.
- Keep homepage catalogs and theme assignments in one typed data module with an optional collection cardStyle, rendered by the shared accessible carousel; this allows distinct portrait art direction without duplicating navigation or blocking CMS replacement.
- Creator profiles live in typed data (src/lib/origin-creators.ts) with real photo asset pointers and explicit provisional flags; this keeps unconfirmed editorial fields replaceable without inventing facts.
- Suggestion cards carry a per-card fontStyle (condensed/serif/bebas/italic-serif) because the rail mixes categories; keep the field in typed demo data so the CMS can set each card's art direction.
- Episode watch status derives only from optional video-service progress; manual watched overrides remain page-session state until a service is explicitly requested, so selections and demo playback never fabricate viewing history.
- Every clickable control follows the shared interaction states at the end of src/styles.css (« Design system — retours d'interaction »): hover (brighten or a thin silver neon line), press (`scale` .965 plus a brief neon outline, independent of existing transforms and shadows) and a 2 px focus-visible outline. Add any new button class to those selectors instead of inventing its own feedback.
- The Top 10 (src/components/origin/origin-top-ten.tsx) is an accordion strip: the lit card opens wide, the others stay closed, and the section takes the universe of the lit title (blurred key visual + three palette colours, src/components/origin/ranking-ambient.tsx, colours from `palette` in src/lib/origin-top-ten.ts, derived from the id when absent). Selection follows the pointer, a trackpad swipe, the arrows or the keyboard; after 3 s on a card it offers « Voir la bande-annonce » / « Regarder maintenant » (both open /production/$slug until a video service exists). « Voir le classement complet » opens /classement (src/components/origin/ranking-page.tsx), which reuses the same ambient. Do not pin or scroll-drive the strip.
- The MILLENIUM page loader only plays when the site itself opens (first visit, reload). Moving between pages never replays it; keep it that way.
- The programme page (/production/$slug) is src/components/production/program-page.tsx: a full-bleed first screen with one primary action and a glass dock (trailer when `trailerUrl` exists, my list, audio/subtitles, share), then episodes (series), audio and subtitle choices with a live subtitle preview, and similar titles, all over the same ambient as the Top 10. Choosing an episode brings the page back to the top with that episode in the foreground; playback opens the player by itself once ready. The previous landing (watch-landing.tsx) is no longer used and can be restored from git history if needed.
