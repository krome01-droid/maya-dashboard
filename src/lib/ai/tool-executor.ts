import type { ToolCallResult } from "./types"
import {
  getCentres,
  getFormations,
  getSessionsOuvertes,
  getArticles,
  getChiffres,
  getCategoriesBlog,
  getSlugsArticles,
  creerArticleBrouillon,
  publierArticle,
} from "@/lib/supabase/queries"
import { fetchScenes, requestImage, submitPost, isCromeConfigured } from "@/lib/crome/client"
import { verifierArticle, type ArticleEntrant } from "@/lib/seo/article"
import { memoriser, oublier, lireFaits, MAX_FAITS } from "@/lib/memoire/faits"

/**
 * Pages de service vers lesquelles un article peut pointer.
 *
 * Codées en dur parce que ce sont des routes du site, pas des lignes en base :
 * les déduire d'une table ferait proposer à MAYA des liens qui n'existent pas.
 * Les fiches formation (`/formation/<slug>`) viennent, elles, du catalogue.
 */
const PAGES_DE_SERVICE: { chemin: string; usage: string }[] = [
  { chemin: "/formations-permis-moto", usage: "Toutes les formations au permis moto — cible par défaut." },
  { chemin: "/permis-moto-accelere", usage: "Formation accélérée." },
  { chemin: "/passerelle-a2-a", usage: "Passerelle A2 vers A, 7 heures." },
  { chemin: "/permis-125", usage: "Conduire un 125 avec le permis B." },
  { chemin: "/formation-125", usage: "Formation 7 heures 125 cm³." },
  { chemin: "/prix-permis-moto", usage: "Tarifs — utile depuis tout article de coût." },
  { chemin: "/stages-circuit-moto", usage: "Stages sur circuit." },
  { chemin: "/formation-moto-entreprise", usage: "Offre entreprise." },
  { chemin: "/nos-centres", usage: "Carte des centres — cible d'un article local." },
]

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>

/** Borne les `limit` venus du modèle : il propose parfois 500. */
function limite(brut: unknown, defaut: number, max: number): number {
  const n = Number(brut)
  if (!Number.isFinite(n) || n <= 0) return defaut
  return Math.min(Math.floor(n), max)
}

const toolHandlers: Record<string, ToolHandler> = {
  async get_centres() {
    const centres = await getCentres()
    // On signale les fiches incomplètes plutôt que de les masquer : MAYA doit
    // pouvoir dire à Armel quels centres ne sont pas présentables, et éviter
    // d'en promouvoir un qui n'a ni photo ni description.
    const incomplets = centres
      .filter((c) => !c.description || !c.image_url)
      .map((c) => c.name)
    return { total: centres.length, centres, sans_photo_ni_description: incomplets }
  },

  async get_formations() {
    const formations = await getFormations()
    // Une formation sans slug n'a pas de page : la promouvoir enverrait sur un 404.
    const sansSlug = formations.filter((f) => !f.slug).map((f) => f.name)
    return {
      total: formations.length,
      formations: formations.filter((f) => f.slug),
      exclues_sans_slug: sansSlug,
      rappel: "base_price est un prix indicatif, pas le montant payé en ligne.",
    }
  },

  async get_sessions_ouvertes(input) {
    const sessions = await getSessionsOuvertes(limite(input.limit, 20, 100))
    return {
      total: sessions.length,
      sessions: sessions.map((s) => ({
        date: s.date,
        heure: s.start_time,
        centre: s.center?.name ?? null,
        ville: s.center?.city ?? null,
        formation: s.product?.name ?? null,
        places_restantes:
          s.max_participants != null
            ? s.max_participants - (s.current_participants ?? 0)
            : null,
      })),
    }
  },

  async get_articles(input) {
    const articles = await getArticles(limite(input.limit, 20, 100))
    return { total: articles.length, articles }
  },

  async get_chiffres() {
    return await getChiffres()
  },

  async memoriser(input) {
    const res = await memoriser(
      String(input.cle ?? ""),
      String(input.fait ?? ""),
      input.pourquoi ? String(input.pourquoi) : undefined,
    )

    if (!res.ok) {
      return {
        refuse: true,
        motif: res.refus,
        lecture: "Rien n'a été mémorisé. Explique le motif à Armel plutôt que de reformuler seul.",
      }
    }

    const faits = await lireFaits()
    return {
      cle: res.cle,
      remplace: res.remplace,
      total: faits.length,
      restant: MAX_FAITS - faits.length,
      lecture: res.remplace
        ? `Consigne « ${res.cle} » remplacée. L'ancienne version ne s'applique plus.`
        : `Consigne « ${res.cle} » retenue. Elle vaudra aussi pour les tâches planifiées.`,
    }
  },

  async oublier(input) {
    const cle = String(input.cle ?? "")
    const supprime = await oublier(cle)
    const faits = await lireFaits()
    return {
      supprime,
      total: faits.length,
      lecture: supprime
        ? `Consigne « ${cle} » oubliée.`
        : `Aucune consigne sous la clé « ${cle} ». Clés existantes : ${
            faits.map((f) => f.cle).join(", ") || "aucune"
          }.`,
    }
  },

  async get_contexte_blog() {
    const [rubriques, deja, formations] = await Promise.all([
      getCategoriesBlog(),
      getSlugsArticles(),
      getFormations(),
    ])

    return {
      rubriques,
      slugs_deja_pris: deja,
      liens_internes_possibles: [
        ...PAGES_DE_SERVICE,
        ...formations
          .filter((f) => f.slug)
          .map((f) => ({ chemin: `/formation/${f.slug}`, usage: f.name })),
      ],
      rappel:
        "Le lien interne est la raison d'être de l'article : il doit conduire vers une " +
        "formation ou une page de service. Un article sans destination ne sert à rien.",
    }
  },

  async create_blog_article(input) {
    const article: ArticleEntrant = {
      titre: String(input.titre ?? "").trim(),
      slug: input.slug ? String(input.slug) : undefined,
      meta_title: input.meta_title ? String(input.meta_title) : undefined,
      meta_description: String(input.meta_description ?? "").trim(),
      excerpt: String(input.excerpt ?? "").trim(),
      contenu_html: String(input.contenu_html ?? "").trim(),
      mots_cles: Array.isArray(input.mots_cles) ? input.mots_cles.map(String) : [],
      faq: Array.isArray(input.faq)
        ? (input.faq as Record<string, unknown>[]).map((q) => ({
            question: String(q?.question ?? ""),
            reponse: String(q?.reponse ?? ""),
          }))
        : [],
      categorie_slug: String(input.categorie_slug ?? "").trim(),
      ville_cible: input.ville_cible ? String(input.ville_cible) : undefined,
      departement_cible: input.departement_cible ? String(input.departement_cible) : undefined,
      region_cible: input.region_cible ? String(input.region_cible) : undefined,
      image_url: input.image_url ? String(input.image_url) : undefined,
      image_alt: input.image_alt ? String(input.image_alt) : undefined,
    }

    const [rubriques, deja] = await Promise.all([getCategoriesBlog(), getSlugsArticles()])
    const verdict = verifierArticle(article, {
      slugsExistants: deja.map((a) => a.slug),
      categoriesConnues: rubriques.map((r) => r.slug),
    })

    // Refus avant toute écriture : un article incomplet ne doit pas laisser de
    // brouillon à moitié valide qu'on retrouverait six mois plus tard.
    if (verdict.blocages.length) {
      return {
        refuse: true,
        blocages: verdict.blocages,
        reserves: verdict.reserves,
        lecture:
          "Rien n'a été écrit en base. Corrige les points ci-dessus et rappelle " +
          "create_blog_article avec l'article entier — pas seulement les corrections.",
      }
    }

    const cree = await creerArticleBrouillon(article)
    return {
      ...cree,
      reserves: verdict.reserves,
      lecture:
        `Brouillon déposé (${cree.mots} mots). Il n'est PAS en ligne : ` +
        `Armel le relit et le publie depuis ${cree.url_admin}. ` +
        `Ne propose le post social de promotion qu'une fois l'article publié — ` +
        `un lien vers un brouillon renvoie sur une page introuvable.`,
    }
  },

  async publier_article(input) {
    const res = await publierArticle(String(input.slug ?? ""))

    if (res.refuse) {
      return {
        refuse: true,
        motifs: res.motifs,
        lecture:
          "L'article reste en brouillon. Ces formulations exposent la marque : " +
          "corrige-les dans l'admin, ou dis à Armel ce qui bloque.",
      }
    }

    if (res.deja_publie) {
      return { ...res, lecture: `« ${res.titre} » etait deja en ligne : ${res.url}` }
    }

    return {
      ...res,
      lecture:
        `« ${res.titre} » est en ligne : ${res.url}. ` +
        "La page repond immediatement ; la liste du blog et le plan du site se " +
        "rafraichissent dans la demi-heure. Tu peux maintenant proposer le post " +
        "social qui y renvoie.",
    }
  },

  async generate_visual(input) {
    if (!isCromeConfigured()) {
      throw new Error("CROME_INGEST_URL / CROME_INGEST_SECRET absents")
    }

    const scenes = await fetchScenes()

    // Sans scène demandée, on rend le catalogue : le modèle choisit ensuite une
    // clé existante au lieu d'en inventer une, que le studio refuserait.
    if (!input.scene) {
      return {
        catalogue: scenes,
        note: scenes.length
          ? "Rappelle generate_visual avec la clé de la scène choisie."
          : "Catalogue indisponible — appelle sans scene, le studio appliquera sa scène par défaut.",
      }
    }

    const demandee = String(input.scene)
    if (scenes.length && !scenes.some((s) => s.key === demandee)) {
      return {
        refused: true,
        reason: `Scène « ${demandee} » hors catalogue.`,
        catalogue: scenes.map((s) => s.key),
      }
    }

    const format = typeof input.format === "string" ? input.format : "1:1"
    const media = await requestImage(demandee, format)
    if (media.error) throw new Error(media.error)
    return media
  },

  async submit_social_post(input) {
    if (!isCromeConfigured()) {
      throw new Error("CROME_INGEST_URL / CROME_INGEST_SECRET absents")
    }

    const content = String(input.content ?? "").trim()
    if (!content) throw new Error("content vide")

    const mediaUrls = Array.isArray(input.media_urls)
      ? input.media_urls.map(String).filter(Boolean)
      : []

    const res = await submitPost(content, mediaUrls, input.review_only === true)
    if (res.error) throw new Error(res.error)

    return {
      ...res,
      // Le modèle confond volontiers « accepté » et « en ligne ». On lui rend
      // la distinction explicite plutôt que de la laisser déduire d'un booléen.
      lecture: res.published
        ? "Publié."
        : res.duplicate
          ? "Doublon refusé par le hub — rien n'est parti."
          : res.queued
            ? "En file de validation — rien n'est public tant qu'Armel n'a pas validé."
            : (res.reason ?? "Non publié."),
    }
  },
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolCallResult> {
  const handler = toolHandlers[name]
  if (!handler) {
    return {
      toolName: name,
      toolInput: input,
      result: { error: `Outil inconnu : ${name}` },
      status: "error",
    }
  }

  try {
    return { toolName: name, toolInput: input, result: await handler(input), status: "success" }
  } catch (e) {
    // L'erreur brute remonte telle quelle : la persona impose de l'afficher
    // sans la reformuler, ce qui suppose de ne pas l'avoir déjà édulcorée ici.
    return {
      toolName: name,
      toolInput: input,
      result: { error: e instanceof Error ? e.message : String(e) },
      status: "error",
    }
  }
}
