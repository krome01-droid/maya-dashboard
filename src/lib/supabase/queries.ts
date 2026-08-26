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
 * Deux écritures seulement, et toutes deux sur le blog : `creerArticleBrouillon`
 * et `publierArticle`. Aucune donnée de réservation n'est touchée. Les
 * écritures sur `orders`, `order_items` et `payouts` appartiennent au webhook
 * Stripe — voir `lib/supabase/admin.ts`.
 *
 * La publication a longtemps été volontairement absente : MAYA proposait, un
 * humain publiait. Armel l'a levée le 2026-08-13, l'aller-retour vers l'admin
 * ne payant pas son coût. Elle reste un **acte distinct** de la rédaction,
 * pour qu'une mise en ligne ne dépende jamais d'un booléen coché de travers.
 */
import { supabaseAdmin } from "./admin"
import {
  slugifier,
  compterMots,
  tempsLecture,
  texteNu,
  verifierInterdits,
  verifierArticle,
  type ArticleEntrant,
} from "@/lib/seo/article"

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

// ───────────────────────────── Blog : rédaction ─────────────────────────────

export interface CategorieBlog {
  slug: string
  name: string
  articles_publies: number
}

/** Rubriques du blog, avec le nombre d'articles publiés dans chacune. */
export async function getCategoriesBlog(): Promise<CategorieBlog[]> {
  const db = supabaseAdmin()
  const { data: cats, error } = await db
    .from("blog_categories")
    .select("id, slug, name")
    .order("name")
  if (error) throw new Error(`blog_categories: ${error.message}`)

  const { data: posts, error: e2 } = await db
    .from("blog_posts")
    .select("category_id")
    .eq("status", "published")
  if (e2) throw new Error(`blog_posts: ${e2.message}`)

  const parCategorie = new Map<string, number>()
  for (const p of posts ?? []) {
    const k = (p as { category_id: string | null }).category_id
    if (k) parCategorie.set(k, (parCategorie.get(k) ?? 0) + 1)
  }

  return (cats ?? []).map((c) => {
    const { id, slug, name } = c as { id: string; slug: string; name: string }
    return { slug, name, articles_publies: parCategorie.get(id) ?? 0 }
  })
}

/**
 * Tous les slugs, brouillons compris.
 *
 * Se limiter aux publiés laisserait MAYA réécrire un brouillon en attente et
 * heurter la contrainte d'unicité au moment de l'insertion, après avoir rédigé
 * 1 500 mots pour rien.
 */
export async function getSlugsArticles(): Promise<{ slug: string; titre: string; status: string }[]> {
  const { data, error } = await supabaseAdmin()
    .from("blog_posts")
    .select("slug, title, status")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`blog_posts: ${error.message}`)
  return (data ?? []).map((a) => {
    const { slug, title, status } = a as { slug: string; title: string; status: string | null }
    return { slug, titre: title, status: status ?? "draft" }
  })
}

export interface ArticleCree {
  id: string
  slug: string
  url_publique: string
  url_admin: string
  mots: number
  temps_lecture: number
}

/**
 * Insère un article en **brouillon**.
 *
 * `status: "draft"` n'est pas un paramètre, et ne doit pas le devenir. La règle
 * a changé de portée le 26/08/2026 sans changer de nature : Armel a décidé que
 * MAYA publierait comme les trois autres marques, mais la mise en ligne reste
 * un SECOND acte, `publierArticle`, qui rejoue les interdits sur l'article tel
 * qu'il est au moment de paraître. Ce qui était refusé reste refusé — noyer une
 * publication dans un booléen parmi quinze champs, qu'un modèle peut cocher par
 * inadvertance.
 */
export async function creerArticleBrouillon(a: ArticleEntrant): Promise<ArticleCree> {
  const db = supabaseAdmin()
  const slug = a.slug ? slugifier(a.slug) : slugifier(a.titre)
  const mots = compterMots(a.contenu_html)

  // Même contrôle qu'à l'illustration : une couverture inventée passerait le
  // validateur (qui ne juge que la forme) et l'article naîtrait cassé.
  if (a.image_url) {
    const souci = await imageAccessible(a.image_url)
    if (souci) {
      throw new Error(
        `Image refusée : ${souci}. Reprends l'URL exacte rendue par generate_visual.`,
      )
    }
  }

  const { data: categorie, error: eCat } = await db
    .from("blog_categories")
    .select("id")
    .eq("slug", a.categorie_slug)
    .maybeSingle()
  if (eCat) throw new Error(`blog_categories: ${eCat.message}`)
  if (!categorie) throw new Error(`Catégorie « ${a.categorie_slug} » introuvable.`)

  const faq = (a.faq ?? []).map((q) => ({
    question: q.question.trim(),
    reponse: q.reponse.trim(),
  }))

  const { data, error } = await db
    .from("blog_posts")
    .insert({
      title: a.titre,
      slug,
      excerpt: a.excerpt,
      content: a.contenu_html,
      meta_title: a.meta_title?.trim() || a.titre,
      meta_description: a.meta_description,
      meta_keywords: a.mots_cles?.length ? a.mots_cles.join(", ") : null,
      canonical_url: `https://www.moto-ecole-inris.fr/blog/${slug}`,
      target_city: a.ville_cible ?? null,
      target_department: a.departement_cible ?? null,
      target_region: a.region_cible ?? null,
      cover_image: a.image_url ?? null,
      cover_image_alt: a.image_alt ?? null,
      featured_image: a.image_url ?? null,
      featured_image_alt: a.image_alt ?? null,
      og_image: a.image_url ?? null,
      category_id: (categorie as { id: string }).id,
      status: "draft",
      allow_indexing: true,
      schema_type: "Article",
      faq_data: faq.length ? faq : null,
      word_count: mots,
      reading_time_minutes: tempsLecture(mots),
      author_name: "INRI'S Moto",
    })
    // On relit `word_count` et `reading_time_minutes` : le déclencheur
    // `blog_posts_reading_time` les recalcule à l'insertion et fait autorité.
    // Renvoyer nos valeurs ferait annoncer à MAYA un compte que la page ne
    // confirmerait pas.
    .select("id, slug, word_count, reading_time_minutes")
    .single()

  if (error) throw new Error(`blog_posts insert: ${error.message}`)

  const ligne = data as {
    id: string
    slug: string
    word_count: number | null
    reading_time_minutes: number | null
  }
  return {
    id: ligne.id,
    slug,
    url_publique: `https://www.moto-ecole-inris.fr/blog/${slug}`,
    url_admin: `https://www.moto-ecole-inris.fr/admin/blog/edit/${ligne.id}`,
    mots: ligne.word_count ?? mots,
    temps_lecture: ligne.reading_time_minutes ?? tempsLecture(mots),
  }
}

export interface ResultatPublication {
  refuse?: boolean
  motifs?: string[]
  slug: string
  titre?: string
  url?: string
  deja_publie?: boolean
  publie?: boolean
  /** La page répond-elle déjà ? Voir `pageRepond`. */
  page_en_ligne?: boolean
}

/**
 * La page publique répond-elle vraiment ?
 *
 * Le site est en ISR (`revalidate = 1800`) : une URL visitée pendant que
 * l'article était encore brouillon a mis un **404 en cache**, et ce 404
 * survivra jusqu'à une demi-heure après la publication. Annoncer « en ligne »
 * sans vérifier revient à mentir, et à envoyer un post social vers une page
 * introuvable — l'erreur exacte que la persona interdit.
 */
async function pageRepond(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Met un brouillon en ligne.
 *
 * Acte distinct de la rédaction, et c'est délibéré : une page publiée est
 * indexée, citée, et reste des années. La noyer dans un paramètre booléen de
 * `creerArticleBrouillon` aurait fait dépendre une mise en ligne d'un champ
 * parmi quinze, qu'un modèle peut cocher par inadvertance.
 *
 * Depuis le 26/08/2026, l'appelant n'est plus seulement Armel : la tâche
 * `redaction-seo` publie ici quand le moteur central n'a relevé aucune
 * affirmation engageante. C'est un choix explicite d'Armel, pris en connaissance
 * de la règle antérieure. Les interdits rejoués ci-dessous en sont d'autant plus
 * la dernière porte — ils voient un texte qu'aucun humain n'a relu.
 *
 * Les interdictions sont rejouées ici. L'article a pu être retouché dans
 * l'admin depuis sa rédaction, et c'est la publication qui expose — pas le
 * brouillon. Les critères de longueur et de structure, eux, ne sont pas
 * rejoués : ils ne limitent que le référencement, et refuser une mise en ligne
 * décidée par Armel pour 200 mots manquants n'aurait aucun sens.
 */
export async function publierArticle(slugBrut: string): Promise<ResultatPublication> {
  const db = supabaseAdmin()
  const slug = slugifier(slugBrut)

  const { data, error } = await db
    .from("blog_posts")
    .select("id, slug, title, status, content, excerpt, meta_description, faq_data, published_at")
    .eq("slug", slug)
    .maybeSingle()
  if (error) throw new Error(`blog_posts: ${error.message}`)
  if (!data) throw new Error(`Aucun article sous le slug « ${slug} ».`)

  const a = data as {
    id: string
    slug: string
    title: string
    status: string | null
    content: string
    excerpt: string | null
    meta_description: string | null
    faq_data: { question?: string; reponse?: string }[] | null
    published_at: string | null
  }
  const url = `https://www.moto-ecole-inris.fr/blog/${a.slug}`

  if (a.status === "published") {
    return {
      slug: a.slug,
      titre: a.title,
      url,
      deja_publie: true,
      publie: true,
      page_en_ligne: await pageRepond(url),
    }
  }

  const aInspecter = [
    a.title,
    a.meta_description ?? "",
    a.excerpt ?? "",
    texteNu(a.content),
    ...(a.faq_data ?? []).flatMap((q) => [q.question ?? "", q.reponse ?? ""]),
  ].join("\n")

  const motifs = verifierInterdits(aInspecter)
  if (/<script|<iframe|javascript:|\son[a-z]+\s*=/i.test(a.content)) {
    motifs.push(
      "Le HTML contient un script, un cadre ou un gestionnaire d'événement — le contenu est injecté tel quel dans la page.",
    )
  }
  if (motifs.length) return { refuse: true, motifs, slug: a.slug, titre: a.title }

  const { error: eMaj } = await db
    .from("blog_posts")
    .update({
      status: "published",
      // Un article republié garde sa date d'origine : la réécrire ferait
      // repartir sa fraîcheur à zéro aux yeux des moteurs, sans raison.
      published_at: a.published_at ?? new Date().toISOString(),
    })
    .eq("id", a.id)
  if (eMaj) throw new Error(`blog_posts update: ${eMaj.message}`)

  return {
    slug: a.slug,
    titre: a.title,
    url,
    publie: true,
    page_en_ligne: await pageRepond(url),
  }
}

/**
 * L'URL désigne-t-elle vraiment une image accessible ?
 *
 * Vérifié le 2026-08-13 : MAYA a passé
 * `https://cdn.crome-os.io/visuals/inris/permis_A2_16x9.jpg` — une adresse
 * plausible, bien formée, et entièrement inventée. Le domaine ne résout même
 * pas. Le studio publie en réalité sur le stockage Supabase de CROME OS.
 *
 * Contrôler la forme ne suffisait donc pas : un article s'est retrouvé en
 * ligne avec une couverture cassée, ce qui est pire que pas de couverture du
 * tout. On va chercher l'image, et on regarde son type.
 */
async function imageAccessible(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return `l'URL répond ${res.status}`
    const type = res.headers.get("content-type") ?? ""
    if (!type.startsWith("image/")) return `l'URL renvoie « ${type || "aucun type"} », pas une image`
    return null
  } catch (e) {
    return `l'URL est injoignable (${e instanceof Error ? e.message : "erreur"})`
  }
}

export interface ResultatIllustration {
  slug: string
  titre: string
  image_url: string
  deja_illustre: boolean
}

/**
 * Attache une couverture à un article existant.
 *
 * `create_blog_article` exige désormais une image, mais les articles écrits
 * avant cette règle n'en ont pas — et un article publié se corrige, il ne se
 * réécrit pas.
 *
 * Les quatre colonnes sont renseignées ensemble : le gabarit lit `cover_image`,
 * le partage social `og_image`, et `featured_image` traîne depuis un ancien
 * schéma. En remplir une seule laisse la carte vide quelque part, et personne
 * ne sait laquelle avant de regarder.
 */
export async function illustrerArticle(
  slugBrut: string,
  imageUrl: string,
  imageAlt: string,
): Promise<ResultatIllustration> {
  const db = supabaseAdmin()
  const slug = slugifier(slugBrut)
  const url = imageUrl.trim()
  const alt = imageAlt.trim()

  if (!/^https?:\/\//i.test(url)) {
    throw new Error("image_url doit être une URL http(s) complète.")
  }
  if (alt.length < 10) {
    throw new Error(
      "Le texte alternatif doit décrire l'image en une phrase (10 caractères minimum).",
    )
  }

  const souci = await imageAccessible(url)
  if (souci) {
    throw new Error(
      `Image refusée : ${souci}. Reprends l'URL exacte rendue par generate_visual — ` +
        "ne la reconstruis pas de mémoire, le studio ne publie pas sur le domaine que tu supposes.",
    )
  }

  const { data, error } = await db
    .from("blog_posts")
    .select("id, slug, title, cover_image")
    .eq("slug", slug)
    .maybeSingle()
  if (error) throw new Error(`blog_posts: ${error.message}`)
  if (!data) throw new Error(`Aucun article sous le slug « ${slug} ».`)

  const a = data as { id: string; slug: string; title: string; cover_image: string | null }

  const { error: eMaj } = await db
    .from("blog_posts")
    .update({
      cover_image: url,
      cover_image_alt: alt,
      featured_image: url,
      featured_image_alt: alt,
      og_image: url,
    })
    .eq("id", a.id)
  if (eMaj) throw new Error(`blog_posts update: ${eMaj.message}`)

  return {
    slug: a.slug,
    titre: a.title,
    image_url: url,
    deja_illustre: Boolean(a.cover_image),
  }
}

export interface ResultatReecriture {
  refuse?: boolean
  blocages?: string[]
  reserves?: string[]
  slug: string
  titre?: string
  url?: string
  mots_avant?: number
  mots_apres?: number
  etait_publie?: boolean
}

/**
 * Réécrit un article existant, en conservant son URL.
 *
 * Le slug ne bouge pas, et c'est tout l'intérêt : les sept articles hérités
 * font 109 à 320 mots, sans meta_description ni FAQ, et cinq d'entre eux
 * écrivent « Chez INRI'S, nous proposons… dans nos 13 centres ». Les remplacer
 * par de nouvelles URL perdrait le peu d'autorité accumulée et laisserait
 * sept pages fautives en ligne ; les réécrire en place corrige le contenu sans
 * casser un seul lien.
 *
 * Le statut est conservé : un article publié le reste, un brouillon aussi. Une
 * réécriture n'est pas une publication — si Armel veut mettre en ligne un
 * brouillon réécrit, il passe par `publier_article`.
 *
 * `published_at` n'est jamais retouché : la date d'origine est la vraie date
 * de parution, et la réécriture se lit dans `updated_at`.
 */
export async function reecrireArticle(
  slugCible: string,
  a: ArticleEntrant,
): Promise<ResultatReecriture> {
  const db = supabaseAdmin()
  const slug = slugifier(slugCible)

  const { data, error } = await db
    .from("blog_posts")
    .select("id, slug, title, status, word_count")
    .eq("slug", slug)
    .maybeSingle()
  if (error) throw new Error(`blog_posts: ${error.message}`)
  if (!data) throw new Error(`Aucun article sous le slug « ${slug} ».`)

  const existant = data as {
    id: string
    slug: string
    title: string
    status: string | null
    word_count: number | null
  }

  const [rubriques, tous] = await Promise.all([getCategoriesBlog(), getSlugsArticles()])
  const verdict = verifierArticle(
    { ...a, slug },
    {
      // On retire le slug visé de la liste des slugs pris : c'est celui qu'on
      // réécrit, il ne peut pas se faire concurrence à lui-même.
      slugsExistants: tous.map((x) => x.slug).filter((s) => s !== slug),
      categoriesConnues: rubriques.map((r) => r.slug),
    },
  )
  if (verdict.blocages.length) {
    return { refuse: true, blocages: verdict.blocages, reserves: verdict.reserves, slug }
  }

  if (a.image_url) {
    const souci = await imageAccessible(a.image_url)
    if (souci) {
      throw new Error(
        `Image refusée : ${souci}. Reprends l'URL exacte rendue par generate_visual.`,
      )
    }
  }

  const { data: categorie, error: eCat } = await db
    .from("blog_categories")
    .select("id")
    .eq("slug", a.categorie_slug)
    .maybeSingle()
  if (eCat) throw new Error(`blog_categories: ${eCat.message}`)
  if (!categorie) throw new Error(`Catégorie « ${a.categorie_slug} » introuvable.`)

  const faq = (a.faq ?? []).map((q) => ({
    question: q.question.trim(),
    reponse: q.reponse.trim(),
  }))

  const champs: Record<string, unknown> = {
    title: a.titre,
    excerpt: a.excerpt,
    content: a.contenu_html,
    meta_title: a.meta_title?.trim() || a.titre,
    meta_description: a.meta_description,
    meta_keywords: a.mots_cles?.length ? a.mots_cles.join(", ") : null,
    canonical_url: `https://www.moto-ecole-inris.fr/blog/${slug}`,
    target_city: a.ville_cible ?? null,
    target_department: a.departement_cible ?? null,
    target_region: a.region_cible ?? null,
    category_id: (categorie as { id: string }).id,
    schema_type: "Article",
    faq_data: faq.length ? faq : null,
  }
  // On ne remplace la couverture que si une nouvelle est fournie : effacer
  // celle qui existe parce que le modèle a omis le champ serait une régression
  // silencieuse.
  if (a.image_url) {
    champs.cover_image = a.image_url
    champs.featured_image = a.image_url
    champs.og_image = a.image_url
  }
  if (a.image_alt) {
    champs.cover_image_alt = a.image_alt
    champs.featured_image_alt = a.image_alt
  }

  const { data: apres, error: eMaj } = await db
    .from("blog_posts")
    .update(champs)
    .eq("id", existant.id)
    .select("word_count")
    .single()
  if (eMaj) throw new Error(`blog_posts update: ${eMaj.message}`)

  return {
    slug,
    titre: a.titre,
    url: `https://www.moto-ecole-inris.fr/blog/${slug}`,
    mots_avant: existant.word_count ?? 0,
    mots_apres: (apres as { word_count: number | null }).word_count ?? compterMots(a.contenu_html),
    etait_publie: existant.status === "published",
    reserves: verdict.reserves,
  }
}
