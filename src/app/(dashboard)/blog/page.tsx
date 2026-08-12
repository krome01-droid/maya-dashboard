import { DataPage } from "@/components/layout/data-page"
import { getArticles } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

export default function BlogPage() {
  return (
    <DataPage
      title="Blog"
      note="Articles publiés, du plus récent au plus ancien. Sert à choisir quoi promouvoir sans repasser deux fois sur le même sujet."
      charger={() => getArticles(100)}
      colonnes={["Titre", "Publié le", "Vues", "Slug"]}
      vide="Aucun article publié."
      ligne={(a) => [
        a.title,
        a.published_at ? a.published_at.slice(0, 10) : "—",
        a.view_count ?? 0,
        a.slug,
      ]}
    />
  )
}
