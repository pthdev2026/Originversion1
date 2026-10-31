/**
 * Définition UNIQUE de « l'audience » : une session de lecture compte comme une vue si elle date de moins de
 * AUDIENCE_WINDOW_DAYS jours et dure au moins AUDIENCE_MIN_WATCH_SECONDS (une ouverture accidentelle ne compte pas).
 * Utilisée par `/api/trending`, `/api/ranking` et le choix du programme phare de repli d'une thématique.
 * Les sessions ne sont acceptées qu'avec le jeton émis par la lecture (voir analytics/session-token.ts).
 */
export const AUDIENCE_WINDOW_DAYS = 14;
export const AUDIENCE_MIN_WATCH_SECONDS = 10;
