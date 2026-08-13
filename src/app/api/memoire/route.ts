import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { lireFaits, oublier, MAX_FAITS } from "@/lib/memoire/faits"
import { isSupabaseConfigured } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

/**
 * Les consignes durables, telles qu'elles sont injectées dans le prompt.
 *
 * Armel doit pouvoir voir ce que MAYA croit devoir appliquer : une mémoire
 * qu'on ne peut pas relire est une mémoire qu'on ne peut pas corriger.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Non autorisé" }, { status: 401 })
  if (!isSupabaseConfigured()) return Response.json({ faits: [], max: MAX_FAITS })

  try {
    return Response.json({ faits: await lireFaits(), max: MAX_FAITS })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Non autorisé" }, { status: 401 })

  const cle = new URL(req.url).searchParams.get("cle")
  if (!cle) return Response.json({ error: "Clé manquante" }, { status: 400 })
  if (!isSupabaseConfigured()) return Response.json({ ok: true })

  try {
    return Response.json({ ok: await oublier(cle) })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 })
  }
}
