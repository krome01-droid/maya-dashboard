import Anthropic from "@anthropic-ai/sdk"
import { cronAutorise } from "@/lib/cron/auth"
import { getArticles, getSessionsOuvertes } from "@/lib/supabase/queries"
import { blocFaitsCourant } from "@/lib/memoire/faits"
import {
  fetchScenes,
  requestImage,
  submitPost,
  isCromeConfigured,
  type SubmitResult,
} from "@/lib/crome/client"

/**
 * La publication sociale de MAYA : proposer, jamais publier.
 *
 * Un passage = un post. Le palier d'autonomie plafonne les publications
 * machine ; en produire davantage n'empilerait que des refus de quota, ou
 * noierait la file de validation.
 *
 * MAYA ne choisit pas ses canaux : `platforms` est omis côté client et CROME OS
 * route vers les comptes réellement branchés pour moto-ecole-inris.fr. Un canal
 * listé mais jamais connecté ferait échouer la publication en donnant à l'agent
 * l'illusion d'avoir publié.
 *
 * Deux sujets possibles, dans cet ordre :
 *   1. une session à venir avec des places — c'est ce qui fait réserver ;
 *   2. à défaut, un article du blog.
 * Si la base ne fournit ni l'un ni l'autre, on ne publie rien. Écrire un post
 * « de marque » sans matière est exactement la situation où un modèle invente
 * des villes et des chiffres.
 */

const SITE = "https://www.moto-ecole-inris.fr"
const MODEL = "claude-sonnet-4-6"

export const maxDuration = 300

export async function GET(req: Request) {
  const refus = cronAutorise(req)
  if (refus) return refus

  // `?review_only=1` : tout se déroule normalement mais le post s'arrête en
  // file de validation. Le cron ne le passe jamais — c'est un outil de
  // vérification humaine, pas un réglage de production.
  const reviewOnly = new URL(req.url).searchParams.get("review_only") === "1"

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ status: "error", error: "ANTHROPIC_API_KEY manquant" }, { status: 500 })
    }
    if (!isCromeConfigured()) {
      return Response.json(
        { status: "error", error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" },
        { status: 500 },
      )
    }

    const [sessions, articles] = await Promise.all([
      getSessionsOuvertes(5),
      getArticles(10),
    ])

    // La matière factuelle transmise au modèle. Rien d'autre ne doit apparaître
    // dans le post : c'est la contrainte que la consigne ci-dessous verrouille.
    let sujet: string
    let lien: string
    let type: "session" | "article"

    const session = sessions[0]
    if (session?.product?.slug && session.center) {
      const places =
        session.max_participants != null
          ? session.max_participants - (session.current_participants ?? 0)
          : null
      sujet = [
        `Formation : ${session.product.name}`,
        `Centre : ${session.center.name}${session.center.city ? ` (${session.center.city})` : ""}`,
        `Date : ${session.date}${session.start_time ? ` à ${session.start_time}` : ""}`,
        places != null ? `Places restantes : ${places}` : null,
      ]
        .filter(Boolean)
        .join("\n")
      lien = `${SITE}/formation/${session.product.slug}`
      type = "session"
    } else {
      const article = articles[0]
      if (!article) {
        return Response.json({
          status: "ok",
          submitted: 0,
          message:
            "Ni session ouverte ni article publié : rien à promouvoir. Publier sans matière ferait inventer le modèle.",
        })
      }
      sujet = [`Article : ${article.title}`, article.excerpt ? `Résumé : ${article.excerpt}` : null]
        .filter(Boolean)
        .join("\n")
      lien = `${SITE}/blog/${article.slug}`
      type = "article"
    }

    // Le catalogue vient du studio : MAYA choisit une scène existante, elle n'en
    // invente pas. Injoignable, la liste est vide et la scène par défaut s'applique.
    const scenes = await fetchScenes()
    const menuScenes = scenes.length
      ? scenes.map((s) => `- ${s.key} : ${s.depicts}`).join("\n")
      : "(catalogue indisponible — omets le champ scene)"

    // Les consignes durables valent aussi ici — surtout ici : ce post part sans
    // qu'Armel le relise, et c'est précisément pour ça qu'il a demandé à MAYA
    // de retenir ses corrections.
    const consignes = await blocFaitsCourant()

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Tu es MAYA, community manager de Moto-Écoles INRI'S (moto-ecole-inris.fr),
la marketplace de réservation des moto-écoles du réseau.

Matière (ta seule source) :
${sujet}

Rédige 1 post social publiable tel quel sur une page professionnelle (Facebook
ou Instagram — un texte qui fonctionne sur les deux : pas de « lien en bio »,
pas de format propre à un réseau).

N'écris pas le lien dans ton texte : il sera ajouté juste en dessous.

Choisis aussi le visuel, parmi ces scènes :
${menuScenes}

Format JSON :
{ "contenu": string, "hashtags": string[], "scene": string }

Le champ "scene" doit être exactement l'une des clés ci-dessus.

RÈGLE ABSOLUE — ce que tu n'as pas le droit d'affirmer.
Ta seule source est la matière ci-dessus. Tout le reste, tu ne le sais pas.
N'écris donc jamais :
- de chiffres, statistiques, pourcentages, tarifs ou délais absents de la matière,
- de villes, de zones de couverture ou de nombre de centres,
- de dates ou d'échéances autres que celle indiquée,
- de taux de réussite, ni aucune promesse de résultat,
- de mention du CPF ou du « permis à 1 € par jour » : le permis moto n'y est
  pas éligible, et l'écrire expose à une réclamation.

La plateforme est un intermédiaire de réservation, pas une moto-école : écris
« les moto-écoles du réseau », jamais « notre moto-école » ni « nos moniteurs ».

Un agent voisin a publié « Déjà actif à Strasbourg, Rennes, Lille » : c'était
inventé, et il a fallu l'intercepter avant publication. Dans le doute, reste sur
la matière et invite à consulter la page.
${consignes}

Ton direct et concret, sans emphase publicitaire. 100 à 200 caractères hors
hashtags. 3 à 5 hashtags maximum, en français. Au plus un émoji, ou aucun.`,
        },
      ],
    })

    const texte = response.content[0].type === "text" ? response.content[0].text : ""
    let redige: { contenu?: string; hashtags?: string[]; scene?: string } | null = null
    try {
      const bloc = texte.match(/\{[\s\S]*\}/)
      if (bloc) redige = JSON.parse(bloc[0])
    } catch {
      redige = null
    }
    if (!redige?.contenu) {
      return Response.json({ status: "error", error: "Réponse IA non parsable" }, { status: 502 })
    }

    // Le hub n'ajoute aucun lien : il doit vivre dans le texte, sinon la page
    // qu'on promeut devient inatteignable depuis le post.
    const hashtags = (redige.hashtags ?? [])
      .map((h) => "#" + String(h).replace(/^#+/, "").trim())
      .filter((h) => h.length > 1)
    const contenu = [redige.contenu.trim(), lien, hashtags.join(" ")].filter(Boolean).join("\n\n")

    // Une scène hors catalogue serait refusée par le studio : mieux vaut laisser
    // la valeur par défaut s'appliquer que perdre le visuel.
    const scene = scenes.some((s) => s.key === redige?.scene) ? redige.scene : undefined

    const media = await requestImage(scene)
    const imageUrl = media.image_url ?? null
    if (!imageUrl) {
      console.warn("[cron/social-auto] pas de visuel:", media.error ?? media.reason ?? "inconnu")
    }

    const resultat: SubmitResult = await submitPost(contenu, imageUrl ? [imageUrl] : [], reviewOnly)

    if (resultat.error) {
      console.error("[cron/social-auto] soumission CROME OS:", resultat.error)
      return Response.json(
        { status: "error", step: "crome_submit", error: resultat.error, type },
        { status: 502 },
      )
    }

    return Response.json({
      status: "ok",
      submitted: 1,
      type,
      lien,
      post_id: resultat.post_id,
      published: resultat.published ?? false,
      queued: resultat.queued ?? false,
      duplicate: resultat.duplicate ?? false,
      reason: resultat.reason,
      review_only: reviewOnly,
      scene: scene ?? null,
      image_url: imageUrl,
      image_error: imageUrl ? undefined : (media.error ?? media.reason),
    })
  } catch (err) {
    console.error("[cron/social-auto]", err instanceof Error ? err.message : err)
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur social auto" },
      { status: 500 },
    )
  }
}
