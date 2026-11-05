import { env } from '@/lib/env';

/** Télécharge la copie des données du compte (GET /api/me/export : fichier JSON, jamais de secret). Renvoie un message pour l'écran. */
export async function downloadMyData(): Promise<{ ok: boolean; message: string }> {
  if (!env.apiUrl) return { ok: false, message: 'Le service ORIGIN n’est pas configuré.' };
  try {
    const response = await fetch(`${env.apiUrl}/api/me/export`, { credentials: 'include' });
    if (response.status === 401) return { ok: false, message: 'Votre session a expiré : reconnectez-vous.' };
    if (!response.ok) return { ok: false, message: 'Impossible de préparer votre copie pour le moment.' };
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mes-donnees-millenium.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true, message: 'Votre copie est téléchargée.' };
  } catch {
    return { ok: false, message: 'Service momentanément indisponible. Réessayez.' };
  }
}
