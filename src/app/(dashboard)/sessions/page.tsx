import { DataPage } from "@/components/layout/data-page"
import { getSessionsOuvertes } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

export default function SessionsPage() {
  return (
    <DataPage
      title="Sessions ouvertes"
      note="Sessions à venir ayant encore des places. C'est la seule liste dans laquelle MAYA a le droit de puiser pour inviter à réserver."
      charger={() => getSessionsOuvertes(100)}
      colonnes={["Date", "Heure", "Formation", "Centre", "Places restantes"]}
      vide="Aucune session à venir avec des places."
      ligne={(s) => [
        s.date,
        s.start_time ?? "—",
        s.product?.name ?? "—",
        s.center ? `${s.center.name}${s.center.city ? ` · ${s.center.city}` : ""}` : "—",
        s.max_participants != null
          ? s.max_participants - (s.current_participants ?? 0)
          : "—",
      ]}
    />
  )
}
