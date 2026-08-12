import { DataPage } from "@/components/layout/data-page"
import { getCentres } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

export default function CentresPage() {
  return (
    <DataPage
      title="Centres"
      note="Les centres actifs du réseau. Une fiche sans photo ni description n'est pas promouvable : le post renverrait sur une page vide."
      charger={getCentres}
      colonnes={["Nom", "Ville", "CP", "Photo", "Description"]}
      vide="Aucun centre actif."
      ligne={(c) => [
        c.name,
        c.city ?? "—",
        c.postal_code ?? "—",
        c.image_url ? "oui" : "manquante",
        c.description ? "oui" : "manquante",
      ]}
    />
  )
}
