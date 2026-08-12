/**
 * La matière première de MAYA : ce que la marketplace sait réellement.
 *
 * Toutes les affirmations publiques de l'agent doivent sortir d'ici. Un post
 * qui annonce « 14 centres partout en France » alors que la table en compte 15
 * dont une en doublon est une erreur qui se voit, et un agent voisin l'a déjà
 * commise (« Déjà actif à Strasbourg, Rennes, Lille » — inventé, intercepté
 * de justesse avant publication). D'où la règle tenue dans tout ce fichier :
 * on ne renvoie que des colonnes lues, jamais d'agrégat reconstitué à vue.
 *
 * Lecture seule. Les écritures sur `orders`, `order_items` et `payouts`
 * appartiennent au webhook Stripe — voir `lib/supabase/admin.ts`.
 */
import { supabaseAdmin } from "./admin"

export interface Centre {
  id: string
  name: string
  slug: string
  city: string | null
  postal_code: string | null
  description: string | null
  image_url: string | null
  is_active: boolean
}

export interface Formation {
  id: string
  name: string
  slug: string
  short_description: string | null
  category: string | null
  base_price: number | null
  duration_hours: number | null
  is_active: boolean
}

export interface SessionOuverte {
  id: string
  date: string
  start_time: string | null
  max_participants: number | null
  current_participants: number | null
  status: string | null
  center: { name: string; city: string | null } | null
  product: { name: string; slug: string } | null
}

export interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  published_at: string | null
  status: string | null
  featured_image: string | null
  cover_image: string | null
  view_count: number | null
}

/** Centres publiés, ordre alphabétique de ville. */
export async function getCentres(): Promise<Centre[]> {
  const { data, error } = await supabaseAdmin()
    .from("centers")
    .select("id, name, slug, city, postal_code, description, image_url, is_active")
    .eq("is_active", true)
    .order("city", { ascending: true })
  if (error) throw new Error(`centers: ${error.message}`)
  return (data ?? []) as Centre[]
}

/** Catalogue de formations (templates), c'est-à-dire l'offre commercialisée. */
export async function getFormations(): Promise<Formation[]> {
  const { data, error } = await supabaseAdmin()
    .from("product_templates")
    .select("id, name, slug, short_description, category, base_price, duration_hours, is_active")
    .eq("is_active", true)
    .order("base_price", { ascending: true })
  if (error) throw new Error(`product_templates: ${error.message}`)
  // Une ligne sans slug ne mène à aucune page : la promouvoir enverrait le
  // lecteur sur un 404. Elle est signalée dans le brief, pas publiée.
  return (data ?? []) as Formation[]
}

/**
 * Sessions à venir avec des places restantes.
 *
 * C'est la seule requête dont MAYA a besoin pour parler de disponibilité, et
 * elle filtre déjà sur la date : promouvoir une session passée est l'erreur
 * la plus facile à commettre et la plus visible.
 */
export async function getSessionsOuvertes(limit = 20): Promise<SessionOuverte[]> {
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .select(
      `id, date, start_time, max_participants, current_participants, status,
       center:centers(name, city),
       product:products(name, slug)`,
    )
    .gte("date", aujourdhui)
    .neq("status", "full")
    .order("date", { ascending: true })
    .limit(limit)
  if (error) throw new Error(`sessions: ${error.message}`)
  return (data ?? []) as unknown as SessionOuverte[]
}

/** Articles publiés, du plus récent au plus ancien. */
export async function getArticles(limit = 20): Promise<Article[]> {
  const { data, error } = await supabaseAdmin()
    .from("blog_posts")
    .select(
      "id, title, slug, excerpt, published_at, status, featured_image, cover_image, view_count",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`blog_posts: ${error.message}`)
  return (data ?? []) as Article[]
}

export interface Chiffres {
  centres: number
  formations: number
  sessionsOuvertes: number
  articles: number
  demandesRappel: number
  demandesB2B: number
}

/**
 * Les compteurs du brief quotidien.
 *
 * `head: true` : on veut le compte, pas les lignes. Les remonter pour les
 * jeter ferait transiter des données personnelles (téléphones des demandes de
 * rappel) sans aucun usage.
 */
export async function getChiffres(): Promise<Chiffres> {
  const db = supabaseAdmin()
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const tete = { count: "exact" as const, head: true }

  const [centres, formations, sessions, articles, rappels, b2b] = await Promise.all([
    db.from("centers").select("id", tete).eq("is_active", true),
    db.from("product_templates").select("id", tete).eq("is_active", true),
    db.from("sessions").select("id", tete).gte("date", aujourdhui).neq("status", "full"),
    db.from("blog_posts").select("id", tete).eq("status", "published"),
    db.from("callback_requests").select("id", tete).eq("status", "pending"),
    db.from("b2b_inquiries").select("id", tete).eq("status", "pending"),
  ])

  // Un compteur en échec doit se voir : renvoyer 0 ferait dire au brief
  // « aucune demande de rappel en attente » alors que la requête a planté.
  for (const [nom, res] of Object.entries({ centres, formations, sessions, articles, rappels, b2b })) {
    if (res.error) throw new Error(`${nom}: ${res.error.message}`)
  }

  return {
    centres: centres.count ?? 0,
    formations: formations.count ?? 0,
    sessionsOuvertes: sessions.count ?? 0,
    articles: articles.count ?? 0,
    demandesRappel: rappels.count ?? 0,
    demandesB2B: b2b.count ?? 0,
  }
}
