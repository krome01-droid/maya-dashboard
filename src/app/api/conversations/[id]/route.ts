import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { lireSession, supprimerSession } from "@/lib/supabase/conversations"
import { isSupabaseConfigured } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

type Contexte = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: Contexte) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Non autorisé" }, { status: 401 })

  const { id } = await params
  if (!UUID.test(id)) return Response.json({ error: "Identifiant invalide" }, { status: 400 })
  if (!isSupabaseConfigured()) return Response.json({ messages: [] })

  try {
    return Response.json({ messages: await lireSession(id) })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Contexte) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Non autorisé" }, { status: 401 })

  const { id } = await params
  if (!UUID.test(id)) return Response.json({ error: "Identifiant invalide" }, { status: 400 })
  if (!isSupabaseConfigured()) return Response.json({ ok: true })

  try {
    await supprimerSession(id)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 })
  }
}
