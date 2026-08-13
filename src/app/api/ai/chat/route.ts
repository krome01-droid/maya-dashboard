import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { streamChatWithTools } from "@/lib/ai/anthropic-client"
import { enregistrerMessage } from "@/lib/supabase/conversations"
import { isSupabaseConfigured } from "@/lib/supabase/admin"
import type { StreamEvent, ToolCallResult } from "@/lib/ai/types"
import { z } from "zod"

// Jusqu'à 5 minutes : `generate_visual` attend l'image du studio CROME OS
// (`wait: true`, jusqu'à 90 s) et une boucle d'outils peut en enchaîner
// plusieurs avant que le modèle ne rende sa réponse.
export const maxDuration = 300

const attachmentSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  data: z.string(), // base64
})

const chatSchema = z.object({
  // Absent des anciens clients : la conversation reste alors éphémère plutôt
  // que d'échouer.
  sessionId: z.string().uuid().optional(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      attachments: z.array(attachmentSchema).optional(),
    }),
  ),
})

/**
 * Duplique le flux pour en garder une trace.
 *
 * Le client reçoit les octets inchangés ; on se contente de lire au passage
 * les deltas de texte et les résultats d'outils, puis d'enregistrer la réponse
 * complète à la fermeture. Rien n'est mis en tampon avant d'être transmis :
 * attendre la fin pour écrire supprimerait le streaming, qui est tout
 * l'intérêt de l'affichage.
 */
function tracer(
  source: ReadableStream<Uint8Array>,
  onFin: (texte: string, outils: ToolCallResult[]) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  let tampon = ""
  let texte = ""
  const outils: ToolCallResult[] = []

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk)

        tampon += decoder.decode(chunk, { stream: true })
        const lignes = tampon.split("\n")
        tampon = lignes.pop() ?? ""

        for (const ligne of lignes) {
          if (!ligne.trim()) continue
          let ev: StreamEvent
          try {
            ev = JSON.parse(ligne) as StreamEvent
          } catch {
            continue
          }
          if (ev.type === "text_delta") texte += ev.content
          else if (ev.type === "tool_use_start") {
            outils.push({
              toolName: ev.toolName,
              toolInput: ev.toolInput,
              result: null,
              status: "success",
            })
          } else if (ev.type === "tool_result") {
            const cible = [...outils].reverse().find((t) => t.toolName === ev.toolName)
            if (cible) {
              cible.result = ev.result
              cible.status = ev.status
            }
          }
        }
      },
      flush() {
        // Une réponse vide n'est pas enregistrée : c'est le cas d'une requête
        // interrompue, et un tour vide dans l'historique n'apprendrait rien au
        // modèle au rechargement.
        if (texte.trim() || outils.length) onFin(texte, outils)
      },
    }),
  )
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "Requête invalide", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { sessionId, messages } = parsed.data
  const memoire = Boolean(sessionId) && isSupabaseConfigured()

  if (memoire && sessionId) {
    const dernier = messages[messages.length - 1]
    // Seul le dernier message est nouveau : les précédents ont déjà été
    // enregistrés à leur tour, et les réécrire dupliquerait toute la
    // conversation à chaque envoi.
    if (dernier?.role === "user") {
      await enregistrerMessage(sessionId, "user", dernier.content)
    }
  }

  const brut = streamChatWithTools(messages)
  const stream =
    memoire && sessionId
      ? tracer(brut, (texte, outils) => {
          void enregistrerMessage(sessionId, "assistant", texte, outils)
        })
      : brut

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
