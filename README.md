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
npm run dev -- --port 3849
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

Port **3849** (LOU 3847, STAN/IRIS/ANGÈLE 3848), basePath `/admin-maya`,
image GHCR `ghcr.io/krome01-droid/maya-dashboard`, VPS Hostinger via
`.github/workflows/deploy.yml`. Le conteneur `maya-cron` joint le dashboard par
le réseau interne Compose, sans sortir sur Internet.

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

## Ce qui reste à faire avant la mise en service

1. Poser les secrets : `SUPABASE_SERVICE_ROLE_KEY`, `CROME_INGEST_SECRET`,
   `ANTHROPIC_API_KEY`, `CRON_SECRET`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`.
2. Enregistrer `agent_cron_secret_maya` dans le Vault Supabase de CROME OS :
   `select vault.create_secret('<secret>', 'agent_cron_secret_maya', 'CRON_SECRET du dashboard MAYA');`
3. Créer le sous-domaine `agent.moto-ecole-inris.fr` et son vhost vers le port 3849.
4. Éprouver la chaîne sans rien rendre public :
   `GET /admin-maya/api/cron/social-auto?review_only=1`.

Facebook étant déjà branché, rien n'est bloqué côté Postiz.

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
