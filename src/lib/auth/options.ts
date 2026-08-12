import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/supabase/admin"

/**
 * Deux façons d'entrer, une seule autorisation.
 *
 * 1. Le compte de service local (`ADMIN_USERNAME` / `ADMIN_PASSWORD`), qui
 *    permet d'ouvrir le dashboard même si Supabase Auth est indisponible.
 * 2. Un compte Supabase existant de la marketplace — à condition que son
 *    profil porte le rôle `admin`.
 *
 * Le point important est le second : on vérifie le rôle avec le client
 * `service_role`, pas avec la session de l'utilisateur. Interroger `profiles`
 * sous l'identité du demandeur laisserait la RLS décider de ce qu'il voit de
 * son propre rôle, ce qui est exactement la question qu'on lui pose.
 *
 * LOU valide contre l'API WordPress, ANGÈLE contre son plugin companion. MAYA
 * n'a ni l'un ni l'autre : la marketplace est sur Supabase.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Moto-Écoles INRI'S",
      credentials: {
        username: { label: "Identifiant ou e-mail", type: "text" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        // 1. Compte de service local.
        const adminUser = process.env.ADMIN_USERNAME ?? "maya"
        const adminPass = process.env.ADMIN_PASSWORD
        if (
          adminPass &&
          credentials.username === adminUser &&
          credentials.password === adminPass
        ) {
          return { id: "maya", name: "Maya", email: "maya@moto-ecole-inris.fr" }
        }

        // 2. Compte Supabase de la marketplace, réservé aux admins.
        const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !anon) return null

        try {
          const client = createClient(url, anon, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
          const { data, error } = await client.auth.signInWithPassword({
            email: credentials.username,
            password: credentials.password,
          })
          if (error || !data.user) return null

          const { data: profil } = await supabaseAdmin()
            .from("profiles")
            .select("role, display_name, first_name, avatar_url")
            .eq("id", data.user.id)
            .maybeSingle()

          if (profil?.role !== "admin") return null

          return {
            id: data.user.id,
            name: profil.display_name ?? profil.first_name ?? credentials.username,
            email: data.user.email ?? credentials.username,
            image: profil.avatar_url ?? null,
          }
        } catch {
          return null
        }
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
}
