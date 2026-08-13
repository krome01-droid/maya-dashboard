/**
 * Contrôle éditorial des articles rédigés par MAYA.
 *
 * Tout ce que la persona interdit est revérifié ici, en code. Ce n'est pas de
 * la redondance : l'article `permis-moto-accelere-2026` publié avant MAYA écrit
 * « Chez INRI'S, nous proposons des stages intensifs dans nos 13 centres » —
 * deux fautes en une phrase (la plateforme n'est pas l'école, et il y a 14
 * centres actifs). Une consigne de prompt n'a pas empêché ça et n'empêchera pas
 * la prochaine. Un refus au moment de l'écriture, si.
 *
 * La distinction blocages / réserves est délibérée : on bloque ce qui expose à
 * une réclamation ou fait mentir la marque, on signale ce qui ne fait que
 * limiter le référencement. Bloquer sur un article de 1 100 mots au lieu de
 * 1 200 ferait boucler le modèle sans rien gagner.
 */

/** Longueurs visées. Les bornes basses bloquent, les hautes aussi. */
export const BORNES = {
  titreMin: 25,
  titreMax: 75,
  metaTitleMax: 60,
  metaDescMin: 110,
  metaDescMax: 158,
  extraitMin: 80,
  extraitMax: 220,
  motsMin: 900,
  motsConseilles: 1400,
  faqMin: 3,
  faqReponseMin: 120,
  h2Min: 3,
  slugMax: 75,
} as const

export interface QuestionFaq {
  question: string
  reponse: string
}

export interface ArticleEntrant {
  titre: string
  slug?: string
  meta_title?: string
  meta_description: string
  excerpt: string
  contenu_html: string
  mots_cles?: string[]
  faq?: QuestionFaq[]
  categorie_slug: string
  ville_cible?: string
  departement_cible?: string
  region_cible?: string
  image_url?: string
  image_alt?: string
}

export interface Verdict {
  blocages: string[]
  reserves: string[]
}

/**
 * Formulations interdites, avec le motif.
 *
 * Le motif est rendu au modèle : lui dire « interdit » sans dire pourquoi le
 * pousse à contourner par un synonyme.
 */
const INTERDITS: { motif: RegExp; explication: string }[] = [
  {
    motif: /\bCPF\b|compte personnel de formation/i,
    explication:
      "Le permis moto n'est pas éligible au CPF. Le mentionner, même pour le nier, expose à une réclamation.",
  },
  {
    motif: /permis à 1\s*€|permis à un euro/i,
    explication:
      "Le « permis à 1 € par jour » ne couvre pas les catégories moto.",
  },
  {
    motif: /\bnotre moto-?école\b|\bnos moniteurs\b|\bnos formateurs\b|nous vous formons|\bnotre école\b/i,
    explication:
      "La plateforme est un intermédiaire de réservation, pas une moto-école. Écrire « les moto-écoles du réseau », « votre école ».",
  },
  {
    motif: /taux de réussite|réussite garantie|garanti[e]?\s+(à|a)\s+\d/i,
    explication:
      "Aucune promesse de résultat : ni taux de réussite, ni garantie d'obtention.",
  },
  {
    motif: /prix tout compris|tout inclus|aucun frais supplémentaire/i,
    explication:
      "Le montant payé en ligne est une commission, pas le prix de la formation.",
  },
  {
    motif: /<script|<iframe|javascript:|\son[a-z]+\s*=/i,
    explication:
      "Le contenu est injecté tel quel dans la page (dangerouslySetInnerHTML). Aucun script, cadre ni gestionnaire d'événement.",
  },
]

/** Transforme un titre en slug d'URL stable. */
export function slugifier(texte: string): string {
  return texte
    .normalize("NFD")
    // Plage des diacritiques combinants, écrite en points de code : la forme
    // littérale est invisible à la relecture et se perd au copier-coller.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BORNES.slugMax)
    .replace(/-+$/g, "")
}

/** Texte visible, balises retirées — c'est lui qu'on compte et qu'on inspecte. */
export function texteNu(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function compterMots(html: string): number {
  const t = texteNu(html)
  return t ? t.split(" ").length : 0
}

/** 200 mots/minute, minimum 1 — la valeur s'affiche sous le titre. */
export function tempsLecture(mots: number): number {
  return Math.max(1, Math.round(mots / 200))
}

function occurrences(html: string, balise: string): number {
  return (html.match(new RegExp(`<${balise}[\\s>]`, "gi")) ?? []).length
}

/** Liens internes : chemin relatif, ou absolu vers le domaine de la marque. */
export function liensInternes(html: string): string[] {
  const trouves = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
  return trouves.filter(
    (h) => h.startsWith("/") || /^https?:\/\/(www\.)?moto-ecole-inris\.fr/i.test(h),
  )
}

/**
 * Vérifie un article avant insertion.
 *
 * `slugsExistants` sert deux buts : empêcher la collision d'URL, et signaler la
 * cannibalisation — deux articles sur la même intention se font concurrence
 * dans les résultats au lieu de s'additionner.
 */
/**
 * Les seules interdictions, appliquées à un texte quelconque.
 *
 * Extrait de `verifierArticle` pour être rejoué **au moment de publier** : un
 * brouillon validé à la rédaction a pu être retouché dans l'admin entre-temps,
 * et c'est la mise en ligne qui expose. On ne rejoue que ces règles-là — les
 * critères de longueur ou de structure ne font que limiter le référencement,
 * et bloquer une publication décidée par Armel pour 200 mots manquants serait
 * absurde.
 */
export function verifierInterdits(texte: string): string[] {
  const trouves: string[] = []
  for (const { motif, explication } of INTERDITS) {
    const t = texte.match(motif)
    if (t) trouves.push(`« ${t[0].trim()} » — ${explication}`)
  }
  return trouves
}

export function verifierArticle(
  a: ArticleEntrant,
  contexte: { slugsExistants: string[]; categoriesConnues: string[] },
): Verdict {
  const blocages: string[] = []
  const reserves: string[] = []
  const slug = a.slug ? slugifier(a.slug) : slugifier(a.titre)
  const mots = compterMots(a.contenu_html)

  // ── Formulations interdites, sur le texte visible ET les métadonnées ──
  const aInspecter = [
    a.titre,
    a.meta_title ?? "",
    a.meta_description,
    a.excerpt,
    texteNu(a.contenu_html),
    ...(a.faq ?? []).flatMap((q) => [q.question, q.reponse]),
  ].join("\n")

  for (const { motif, explication } of INTERDITS) {
    const trouve = aInspecter.match(motif)
    if (trouve) blocages.push(`« ${trouve[0].trim()} » — ${explication}`)
  }
  // Le HTML brut est inspecté à part : `texteNu` effacerait un <script>.
  if (/<script|<iframe|javascript:|\son[a-z]+\s*=/i.test(a.contenu_html)) {
    blocages.push(
      "Le HTML contient un script, un cadre ou un gestionnaire d'événement. Interdit : le contenu est injecté tel quel dans la page.",
    )
  }

  // ── Longueurs ──
  if (a.titre.length < BORNES.titreMin || a.titre.length > BORNES.titreMax) {
    blocages.push(
      `Titre de ${a.titre.length} caractères — viser ${BORNES.titreMin} à ${BORNES.titreMax}.`,
    )
  }
  const metaTitle = a.meta_title?.trim() || a.titre
  if (metaTitle.length > BORNES.metaTitleMax) {
    blocages.push(
      `meta_title de ${metaTitle.length} caractères : tronqué dans les résultats au-delà de ${BORNES.metaTitleMax}.`,
    )
  }
  if (
    a.meta_description.length < BORNES.metaDescMin ||
    a.meta_description.length > BORNES.metaDescMax
  ) {
    blocages.push(
      `meta_description de ${a.meta_description.length} caractères — viser ${BORNES.metaDescMin} à ${BORNES.metaDescMax}.`,
    )
  }
  if (a.excerpt.length < BORNES.extraitMin || a.excerpt.length > BORNES.extraitMax) {
    blocages.push(
      `excerpt de ${a.excerpt.length} caractères — viser ${BORNES.extraitMin} à ${BORNES.extraitMax}.`,
    )
  }

  // ── Volume et structure ──
  if (mots < BORNES.motsMin) {
    blocages.push(
      `${mots} mots. Les articles déjà en ligne font 150 à 320 mots et ne se positionnent pas ; le minimum ici est ${BORNES.motsMin}.`,
    )
  } else if (mots < BORNES.motsConseilles) {
    reserves.push(`${mots} mots — ${BORNES.motsConseilles} donnent plus de prise sur une requête disputée.`)
  }
  if (occurrences(a.contenu_html, "h1") > 0) {
    blocages.push("Pas de <h1> dans le corps : le gabarit rend déjà le titre en H1.")
  }
  const h2 = occurrences(a.contenu_html, "h2")
  if (h2 < BORNES.h2Min) {
    blocages.push(`${h2} <h2> — il en faut au moins ${BORNES.h2Min} pour structurer la lecture.`)
  }
  if (occurrences(a.contenu_html, "h3") === 0) {
    reserves.push("Aucun <h3> : les sous-sections aident au repérage des passages citables.")
  }
  if (occurrences(a.contenu_html, "ul") + occurrences(a.contenu_html, "table") === 0) {
    reserves.push("Ni liste ni tableau : ce sont les formats que les moteurs génératifs reprennent le plus volontiers.")
  }

  // ── FAQ ──
  const faq = a.faq ?? []
  if (faq.length < BORNES.faqMin) {
    blocages.push(
      `${faq.length} question(s) en FAQ — il en faut ${BORNES.faqMin}. C'est ce bloc que les moteurs de réponse citent.`,
    )
  }
  faq.forEach((q, i) => {
    if (!q.question.trim().endsWith("?")) {
      blocages.push(`FAQ ${i + 1} : la question doit se terminer par un point d'interrogation.`)
    }
    if (q.reponse.trim().length < BORNES.faqReponseMin) {
      blocages.push(
        `FAQ ${i + 1} : réponse de ${q.reponse.trim().length} caractères, minimum ${BORNES.faqReponseMin}. Une réponse doit se suffire hors contexte.`,
      )
    }
  })

  // ── Maillage et appel à l'action ──
  const liens = liensInternes(a.contenu_html)
  if (liens.length === 0) {
    blocages.push(
      "Aucun lien interne. L'article doit conduire vers une formation ou une page de service — c'est la moitié de la stratégie.",
    )
  } else if (liens.length < 2) {
    reserves.push("Un seul lien interne : deux ou trois répartissent mieux l'autorité.")
  }

  // ── Slug ──
  if (!slug) blocages.push("Slug vide après normalisation.")
  if (contexte.slugsExistants.includes(slug)) {
    blocages.push(
      `Le slug « ${slug} » existe déjà. Choisis un angle différent plutôt qu'une variante : deux articles sur la même intention se concurrencent.`,
    )
  }

  // ── Catégorie ──
  if (!contexte.categoriesConnues.includes(a.categorie_slug)) {
    blocages.push(
      `Catégorie « ${a.categorie_slug} » inconnue. Disponibles : ${contexte.categoriesConnues.join(", ")}.`,
    )
  }

  // ── Image ──
  //
  // Bloquant, et non une simple réserve. Sans couverture, la carte de l'article
  // s'affiche vide dans la liste du blog — une icône de moto grise à côté de
  // vignettes soignées — et le lien partagé sur les réseaux n'a aucune image
  // d'aperçu. C'est visible par tout le monde, tout de suite, et durablement.
  if (!a.image_url) {
    blocages.push(
      "Aucune image de couverture. Appelle generate_visual, puis repasse son " +
        "image_url ici. Sans elle, la carte de l'article est vide dans la liste " +
        "du blog et le lien partagé n'a pas d'aperçu.",
    )
  }
  if (a.image_url && !a.image_alt) {
    blocages.push("Une image sans texte alternatif : inaccessible, et l'attribut compte pour le référencement.")
  }

  return { blocages, reserves }
}
