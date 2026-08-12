import type { ToolCallResult } from "./types"
import {
  getCentres,
  getFormations,
  getSessionsOuvertes,
  getArticles,
  getChiffres,
} from "@/lib/supabase/queries"
import { fetchScenes, requestImage, submitPost, isCromeConfigured } from "@/lib/crome/client"

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
