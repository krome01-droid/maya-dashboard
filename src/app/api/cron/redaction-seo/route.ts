import {
  getSlugsArticles,
  getCategoriesBlog,
  creerArticleBrouillon,
  publierArticle,
} from "@/lib/supabase/queries"
import { verifierArticle, type ArticleEntrant } from "@/lib/seo/article"
import {
  requestArticle,
  requestImage,
  attendreImage,
  fetchCatalogue,
  formatArticle,
  isCromeConfigured,
  type ArticleRedige,
} from "@/lib/crome/client"

// Rédaction d'un article SEO/GEO, puis dépôt sur moto-ecole-inris.fr.
//
// Quatrième et dernière marque branchée sur `rediger-article`. MAYA avait déjà
// tout le nécessaire — `creerArticleBrouillon`, `verifierArticle`,
// `publierArticle`, `illustrerArticle` — mais rien ne les actionnait : ce
// pipeline n'était atteignable que par la conversation. Cette tâche l'actionne.
//
// ── Deux gardes, et aucune n'est de trop ─────────────────────────────────────
// Le hub applique son garde-fou éditorial (jamais de CPF ni de « permis à 1 € »
// sur la marque moto) et rend un verdict de publication. MAYA rejoue par-dessus
// `verifierArticle`, qui connaît des interdits que le hub ignore : la plateforme
// est un intermédiaire de réservation et non une moto-école, le montant payé en
// ligne est une commission et non un prix de formation, et aucune promesse de
// résultat n'est tolérable. Ces règles ont été écrites après un article
// affirmant « chez INRI'S, nous proposons des stages dans nos 13 centres » —
// faux deux fois. Un article rédigé par la machine ne les contourne pas.
//
// ── La publication ───────────────────────────────────────────────────────────
// Le code de MAYA disait « MAYA propose, elle ne publie pas ». Armel a décidé le
// 26/08/2026 qu'elle publierait comme les trois autres marques. La mise en ligne
// reste un acte distinct — `publierArticle` — qui rejoue les interdits sur
// l'article tel qu'il est au moment de paraître. Retenu par le hub, il reste en
// brouillon et c'est le hub qui alerte par Telegram.

/** Longueur visée. `BORNES.motsMin` bloque en dessous de 900. */
const LONGUEUR = 1400

/** Rubrique par défaut, si celle que suggère le sujet n'existe pas. */
const CATEGORIE_DEFAUT = "permis-moto"

/**
 * Rattache le sujet à une rubrique existante. Un mot-clé qui ne correspond à
 * rien retombe sur la rubrique par défaut : `creerArticleBrouillon` refuse une
 * catégorie inconnue, et perdre l'article pour un libellé serait absurde.
 */
function choisirCategorie(a: ArticleRedige, connues: string[]): string {
  const texte = `${a.titre} ${a.mot_cle_principal} ${a.mots_cles_secondaires.join(" ")}`.toLowerCase()
  const pistes: [RegExp, string][] = [
    [/casque|blouson|gant|bottes|équipement|airbag/, "equipement-moto"],
    [/circuit|piste|stage de pilotage|trajectoire/, "stages-circuit"],
    [/financement|aide|subvention|coût|prix|tarif|budget/, "financement-aides"],
    [/sécurité|accident|angle mort|visibilité|freinage d'urgence/, "securite-routiere"],
    [/centre|agence|adresse|ville|département/, "nos-centres"],
    [/road ?trip|itinéraire|balade|destination|voyage/, "destinations"],
    [/réforme|nouveauté|actualité|décret|arrêté/, "actualites-moto"],
    [/formation|apprendre|conseil|préparer|réviser/, "formation-conseils"],
    [/permis|a1|a2|plateau|circulation|125/, "permis-moto"],
  ]
  for (const [motif, slug] of pistes) {
    if (motif.test(texte) && connues.includes(slug)) return slug
  }
  return connues.includes(CATEGORIE_DEFAUT) ? CATEGORIE_DEFAUT : connues[0]
}

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Assemble le HTML injecté dans la page.
 *
 * La réponse directe est en tête parce que c'est le passage qu'un moteur de
 * réponse lèvera tel quel. Placée après le chapô, elle perdrait cette fonction.
 *
 * Pas de `<script>`, pas même pour le JSON-LD : le contenu est injecté avec
 * `dangerouslySetInnerHTML`, et `verifierArticle` le refuse — à raison. Les
 * données structurées viennent de `faq_data` et de `schema_type`, que
 * `creerArticleBrouillon` renseigne pour le gabarit.
 */
function assembler(a: ArticleRedige): string {
  const morceaux: string[] = [
    `<p class="reponse-directe"><strong>${echapper(a.reponse_directe)}</strong></p>`,
    `<p>${echapper(a.chapo)}</p>`,
    a.corps_html,
  ]
  if (a.points_cles?.length) {
    morceaux.push(
      "<h2>À retenir</h2>",
      `<ul>${a.points_cles.map((p) => `<li>${echapper(p)}</li>`).join("")}</ul>`,
    )
  }
  // La FAQ est aussi rendue dans le corps : `faq_data` alimente le balisage,
  // mais un lecteur doit la voir, et un moteur de réponse la citer.
  if (a.faq?.length) {
    morceaux.push("<h2>Questions fréquentes</h2>")
    for (const q of a.faq) {
      morceaux.push(`<h3>${echapper(q.question)}</h3>`, `<p>${echapper(q.reponse)}</p>`)
    }
  }
  return morceaux.join("\n")
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const dryRun = params.get("dry_run") === "1"
  const sujet = params.get("sujet") ?? undefined
  const motCleImpose = params.get("mot_cle") ?? undefined
  const forcerRelecture = params.get("relire") === "1"

  try {
    if (!isCromeConfigured()) {
      return Response.json(
        { status: "error", error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" },
        { status: 500 },
      )
    }

    const [articles, categories] = await Promise.all([
      getSlugsArticles(),
      getCategoriesBlog(),
    ])
    // Tous statuts confondus : un article retenu reste en brouillon plusieurs
    // jours, et l'omettre le ferait réécrire à chaque passage — c'est arrivé
    // chez LOU.
    const titres = articles.map((a) => a.titre)
    const slugsExistants = articles.map((a) => a.slug)
    const categoriesConnues = categories.map((c) => c.slug)

    const rendu = await requestArticle({
      sujet,
      mot_cle: motCleImpose,
      titres_existants: titres.slice(0, 60),
      longueur: LONGUEUR,
      forcer_relecture: forcerRelecture,
    })

    if (rendu.error || !rendu.article || !rendu.publication) {
      console.error("[cron/redaction-seo] rédaction:", rendu.error ?? rendu.reason)
      return Response.json(
        { status: "error", step: "crome_redaction", error: rendu.error ?? rendu.reason },
        { status: 502 },
      )
    }

    const article = rendu.article
    const verdict = rendu.publication
    const categorie = choisirCategorie(article, categoriesConnues)

    // Le visuel, avant la vérification : `creerArticleBrouillon` contrôle que
    // l'URL répond, et un article sans couverture reste publiable.
    let imageUrl: string | undefined
    let imageAlt: string | undefined
    let imageErreur: string | undefined
    if (!dryRun) {
      const { scenes, formats } = await fetchCatalogue()
      const choisie = scenes.find((s) => s.key === article.scene_visuel)
      let media = await requestImage(choisie?.key, formatArticle(formats))
      // L'attente du studio est bornée à 45 s et le format article la dépasse
      // presque toujours : sans cette reprise, l'image serait déclarée perdue
      // alors qu'elle aboutit quelques secondes plus tard.
      if (!media.image_url && media.generation_id && media.status !== "error") {
        media = await attendreImage(media.generation_id)
      }
      if (media.image_url) {
        imageUrl = media.image_url
        // Le texte alternatif décrit l'IMAGE, pas l'article : `depicts` dit ce
        // que la scène montre, c'est exactement ce qu'un lecteur d'écran doit
        // entendre. Sans catalogue, on retombe sur une description de marque.
        imageAlt = choisie?.depicts ?? "Formation moto encadrée par un moniteur du réseau INRI'S"
      } else {
        imageErreur = media.error ?? media.reason ?? `studio : ${media.status ?? "sans réponse"}`
        console.warn("[cron/redaction-seo] pas de couverture:", imageErreur)
      }
    }

    const entrant: ArticleEntrant = {
      titre: article.titre,
      slug: article.slug,
      meta_title: article.titre,
      meta_description: article.meta_description,
      excerpt: article.reponse_directe,
      contenu_html: assembler(article),
      mots_cles: article.mots_cles_secondaires,
      faq: article.faq,
      categorie_slug: categorie,
      image_url: imageUrl,
      image_alt: imageAlt,
    }

    // La garde propre à la marque, par-dessus celle du hub. Elle connaît des
    // interdits que le hub ignore, et elle bloque — elle ne conseille pas.
    const controle = verifierArticle(entrant, { slugsExistants, categoriesConnues })
    if (controle.blocages.length) {
      console.error("[cron/redaction-seo] refusé par le contrôle MAYA:", controle.blocages)
      return Response.json(
        {
          status: "refuse",
          step: "controle_maya",
          titre: article.titre,
          blocages: controle.blocages,
          reserves: controle.reserves,
        },
        { status: 422 },
      )
    }

    if (dryRun) {
      return Response.json({
        status: "ok",
        dry_run: true,
        publie: false,
        titre: article.titre,
        slug: article.slug,
        categorie,
        mot_cle: article.mot_cle_principal,
        statut_conseille: verdict.statut_conseille,
        motif: verdict.motif,
        bloquants: verdict.bloquants,
        mineurs: verdict.mineurs,
        controle_maya: { blocages: [], reserves: controle.reserves },
        longueur_html: entrant.contenu_html.length,
        nb_faq: article.faq?.length ?? 0,
      })
    }

    const cree = await creerArticleBrouillon(entrant)

    // La mise en ligne est un second acte, qui rejoue les interdits sur
    // l'article tel qu'il est au moment de paraître.
    let publication: Awaited<ReturnType<typeof publierArticle>> | null = null
    if (verdict.statut_conseille === "publier") {
      publication = await publierArticle(cree.slug)
    }

    // Le hub a déjà alerté (ou non) au moment du verdict. On rapporte ce qu'il
    // dit, pour qu'un « retenu » sans alerte partie se voie.
    const alerte =
      verdict.statut_conseille === "publier"
        ? "sans objet (article publié)"
        : rendu.alerte?.envoyee
          ? "Telegram, envoyée par le hub"
          : `NON ENVOYÉE — ${rendu.alerte?.erreur ?? "le hub n'a pas alerté"}`
    if (verdict.statut_conseille !== "publier" && !rendu.alerte?.envoyee) {
      console.error("[cron/redaction-seo] brouillon retenu sans alerte :", rendu.alerte?.erreur)
    }

    return Response.json({
      status: "ok",
      publie: publication?.publie === true,
      id: cree.id,
      slug: cree.slug,
      url: cree.url_publique,
      titre: article.titre,
      categorie,
      mot_cle: article.mot_cle_principal,
      mots: cree.mots,
      statut_conseille: verdict.statut_conseille,
      motif: verdict.motif,
      bloquants: verdict.bloquants,
      mineurs: verdict.mineurs,
      // Ce que le contrôle de marque a laissé passer sans bloquer : c'est le
      // référencement qui en pâtit, pas la véracité.
      reserves: controle.reserves,
      // `publierArticle` peut refuser au second passage — l'article reste alors
      // en brouillon, et il faut que cela se voie.
      publication_refusee: publication?.refuse ? publication.motifs : undefined,
      page_en_ligne: publication?.page_en_ligne,
      image_url: imageUrl ?? null,
      image_error: imageUrl ? undefined : imageErreur,
      alerte_relecture: alerte,
    })
  } catch (err) {
    console.error("[cron/redaction-seo]", err instanceof Error ? err.message : err)
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur rédaction" },
      { status: 500 },
    )
  }
}
