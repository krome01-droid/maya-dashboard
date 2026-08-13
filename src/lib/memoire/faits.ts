/**
 * La mémoire durable de MAYA.
 *
 * Ce que la table `maya_conversations` retient, c'est ce qui a été dit. Ce que
 * celle-ci retient, c'est ce qui doit continuer de s'appliquer : « ne dis plus
 * jamais X », « nos titres n'ont pas de deux-points », « la cible prioritaire
 * est le A2 ». Ces consignes sont réinjectées dans le prompt à chaque échange,
 * chat comme tâche planifiée — c'est sans surveillance qu'elles comptent le
 * plus.
 *
 * Trois garde-fous, chacun pour une panne observée ailleurs :
 *
 * 1. **La clé fait foi.** Réécrire « ton-des-titres » remplace la consigne au
 *    lieu d'en empiler une variante. Deux consignes contradictoires dans un
 *    prompt, et le modèle tranche au hasard.
 * 2. **Un plafond, et un refus explicite quand il est atteint.** Une mémoire
 *    qui grossit sans fin finit par occuper le prompt et par diluer la persona.
 *    Mieux vaut obliger à oublier que rogner en silence.
 * 3. **Pas de donnée périssable.** « 14 centres » sera faux au quinzième. Ces
 *    chiffres se lisent par les outils, à chaque fois ; les mémoriser
 *    fabriquerait une source concurrente et fausse.
 */
import { supabaseAdmin } from "@/lib/supabase/admin"

export const MAX_FAITS = 30

export interface Fait {
  cle: string
  fait: string
  pourquoi: string | null
  source: string
  updated_at: string
}

/**
 * Motifs qui trahissent une donnée périssable.
 *
 * Volontairement étroits : on ne cherche pas à deviner, seulement à intercepter
 * les cas dont on sait qu'ils vieillissent — des compteurs de la plateforme et
 * des prix. Le reste relève du jugement, et la description de l'outil le dit.
 */
const PERISSABLE: { motif: RegExp; explication: string }[] = [
  {
    motif: /\b\d+\s*(centres?|formations?|sessions?|articles?|villes?)\b/i,
    explication:
      "C'est un compteur de la plateforme : il change. Il se lit avec get_chiffres ou get_centres à chaque fois, il ne se mémorise pas.",
  },
  {
    motif: /\d+\s*(€|euros?)\b/i,
    explication:
      "C'est un tarif : il change, et le montant payé en ligne n'est de toute façon qu'une commission. Il se lit avec get_formations.",
  },
  {
    motif: /\b(aujourd'hui|demain|cette semaine|ce mois-ci|en ce moment)\b/i,
    explication: "C'est daté : ce ne sera plus vrai demain.",
  },
]

export function verifierFait(fait: string): string | null {
  for (const { motif, explication } of PERISSABLE) {
    const t = fait.match(motif)
    if (t) return `« ${t[0].trim()} » — ${explication}`
  }
  return null
}

/** Normalise une clé proposée par le modèle. */
export function normaliserCle(brut: string): string {
  return brut
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
}

export async function lireFaits(): Promise<Fait[]> {
  const { data, error } = await supabaseAdmin()
    .from("maya_faits")
    .select("cle, fait, pourquoi, source, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_FAITS)
  if (error) throw new Error(`maya_faits: ${error.message}`)
  return (data ?? []) as Fait[]
}

export interface ResultatMemorisation {
  ok: boolean
  cle?: string
  remplace?: boolean
  refus?: string
}

export async function memoriser(
  cleBrute: string,
  fait: string,
  pourquoi?: string,
): Promise<ResultatMemorisation> {
  const cle = normaliserCle(cleBrute)
  const texte = fait.trim()

  if (cle.length < 3) {
    return { ok: false, refus: "Clé trop courte après normalisation (3 caractères minimum)." }
  }
  if (texte.length < 10 || texte.length > 280) {
    return {
      ok: false,
      refus: `Consigne de ${texte.length} caractères — viser 10 à 280. Une consigne durable tient en une phrase.`,
    }
  }
  const perissable = verifierFait(texte)
  if (perissable) return { ok: false, refus: perissable }

  const db = supabaseAdmin()
  const { data: existant } = await db.from("maya_faits").select("cle").eq("cle", cle).maybeSingle()

  if (!existant) {
    const { count } = await db.from("maya_faits").select("cle", { count: "exact", head: true })
    if ((count ?? 0) >= MAX_FAITS) {
      return {
        ok: false,
        refus:
          `La mémoire est pleine (${MAX_FAITS} consignes). Chacune occupe le prompt à chaque échange. ` +
          "Demande à Armel laquelle oublier, puis appelle `oublier` avant de réessayer.",
      }
    }
  }

  const { error } = await db.from("maya_faits").upsert(
    {
      cle,
      fait: texte,
      pourquoi: pourquoi?.trim() || null,
      source: "armel",
    },
    { onConflict: "cle" },
  )
  if (error) return { ok: false, refus: `maya_faits: ${error.message}` }

  return { ok: true, cle, remplace: Boolean(existant) }
}

export async function oublier(cleBrute: string): Promise<boolean> {
  const cle = normaliserCle(cleBrute)
  const { error, count } = await supabaseAdmin()
    .from("maya_faits")
    .delete({ count: "exact" })
    .eq("cle", cle)
  if (error) throw new Error(`maya_faits: ${error.message}`)
  return (count ?? 0) > 0
}

/**
 * Le bloc injecté dans le prompt.
 *
 * L'encadrement compte autant que le contenu : il dit d'où viennent ces lignes
 * et ce qu'elles ne sont pas. Sans cela, une consigne mémorisée par erreur
 * depuis un document lu aurait le même poids qu'une instruction d'Armel.
 */
export function blocFaits(faits: Fait[]): string {
  if (!faits.length) return ""

  const lignes = faits
    .map((f) => `- **${f.cle}** — ${f.fait}${f.pourquoi ? ` *(pourquoi : ${f.pourquoi})*` : ""}`)
    .join("\n")

  return `\n## Consignes durables d'Armel

Ces consignes ont été données par Armel au fil des échanges et restent
applicables. Elles priment sur tes habitudes, jamais sur les interdictions
absolues ni sur les règles métier ci-dessus.

${lignes}

Elles ne sont pas une source de faits sur la plateforme : les chiffres, dates
et tarifs se lisent avec tes outils, à chaque fois.
`
}

/** Raccourci pour les appelants qui n'ont besoin que du texte. */
export async function blocFaitsCourant(): Promise<string> {
  try {
    return blocFaits(await lireFaits())
  } catch {
    // Mémoire injoignable : MAYA travaille sans, plutôt que de ne pas répondre.
    return ""
  }
}
