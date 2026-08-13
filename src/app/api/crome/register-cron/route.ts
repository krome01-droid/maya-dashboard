import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { registerCronSecret } from "@/lib/crome/client"

export const dynamic = "force-dynamic"

/**
 * Enregistre le CRON_SECRET de MAYA dans le Vault de CROME OS.
 *
 * Réservé à une session admin, et déclenché à la main : ce n'est pas une
 * opération périodique. À rejouer après toute rotation du secret, sans quoi le
 * hub appellerait MAYA avec l'ancienne valeur et récolterait un 401.
 *
 * En POST, pas en GET : l'appel écrit dans le Vault, et une écriture ne doit
 * pas pouvoir se déclencher depuis une barre d'adresse ou un préchargeur.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Non autorisé" }, { status: 401 })

  const res = await registerCronSecret()
  if (res.error) return Response.json(res, { status: 502 })

  return Response.json({
    ...res,
    lecture: res.cree
      ? `Secret créé dans le Vault sous « ${res.cle} ». MAYA est déclenchable depuis CROME OS.`
      : `Secret mis à jour sous « ${res.cle} ».`,
  })
}
