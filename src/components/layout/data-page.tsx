import { Header } from "@/components/layout/header"
import { AlertTriangle } from "lucide-react"
import { isSupabaseConfigured } from "@/lib/supabase/admin"

/**
 * Le gabarit des pages de consultation (centres, sessions, formations, blog).
 *
 * Elles ne diffèrent que par leur requête et leurs colonnes. Le reste — titre,
 * absence de configuration, erreur de requête, table vide — se traite au même
 * endroit, ce qui évite quatre variantes divergentes du message d'erreur.
 *
 * Une requête qui échoue affiche son message brut : c'est un back-office, et
 * « une erreur est survenue » n'aide personne à réparer quoi que ce soit.
 */
export async function DataPage<T>({
  title,
  charger,
  colonnes,
  ligne,
  vide,
  note,
}: {
  title: string
  charger: () => Promise<T[]>
  colonnes: string[]
  ligne: (item: T) => React.ReactNode[]
  vide: string
  note?: string
}) {
  let corps: React.ReactNode

  if (!isSupabaseConfigured()) {
    corps = <Erreur message="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents — voir .env.example." />
  } else {
    try {
      const items = await charger()
      corps =
        items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vide}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {colonnes.map((c) => (
                    <th key={c} className="whitespace-nowrap px-4 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    {ligne(item).map((cell, j) => (
                      <td key={j} className="px-4 py-2 align-top">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
    } catch (e) {
      corps = <Erreur message={e instanceof Error ? e.message : String(e)} />
    }
  }

  return (
    <>
      <Header title={title} />
      <div className="flex-1 space-y-4 overflow-auto p-6">
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        {corps}
      </div>
    </>
  )
}

function Erreur({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="font-mono text-xs text-muted-foreground">{message}</p>
    </div>
  )
}
