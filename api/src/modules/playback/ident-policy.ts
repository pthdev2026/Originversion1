/**
 * Politique de l'ident de marque (la séquence « ORIGIN » avant un programme).
 *
 * Objectifs : (1) marquer l'identité à la PREMIÈRE rencontre avec un titre, (2) laisser au lecteur le temps de
 * précharger le programme pendant que l'ident joue, (3) ne jamais agacer : pas de répétition à chaque épisode,
 * ni à chaque reprise.
 *
 * Fonction pure : toute la décision est ici, testable sans base ni réseau. Le front n'a PAS à deviner : il suit
 * le champ `ident.show` renvoyé par l'API.
 */
export type IdentPolicy = 'title' | 'season' | 'always' | 'off';

export type IdentReason =
  | 'first_view'          // première fois que ce titre (ou cette saison) est regardé
  | 'always'
  | 'policy_off'
  | 'unavailable'         // aucun média d'ident publié
  | 'is_brand_asset'      // on ne précède pas l'ident par lui-même
  | 'autoplay_next'       // épisode suivant enchaîné automatiquement
  | 'resume'              // reprise en cours de lecture
  | 'already_seen';       // déjà vu pour ce titre / cette saison

export interface IdentInput {
  policy: IdentPolicy;
  identAvailable: boolean;
  isBrandAsset: boolean;
  /** Le compte a déjà une progression sur ce titre (film ou n'importe quel épisode). Faux pour un visiteur anonyme. */
  hasProgressInTitle: boolean;
  /** Le compte a déjà une progression dans cette saison. Pour un film : identique à `hasProgressInTitle`. */
  hasProgressInSeason: boolean;
  /** Position de reprise de CE média, en secondes (0 si jamais commencé). */
  resumeSeconds: number;
  /** Le navigateur indique avoir déjà joué l'ident pour ce titre (visiteur anonyme). */
  clientSeen: boolean;
  /** Le lecteur enchaîne automatiquement l'épisode suivant. */
  autoplayNext: boolean;
}

export interface IdentDecision {
  show: boolean;
  reason: IdentReason;
}

/** En dessous de ce seuil, une « reprise » n'en est pas une (cohérent avec la liste « Reprendre »). */
export const RESUME_THRESHOLD_SECONDS = 10;

export function decideIdent(input: IdentInput): IdentDecision {
  if (input.policy === 'off') return { show: false, reason: 'policy_off' };
  if (input.isBrandAsset) return { show: false, reason: 'is_brand_asset' };
  if (!input.identAvailable) return { show: false, reason: 'unavailable' };
  if (input.autoplayNext) return { show: false, reason: 'autoplay_next' };
  if (input.resumeSeconds >= RESUME_THRESHOLD_SECONDS) return { show: false, reason: 'resume' };
  if (input.policy === 'always') return { show: true, reason: 'always' };

  const seen = input.policy === 'season' ? input.hasProgressInSeason : input.hasProgressInTitle;
  if (seen || input.clientSeen) return { show: false, reason: 'already_seen' };
  return { show: true, reason: 'first_view' };
}

/** « <slug>-s2-e5 » → { slug: '<slug>', season: 2 } ; un film (« <slug> ») n'a pas de saison. */
export function parsePlaybackId(playbackId: string): { seasonPrefix: string | null } {
  const match = /^(.*)-s(\d+)-e\d+$/.exec(playbackId);
  return { seasonPrefix: match ? `${match[1]}-s${match[2]}-` : null };
}
