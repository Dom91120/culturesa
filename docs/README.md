# CultuRésa — Documentation administrateur

Documents techniques destinés à l'admin réseau qui déploie et maintient l'application.

| Document | Pour quoi |
|---|---|
| [DEPLOY.md](DEPLOY.md) | Checklist complète de déploiement production (de zéro à un serveur fonctionnel) |
| [ENV.md](ENV.md) | Variables d'environnement attendues, permissions filesystem, cron, rate limiting |
| [CSP.md](CSP.md) | Content-Security-Policy + autres headers HTTP de sécurité (Nginx + Apache) |

## Ordre de lecture suggéré

1. **DEPLOY.md** : suivre la checklist linéairement pour la première installation
2. **ENV.md** : référence quand on veut comprendre ce qu'une variable fait ou ajouter une nouvelle
3. **CSP.md** : à consulter au moment de configurer le vhost reverse proxy

## Mises à jour

Quand le code évolue avec un impact infra (nouvelle migration, nouveau cron, nouvelle env var), ces documents doivent suivre. Le `git log -- docs/` permet de retrouver les changements.
