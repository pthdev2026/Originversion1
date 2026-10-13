/**
 * Erreur « définitive » : réessayer ne servirait à rien (fichier illisible, sans vidéo, vide…).
 * Les autres erreurs (disque plein, ffmpeg tué, coupure…) sont considérées comme temporaires et réessayées.
 */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

/** Le travailleur doit s'arrêter (arrêt demandé, tâche annulée ou reprise par un autre). */
export class JobAbortedError extends Error {
  constructor(message = 'Tâche interrompue.') {
    super(message);
    this.name = 'JobAbortedError';
  }
}
