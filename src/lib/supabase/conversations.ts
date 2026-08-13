/**
 * La mémoire du chat.
 *
 * Table `maya_conversations` dans la base de la marketplace, préfixée pour
 * qu'on ne la confonde pas avec une table produit. RLS activée sans aucune
 * policy : seul le `service_role` — donc le serveur de ce dashboard — y accède.
 * Une conversation avec MAYA contient des chiffres internes et des brouillons
 * d'articles ; elle n'a rien à faire dans la portée d'un compte de la
 * marketplace, même administrateur.
 *
 * Un enregistrement par message, comme chez STAN. Pas de table « sessions »
 * séparée : le premier message d'une session en tient lieu de titre.
 */
import { supabaseAdmin } from "./admin"
import type { ChatMessage, ToolCallResult } from "@/lib/ai/types"

/** Nombre de messages rechargés au retour sur une conversation. */
const PROFONDEUR = 200

export interface ResumeSession {
  session_id: string
  titre: string
  messages: number
  derniere_activite: string
}

interface LigneMessage {
  session_id: string
  role: "user" | "assistant"
  content: string
  tool_calls: ToolCallResult[] | null
  created_at: string
}

/**
 * Enregistre un message.
 *
 * Ne lève jamais : une panne d'écriture ne doit pas faire échouer une réponse
 * déjà rédigée. On perd la trace, pas l'échange en cours.
 */
export async function enregistrerMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  toolCalls?: ToolCallResult[],
): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from("maya_conversations")
      .insert({
        session_id: sessionId,
        role,
        content,
        tool_calls: toolCalls?.length ? toolCalls : null,
      })
    if (error) console.error("[conversations] insert:", error.message)
  } catch (e) {
    console.error("[conversations] insert:", e instanceof Error ? e.message : e)
  }
}

/** Messages d'une session, du plus ancien au plus récent. */
export async function lireSession(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabaseAdmin()
    .from("maya_conversations")
    .select("session_id, role, content, tool_calls, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(PROFONDEUR)
  if (error) throw new Error(`maya_conversations: ${error.message}`)

  return ((data ?? []) as LigneMessage[]).map((m) => ({
    role: m.role,
    content: m.content,
    toolCalls: m.tool_calls ?? undefined,
    timestamp: m.created_at,
  }))
}

/**
 * Les conversations récentes, la plus active en premier.
 *
 * Le regroupement se fait ici plutôt qu'en SQL : PostgREST n'expose pas de
 * `group by`, et créer une vue pour lister des conversations d'un back-office
 * ajouterait un objet au schéma de la marketplace pour peu de chose.
 */
export async function listerSessions(max = 30): Promise<ResumeSession[]> {
  const { data, error } = await supabaseAdmin()
    .from("maya_conversations")
    .select("session_id, role, content, created_at")
    .order("created_at", { ascending: false })
    .limit(1000)
  if (error) throw new Error(`maya_conversations: ${error.message}`)

  const parSession = new Map<string, ResumeSession & { premierUser: string }>()
  // Parcours du plus récent au plus ancien : la dernière valeur écrite pour
  // `premierUser` est donc bien le message le plus ancien de la session.
  for (const l of (data ?? []) as LigneMessage[]) {
    const courant = parSession.get(l.session_id)
    if (!courant) {
      parSession.set(l.session_id, {
        session_id: l.session_id,
        titre: "",
        messages: 1,
        derniere_activite: l.created_at,
        premierUser: l.role === "user" ? l.content : "",
      })
      continue
    }
    courant.messages += 1
    if (l.role === "user" && l.content.trim()) courant.premierUser = l.content
  }

  return [...parSession.values()]
    .map(({ premierUser, ...s }) => ({
      ...s,
      titre: premierUser.trim().slice(0, 80) || "Conversation sans question",
    }))
    .sort((a, b) => b.derniere_activite.localeCompare(a.derniere_activite))
    .slice(0, max)
}

export async function supprimerSession(sessionId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("maya_conversations")
    .delete()
    .eq("session_id", sessionId)
  if (error) throw new Error(`maya_conversations: ${error.message}`)
}
