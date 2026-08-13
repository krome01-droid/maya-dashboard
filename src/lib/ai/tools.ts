import type Anthropic from "@anthropic-ai/sdk"

/**
 * Les outils de MAYA.
 *
 * Volontairement peu nombreux et tous en lecture, sauf trois : proposer un
 * post, demander un visuel, et déposer un **brouillon** d'article. MAYA
 * communique — elle ne touche ni au catalogue, ni aux sessions, ni aux
 * commandes. Ces tables appartiennent au portail école et au webhook Stripe ;
 * lui donner de quoi les écrire créerait deux chemins d'écriture concurrents
 * sur des données de réservation payées.
 *
 * Les descriptions sont rédigées pour le modèle, pas pour un lecteur humain :
 * elles disent quand appeler l'outil, et ce que le retour ne contient pas.
 */
export const MAYA_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_centres",
    description:
      "Liste les centres actifs du réseau (nom, ville, code postal, description, photo). " +
      "À appeler avant toute affirmation sur le nombre de centres, leur implantation " +
      "ou leur couverture géographique. Ne renvoie que les centres actifs : le total " +
      "peut donc être inférieur au nombre de lignes en base.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_formations",
    description:
      "Catalogue des formations commercialisées (nom, slug, catégorie, prix de base, durée). " +
      "Le prix renvoyé est un prix de base indicatif, PAS le montant payé en ligne " +
      "(la plateforme n'encaisse qu'une commission). Ne présente jamais base_price " +
      "comme un prix tout compris.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_sessions_ouvertes",
    description:
      "Sessions à venir ayant encore des places, avec centre et formation. " +
      "Obligatoire avant d'annoncer une date, une disponibilité ou d'inviter à réserver. " +
      "Une session absente de ce retour est soit passée, soit complète : ne la promeus pas.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Nombre maximum de sessions (défaut 20).",
        },
      },
    },
  },
  {
    name: "get_articles",
    description:
      "Articles publiés sur le blog (titre, slug, extrait, date, vues). " +
      "Sert à choisir un article à promouvoir et à éviter de reprendre deux fois le même sujet.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Nombre maximum d'articles (défaut 20)." },
      },
    },
  },
  {
    name: "get_chiffres",
    description:
      "Compteurs de la plateforme : centres actifs, formations, sessions ouvertes, " +
      "articles publiés, demandes de rappel et demandes B2B en attente. " +
      "Utiliser pour le brief quotidien et pour tout chiffre cité publiquement.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_contexte_blog",
    description:
      "À appeler OBLIGATOIREMENT avant create_blog_article. Renvoie les rubriques " +
      "disponibles, tous les slugs déjà pris (brouillons compris) et les pages du " +
      "site vers lesquelles pointer un lien interne. Sans cet appel tu inventeras " +
      "une rubrique inexistante ou un slug déjà utilisé, et l'article sera refusé " +
      "après avoir été rédigé pour rien.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_blog_article",
    description:
      "Dépose un article de blog en BROUILLON sur moto-ecole-inris.fr. Rien n'est " +
      "publié : Armel relit et publie depuis l'admin du site. " +
      "L'outil refuse l'article s'il enfreint une règle éditoriale ou de référencement, " +
      "et renvoie alors la liste précise des motifs — corrige-les et rappelle-le. " +
      "Un refus ne consomme rien : aucune ligne n'est écrite. " +
      "Écris le corps en HTML sémantique, sans <h1> (le gabarit rend le titre), " +
      "avec des <h2>, des <h3>, des <ul> et au moins un lien interne vers une page " +
      "de service. Demander confirmation à Armel avant l'appel.",
    input_schema: {
      type: "object" as const,
      properties: {
        titre: {
          type: "string",
          description: "Titre de l'article, 25 à 75 caractères. Sert de H1 sur la page.",
        },
        slug: {
          type: "string",
          description:
            "Slug d'URL. Omettre pour le déduire du titre. Doit être absent de get_contexte_blog.",
        },
        meta_title: {
          type: "string",
          description: "Titre pour les résultats de recherche, 60 caractères maximum. Défaut : le titre.",
        },
        meta_description: {
          type: "string",
          description:
            "Description pour les résultats de recherche, 110 à 158 caractères. " +
            "Doit contenir la requête visée et une raison de cliquer.",
        },
        excerpt: {
          type: "string",
          description: "Chapeau affiché dans la liste des articles, 80 à 220 caractères.",
        },
        contenu_html: {
          type: "string",
          description:
            "Corps en HTML sémantique : <h2>, <h3>, <p>, <ul>, <table>, <strong>, <a>. " +
            "Aucun <h1>, aucun <script>, aucun style en ligne. 900 mots minimum, 1400 conseillés.",
        },
        mots_cles: {
          type: "array",
          items: { type: "string" },
          description: "Requêtes visées, la principale en premier.",
        },
        faq: {
          type: "array",
          description:
            "Au moins 3 questions. C'est ce bloc que les moteurs de réponse citent : " +
            "chaque réponse doit se suffire hors contexte, 120 caractères minimum.",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "Question complète, terminée par « ? »." },
              reponse: { type: "string", description: "Réponse autonome et factuelle." },
            },
            required: ["question", "reponse"],
          },
        },
        categorie_slug: {
          type: "string",
          description: "Slug d'une rubrique renvoyée par get_contexte_blog.",
        },
        ville_cible: {
          type: "string",
          description:
            "Ville visée, pour un article local. Ne la renseigner que si le contenu " +
            "parle réellement de cette ville et qu'un centre du réseau s'y trouve.",
        },
        departement_cible: { type: "string", description: "Département visé, le cas échéant." },
        region_cible: { type: "string", description: "Région visée, le cas échéant." },
        image_url: { type: "string", description: "URL de l'image de couverture (celle de generate_visual convient)." },
        image_alt: {
          type: "string",
          description: "Texte alternatif décrivant l'image. Obligatoire dès qu'une image est fournie.",
        },
      },
      required: [
        "titre",
        "meta_description",
        "excerpt",
        "contenu_html",
        "faq",
        "categorie_slug",
      ],
    },
  },
  {
    name: "generate_visual",
    description:
      "Demande un visuel de marque au studio CROME OS. Appeler d'abord sans argument " +
      "pour obtenir le catalogue des scènes disponibles, puis rappeler avec la clé de " +
      "la scène choisie. Une scène hors catalogue est refusée. " +
      "Un visuel manquant n'empêche jamais un post de partir.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene: {
          type: "string",
          description:
            "Clé exacte d'une scène du catalogue. Omettre pour recevoir le catalogue.",
        },
        format: {
          type: "string",
          enum: ["1:1", "4:5", "9:16", "16:9"],
          description: "Format de l'image (défaut 1:1).",
        },
      },
    },
  },
  {
    name: "submit_social_post",
    description:
      "Soumet un post à CROME OS, qui décide s'il part ou s'il passe en validation " +
      "(palier d'autonomie, quotas, fenêtre calme, canaux réellement branchés). " +
      "Tu ne choisis pas les réseaux : le hub route vers les comptes connectés de la marque. " +
      "Un retour queued:true signifie « en attente de validation », pas « publié ». " +
      "Demander confirmation à Armel avant tout appel.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description:
            "Texte complet du post, lien inclus s'il y en a un. Le hub n'ajoute aucun lien.",
        },
        media_urls: {
          type: "array",
          items: { type: "string" },
          description: "URLs des visuels (généralement celle rendue par generate_visual).",
        },
        review_only: {
          type: "boolean",
          description:
            "Force la file de validation même si le palier autorise la publication. " +
            "À utiliser pour éprouver la chaîne sans rien rendre public.",
        },
      },
      required: ["content"],
    },
  },
]
