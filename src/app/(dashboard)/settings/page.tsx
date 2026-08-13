import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, X } from "lucide-react"
import { MemoirePanel } from "@/components/settings/memoire-panel"

export const dynamic = "force-dynamic"

/**
 * L'état de configuration, pas les valeurs.
 *
 * On n'affiche jamais un secret, même tronqué : un préfixe de clé suffit
 * souvent à confirmer laquelle est en place, et l'écosystème a déjà connu une
 * fuite de secrets (incident ANGÈLE du 27/05). On répond donc à la seule
 * question utile : « est-ce renseigné ? »
 */
const GROUPES: { titre: string; description: string; vars: string[] }[] = [
  {
    titre: "Base marketplace",
    description: "Lecture des centres, sessions, formations et articles.",
    vars: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  },
  {
    titre: "CROME OS",
    description:
      "Le hub de publication. Sans lui MAYA rédige, mais ne peut rien soumettre.",
    vars: ["CROME_INGEST_URL", "CROME_INGEST_SECRET"],
  },
  {
    titre: "IA",
    description: "Le modèle qui rédige.",
    vars: ["ANTHROPIC_API_KEY"],
  },
  {
    titre: "Accès & tâches planifiées",
    description: "Connexion au dashboard et déclenchement des crons.",
    vars: ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "ADMIN_USERNAME", "ADMIN_PASSWORD", "CRON_SECRET"],
  },
]

export default function SettingsPage() {
  return (
    <>
      <Header title="Paramètres" />
      <div className="flex-1 space-y-4 overflow-auto p-6">
        <p className="text-sm text-muted-foreground">
          État de la configuration. Les valeurs ne sont jamais affichées — seulement
          leur présence.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          {GROUPES.map((g) => (
            <Card key={g.titre}>
              <CardHeader>
                <CardTitle className="text-base">{g.titre}</CardTitle>
                <CardDescription>{g.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {g.vars.map((v) => {
                    const pose = Boolean(process.env[v])
                    return (
                      <li key={v} className="flex items-center gap-2">
                        {pose ? (
                          <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                        ) : (
                          <X className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                        )}
                        <code className="font-mono text-xs">{v}</code>
                        <span className="sr-only">{pose ? "renseignée" : "absente"}</span>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <MemoirePanel />
      </div>
    </>
  )
}
