import { DataPage } from "@/components/layout/data-page"
import { getFormations } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })

export default function FormationsPage() {
  return (
    <DataPage
      title="Formations"
      note="Le catalogue commercialisé. Le prix affiché est un prix de base indicatif : la plateforme n'encaisse en ligne qu'une commission, le solde est réglé à l'école."
      charger={getFormations}
      colonnes={["Nom", "Catégorie", "Prix de base", "Durée", "Slug"]}
      vide="Aucune formation active."
      ligne={(f) => [
        f.name,
        f.category ?? "—",
        f.base_price != null ? euros.format(f.base_price) : "—",
        f.duration_hours != null ? `${f.duration_hours} h` : "—",
        f.slug || "⚠️ absent",
      ]}
    />
  )
}
