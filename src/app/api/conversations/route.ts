import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { listerSessions } from "@/lib/supabase/conversations"
import { isSupabaseConfigured } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

/** Les conversations récentes, pour le sélecteur du chat. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Non autorisé" }, { status: 401 })

  // Sans Supabase, on rend une liste vide plutôt qu'une erreur : le chat doit
  // rester utilisable en mode éphémère.
  if (!isSupabaseConfigured()) return Response.json({ sessions: [] })

  try {
    return Response.json({ sessions: await listerSessions() })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 },
    )
  }
}
