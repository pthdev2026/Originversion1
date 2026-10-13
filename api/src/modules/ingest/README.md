# Module « ingest »

**Rôle :** inscrire en base un média déjà encodé (programme + média), de façon atomique.

Aujourd'hui : appelé par `npm run ingest`. À l'étape B4, il sera piloté par une file de tâches
(upload → contrôle → encodage → publication), avec reprise après panne.
