/** Module « catalog » — aides de recherche pures (aucun accès base) : tolérance aux fautes de frappe. */

/** Distance d'édition (insertion, suppression, remplacement, échange de deux lettres voisines), avec arrêt anticipé au-delà de `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let beforePrevious: number[] = [];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, (beforePrevious[j - 2] ?? 0) + 1);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    beforePrevious = previous;
    previous = row;
  }
  return previous[b.length] ?? max + 1;
}

/** Fautes tolérées selon la longueur du mot : aucune sous 4 lettres (trop de faux amis), 1 jusqu'à 7, 2 au-delà. */
const allowedTypos = (length: number): number => (length < 4 ? 0 : length < 8 ? 1 : 2);

/**
 * Corrige les mots de la recherche qu'aucun mot connu ne contient : renvoie le mot connu le plus proche
 * (à égalité, le plus fréquent). Un mot déjà trouvable est laissé tel quel.
 */
export function correctTokens(tokens: string[], vocabulary: ReadonlyMap<string, number>): { tokens: string[]; changed: boolean } {
  let changed = false;
  const words = [...vocabulary.keys()];
  const corrected = tokens.map(token => {
    if (words.some(word => word.includes(token))) return token;
    const max = allowedTypos(token.length);
    if (max === 0) return token;
    let best: { word: string; distance: number; weight: number } | null = null;
    for (const word of words) {
      // Le début du mot saisi peut être incomplet (« mystèr », « passagr ») : on compare aussi au préfixe de même longueur.
      // La faute reste soumise au même plafond ; un préfixe classe simplement un demi-point derrière un mot entier équivalent.
      const whole = editDistance(token, word, max);
      const prefix = word.length > token.length ? editDistance(token, word.slice(0, token.length), max) : max + 1;
      const distance = Math.min(whole, prefix + 0.5);
      if (Math.min(whole, prefix) > max) continue;
      const weight = vocabulary.get(word) ?? 0;
      if (!best || distance < best.distance || (distance === best.distance && weight > best.weight)) best = { word, distance, weight };
    }
    if (!best) return token;
    changed = true;
    return best.word;
  });
  return { tokens: corrected, changed };
}
