# CultuRésa — Content-Security-Policy

Document destiné à l'administrateur réseau pour configurer les headers HTTP de sécurité au niveau Nginx / Apache.

## Politique de base recommandée

À poser sur **toutes les réponses HTTP** servies par CultuRésa (HTML, JSON API…) :

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data:;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

(Tout sur une ligne sans retours-chariot dans la valeur du header — le formatage ci-dessus est pour la lisibilité du doc.)

## Explication directive par directive

| Directive | Valeur | Pourquoi |
|---|---|---|
| `default-src` | `'self'` | fallback strict : tout ce qui n'est pas explicitement listé doit venir du même domaine |
| `script-src` | `'self' 'unsafe-inline' https://cdnjs.cloudflare.com` | l'app charge Chart.js depuis cdnjs ET utilise des `onclick="…"` inline partout (héritage du code actuel — un refactor pour les retirer serait long) |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | les fonts Google sont chargées via CSS distant, et l'app utilise massivement `style="…"` inline |
| `font-src` | `'self' https://fonts.gstatic.com` | les fichiers de fonts physiques (woff2) sont hébergés sur gstatic |
| `img-src` | `'self' data:` | autorise les data-URI pour les SVG et icônes inline |
| `connect-src` | `'self'` | les appels XHR / fetch vers l'API sont sur le même domaine |
| `frame-ancestors` | `'none'` | interdit que CultuRésa soit iframé ailleurs (anti-clickjacking) — équivalent à `X-Frame-Options: DENY` mais moderne |
| `base-uri` | `'self'` | empêche un attaquant d'injecter `<base href="...">` pour rerouter les chemins relatifs |
| `form-action` | `'self'` | les `<form action="">` doivent rester sur le même domaine |

## Headers complémentaires (à ajouter sur le même vhost)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

- **HSTS** : force HTTPS pendant 2 ans. À activer **uniquement après avoir validé que HTTPS fonctionne** (sinon on s'auto-bloque). `preload` permet d'inscrire le domaine dans la liste HSTS des navigateurs (optionnel).
- **X-Content-Type-Options** : empêche les navigateurs de deviner le MIME type (anti-sniffing).
- **X-Frame-Options** : doublon de `frame-ancestors` pour les vieux navigateurs qui ne supportent pas CSP3.
- **Referrer-Policy** : limite les fuites d'URL via le header `Referer`.
- **Permissions-Policy** : désactive les API navigateur non utilisées par l'app.

## Configuration Nginx (exemple)

À mettre dans le `server { }` ou la `location / { }` du vhost CultuRésa :

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

Le suffixe `always` est important : il garantit que le header est aussi posé sur les réponses d'erreur (4xx, 5xx).

## Configuration Apache (exemple)

```apache
Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Permissions-Policy "geolocation=(), microphone=(), camera=()"
```

## Avertissements

### `'unsafe-inline'` sur script-src et style-src

C'est une **concession** au code existant. L'app contient :
- Des centaines de `onclick="..."` directement en HTML
- Des centaines de `style="..."` inline

Retirer `'unsafe-inline'` nécessiterait un refactor massif (passage à `addEventListener` partout, externalisation des styles). Coût/bénéfice non rentable pour l'instant.

**Mitigation alternative** envisageable plus tard : utiliser un nonce CSP (`'nonce-XYZ'` régénéré à chaque requête, présent sur chaque `<script>` ou `<style>`) — mais ça implique de toucher à `index.php` pour injecter le nonce sur **chaque** balise inline. Non trivial.

### Validation avant déploiement

Activer la CSP **d'abord en `Content-Security-Policy-Report-Only`** pour observer ce qui serait bloqué sans réellement bloquer :

```
Content-Security-Policy-Report-Only: <même policy>
```

Vérifier dans la console navigateur (F12 → Console) pendant ~1 semaine qu'aucun warning n'apparaît. Puis basculer en mode enforcing en remplaçant `-Report-Only` par le nom du header standard.

### Sources externes à surveiller

Si à terme tu ajoutes :
- Du SVG inline → vérifier que `img-src` autorise `data:` (déjà ok)
- Un lecteur vidéo, un widget tiers, un service de chat → ajouter explicitement le domaine
- Du tracking (Matomo, GA) → ajouter le domaine de tracking dans `script-src` et `connect-src`

## Tests rapides

Outils en ligne pour valider la CSP en place :
- https://securityheaders.com/ — note A+ visée
- https://csp-evaluator.withgoogle.com/ — pointera les `'unsafe-inline'` mais c'est attendu
