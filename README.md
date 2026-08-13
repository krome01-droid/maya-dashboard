# MAYA — agent de Moto-Écoles INRI'S

Dashboard de l'agent de communication de **moto-ecole-inris.fr**, construit sur
le même patron que LOU, STAN, IRIS et ANGÈLE : Next.js 16 derrière un basePath,
NextAuth, un chat outillé, des tâches planifiées, et le pont vers CROME OS.

```
[MAYA] ──lit──► Supabase marketplace (ngjdoxiiipctmjewvrfu)
   │              centres · sessions · formations · blog
   │
   └──propose──► CROME OS (lrutxrgpgmayqjepqoed)
                   palier d'autonomie · quotas · fenêtre calme · canaux branchés
                        │
                        └──► Postiz ──► Facebook / Instagram
```

## Ce que MAYA fait — et ne fait pas

Elle **propose**, elle ne publie pas. `submitPost()` soumet un texte au hub, qui
applique la politique et décide. Un retour `queued: true` veut dire « en attente
de validation humaine », pas « en ligne ».

Elle est en **lecture seule** sur la base de la marketplace. Le catalogue, les
sessions et les commandes appartiennent au portail école et au webhook Stripe ;
lui donner de quoi les écrire créerait deux chemins d'écriture concurrents sur
des réservations payées.

## Deux règles métier verrouillées dans la persona

1. **La plateforme est un intermédiaire de réservation**, pas une moto-école.
   Jamais « notre moto-école » ni « nos moniteurs ». Le montant encaissé en
   ligne est une commission, pas le prix de la formation.
2. **Le permis moto n'est pas éligible au CPF**, ni au « permis à 1 € par jour ».
   La persona interdit d'en parler sous toute formulation : c'est l'erreur la
   plus fréquente du secteur et elle expose à une réclamation.

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseigner
npm run dev -- --port 3850
```

Sans `SUPABASE_*`, l'app démarre et chaque page affiche quelle variable manque
plutôt que de planter. Sans `CROME_*`, MAYA rédige mais ne peut rien soumettre.

## Tâches planifiées

| Tâche | Horaire (Europe/Paris) | Ce qu'elle fait |
|---|---|---|
| `daily-brief` | tous les jours à 8 h | Relevé de la plateforme, envoyé par Resend. **Sans IA** : un brief est un relevé, pas un texte rédigé. |
| `social-auto` | mar./jeu./sam. à 10 h | Promeut une session ouverte ; à défaut un article ; sans matière, ne publie rien. |

Décalées d'une heure par rapport à LOU et ANGÈLE (7 h / 9 h) : les agents
partagent le studio d'images de CROME OS, et trois soumissions simultanées se
disputeraient le même quota de génération.

Les routes `/api/cron/*` sont hors NextAuth et portent leur propre
authentification (`Bearer CRON_SECRET`). **`CRON_SECRET` absent ⇒ refus** — pas
de repli permissif, sinon un oubli de déploiement ouvrirait un endpoint public
capable de déclencher des publications.

## Déploiement

Port hôte **3850**, basePath `/admin-maya`, image GHCR
`ghcr.io/krome01-droid/maya-dashboard`, via `.github/workflows/deploy.yml`. Le
conteneur `maya-cron` joint le dashboard par le réseau interne Compose, sans
sortir sur Internet.

**Le VPS est `Agents.ia` — VM Hostinger 1463957, 187.124.34.111.** C'est celui
de LOU, STAN, Hermes et OpenClaw, pas celui d'IRIS et ANGÈLE (`srv1623854`,
31.97.157.174). Les deux machines cohabitent dans le même compte Hostinger et
n'ont aucun conteneur en commun : chercher `maya` sur `srv1623854` ne renvoie
rien, et c'est normal. `HOSTINGER_VM_ID` fait foi.

**Les deux services tirent une image, aucun ne se construit sur place.**
L'action Hostinger n'envoie à l'API que l'URL du `docker-compose.yml` ; le VPS
ne clone pas le dépôt. Un `build: ./cron` n'a donc aucun contexte et fait
échouer la création du projet **en entier**, sans message : l'API répond
« deployment initiated », et rien n'apparaît jamais dans `docker compose ls`.
C'est ce qui a bloqué la première mise en service.

**Le port 3850 n'est pas arbitraire.** Sur `Agents.ia` : 3847 `lou-dashboard`,
3848 `stan-dashboard`, 3001 `open-webui`, 32843 Hermes, 50888 OpenClaw, 32768
Ollama, et 80/443 Traefik. 3849 est libre, mais MAYA est déployée sur 3850 et
n'a aucune raison de bouger. Vérifier `docker ps` avant d'ajouter un agent —
le premier numéro choisi ici (3849) l'avait été d'après la liste de
`srv1623854`, qui n'est pas la bonne machine.

### Traefik : la route ne se déclare pas ici

Il n'y a **pas** d'étiquette Traefik dans ce `docker-compose.yml`, et c'est
volontaire : sur `Agents.ia`, Traefik est un projet Compose à part
(`traefik-traefik-1`), en `network_mode: host`, qui détient 80/443 et le
certificat Let's Encrypt de toutes les marques. Il lit un **provider file**,
`/docker/traefik/config/`, à raison d'un YAML par agent : `lou-dashboard.yml`,
`stan-dashboard.yml`, et depuis le 2026-08-12 `maya-dashboard.yml`.

Ce fichier déclare `Host(\`agent.moto-ecole-inris.fr\`) &&
PathPrefix(\`/admin-maya\`)` vers `http://127.0.0.1:3850` — 127.0.0.1 et non
`host.docker.internal`, puisque Traefik partage la pile réseau de l'hôte. Les
middlewares y sont préfixés `maya-` : dans le provider file, les noms sont
globaux à tous les fichiers, et LOU comme STAN déclarent déjà
`redirect-signin` et `redirect-root`.

Traefik recharge ce dossier à chaud, sans redémarrage.

**Reste le DNS.** La zone `moto-ecole-inris.fr` est chez OVH
(`dns200.anycast.me`), pas chez Hostinger. Tant que l'enregistrement A `agent`
→ 187.124.34.111 n'existe pas, Traefik boucle sur
`unable to obtain ACME certificate … NXDOMAIN`. Une fois le DNS en place, si le
certificat tarde, `docker restart traefik-traefik-1` force une nouvelle
tentative sans attendre la temporisation d'ACME.

## État à la création (2026-08-12)

Relevé dans la base, pas supposé :

- **0 session à venir.** Les 7 sessions existantes sont toutes passées
  (janv.–févr. 2026). `social-auto` se rabattra donc sur le blog, et MAYA ne
  peut inviter à réserver nulle part tant qu'aucune date n'est ouverte.
- **14 centres actifs, 14 sans photo ni description.** Aucun n'est présentable
  en post ; le dashboard et le brief les listent.
- 10 formations au catalogue, 7 articles publiés.
- Palier d'autonomie : `publish_gated`, 1 post/jour, 8/semaine, **Facebook
  seul**, fenêtre calme 22 h–7 h. Posé par Armel le 08/08 ; LOU et STAN ont reçu
  Instagram le 11/08, pas MAYA.
- **Le canal Facebook est déjà branché** : `postiz_integrations` porte
  l'intégration réelle `cms9jpa6w0002o49e0estlpru` (« Réseau moto-écoles
  Inri's · Facebook »). MAYA est donc publiable dès que ses secrets sont posés,
  sans attendre quoi que ce soit côté Postiz. Instagram et LinkedIn restent des
  placeholders, désormais **inactifs** (voir ci-dessous).

## En service depuis le 2026-08-13

https://agent.moto-ecole-inris.fr/admin-maya — certificat Let's Encrypt émis,
`maya-dashboard` et `maya-cron` `Up (healthy)`, chaîne éprouvée de bout en bout
par `GET /api/cron/social-auto?review_only=1` : lecture `service_role`,
rédaction, soumission acceptée par CROME OS, rien de publié.

Connexion par un compte Supabase de la marketplace portant le rôle `admin` —
`ADMIN_PASSWORD` est délibérément vide, ce qui désactive le compte de service
local sans ouvrir de brèche (`authorize()` exige la variable non vide avant
toute comparaison).

## Le relevé de départ (conservé)

1. **Poser une valeur dans les secrets, pas seulement le nom.** Au 2026-08-12,
   `NEXTAUTH_SECRET`, `ADMIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_ANON_KEY` et `CRON_SECRET` existaient dans le dépôt **avec une
   valeur vide** : `gh secret list` les affichait, ils arrivaient à zéro
   caractère dans le conteneur, et NextAuth répondait 500 `NO_SECRET` sur
   toutes les routes. `gh secret list` ne dit rien des valeurs — pour les
   contrôler sans jamais les afficher, lancer le workflow `diag-secrets`, qui
   n'imprime que des longueurs.
2. Enregistrer `agent_cron_secret_maya` dans le Vault Supabase de CROME OS :
   `select vault.create_secret('<secret>', 'agent_cron_secret_maya', 'CRON_SECRET du dashboard MAYA');`
3. Poser `HOSTINGER_API_KEY`. `GH_PAT` n'est **pas** nécessaire tant que le
   dépôt est public : l'action ne s'en sert que pour authentifier la
   récupération du `docker-compose.yml` sur un dépôt privé. Si le dépôt
   redevient privé, il lui faudra la portée `repo` — et ce sera un PAT
   **classique**, GHCR et cette action refusant les jetons à portée fine.
4. Créer chez OVH l'enregistrement A `agent.moto-ecole-inris.fr` →
   187.124.34.111. La route Traefik, elle, est déjà en place. **Fait le
   2026-08-13.**
5. Éprouver la chaîne sans rien rendre public :
   `GET /admin-maya/api/cron/social-auto?review_only=1`. **Fait le 2026-08-13.**

Facebook étant déjà branché, rien n'est bloqué côté Postiz.

### Deux pièges rencontrés en posant les secrets, à ne pas réapprendre

**Un secret vide ressemble en tout point à un secret correct.** Ni
`gh secret list` ni l'interface web n'affichent une valeur — l'interface propose
un crayon « Update », jamais une lecture. `gh secret set` sur une entrée
standard vide crée le secret sans broncher et affiche `✓ Set Actions secret`.

**Un collage peut se dédoubler.** `SUPABASE_SERVICE_ROLE_KEY` est arrivée à 438
caractères, soit deux JWT bout à bout — invalide, et invisible à l'œil dans un
champ de mot de passe. D'où le comptage des points dans `diag-secrets` : un JWT
en compte 2, quatre trahit un doublon. Ouvrir la page d'édition (le champ y
repart vide), faire ⌘A puis ⌘V, une seule fois.

## Instagram et LinkedIn : ne pas armer le palier avant l'identifiant

`REPLACE-moto-ig` et `REPLACE-moto-in` ont été passés à `active = false` le
2026-08-12, comme les sept autres placeholders de l'écosystème.

`publish-to-postiz` retient les intégrations par
`(project_slug, active, platform ∈ target_platforms)` puis envoie **un seul**
appel `createPosts` contenant toutes celles retenues. Un `integration_id`
inexistant y fait donc échouer le **post entier**, Facebook compris. Autoriser
Instagram pour MAYA dans `agent_autonomy` alors que `REPLACE-moto-ig` était
actif aurait cassé toutes ses publications d'un coup — c'est précisément ce qui
s'est produit chez LOU et STAN le 11/08.

Remettre `active = true` **en même temps** que l'on colle le vrai identifiant,
jamais avant. Et vérifier au passage les réglages exigés par la plateforme dans
`REGLAGES_PAR_PLATEFORME` (Instagram impose `post_type`).
