import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Les routes cron portent leur propre authentification (Bearer CRON_SECRET) :
  // les passer par NextAuth les rendrait injoignables depuis le conteneur cron.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    // Une route d'API répond 401, elle ne redirige pas. Rediriger renverrait au
    // `fetch` la page de connexion en HTML avec un statut 200 : le client
    // croirait à une réponse valide et afficherait « aucun historique » là où
    // la session a simplement expiré.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = "/login"
    // Le callbackUrl doit inclure le basePath, sinon NextAuth renvoie à la racine.
    loginUrl.searchParams.set("callbackUrl", `/admin-maya${pathname}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
