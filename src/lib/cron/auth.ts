/**
 * Les routes `/api/cron/*` sont exclues du middleware NextAuth — sinon le
 * conteneur cron, qui n'a pas de session, serait redirigé vers /login. Elles
 * portent donc leur propre authentification, et c'est la seule qu'elles aient.
 *
 * `CRON_SECRET` absent ⇒ on refuse. Le repli silencieux (« pas de secret
 * configuré, donc on laisse passer ») transformerait un oubli de déploiement
 * en endpoint public capable de déclencher des publications.
 */
export function cronAutorise(req: Request): Response | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json(
      { status: "error", error: "CRON_SECRET non configuré" },
      { status: 500 },
    )
  }
  if (req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
