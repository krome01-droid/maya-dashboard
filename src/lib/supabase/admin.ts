/**
 * Accès serveur à la base de la marketplace (projet `ngjdoxiiipctmjewvrfu`).
 *
 * MAYA lit la base de moto-ecole-inris.fr en `service_role` : elle contourne
 * donc la RLS. C'est assumé — le dashboard est derrière NextAuth et n'expose
 * jamais ce client au navigateur — mais cela impose deux règles :
 *
 *   1. Ce module ne doit JAMAIS être importé depuis un composant client. Il n'y
 *      a pas de `"use client"` possible en amont : la clé partirait dans le
 *      bundle. Les helpers de `queries.ts` sont tous appelés côté serveur.
 *   2. Aucune écriture n'est exposée ici sur les tables d'argent (`orders`,
 *      `order_items`, `payouts`). MAYA communique ; elle ne touche pas aux
 *      paiements. Le webhook Stripe est seul maître de ces tables.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents — voir .env.example",
    )
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}
