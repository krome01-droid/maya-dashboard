import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { isSupabaseConfigured } from "@/lib/supabase/admin"
import { getChiffres, getSessionsOuvertes, getCentres } from "@/lib/supabase/queries"
import { isCromeConfigured } from "@/lib/crome/client"
import { AlertTriangle, MapPin, CalendarDays, GraduationCap, FileText, PhoneCall, Building2 } from "lucide-react"

// Lecture directe en base : la page est rendue à chaque visite plutôt que mise
// en cache. Un brief affichant des sessions ouvertes d'hier ne sert à rien.
export const dynamic = "force-dynamic"

function Tuile({
  label,
  valeur,
  Icone,
  alerte,
}: {
  label: string
  valeur: number
  Icone: typeof MapPin
  alerte?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          className={
            alerte && valeur > 0
              ? "rounded-md bg-destructive/10 p-2 text-destructive"
              : "rounded-md bg-primary/10 p-2 text-primary"
          }
        >
          <Icone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{valeur}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Panne({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div>
        <p className="font-medium text-destructive">Données indisponibles</p>
        <p className="mt-1 text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <Header title="Dashboard" />
        <div className="p-6">
          <Panne message="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents — voir .env.example." />
        </div>
      </>
    )
  }

  let contenu: React.ReactNode
  try {
    const [chiffres, sessions, centres] = await Promise.all([
      getChiffres(),
      getSessionsOuvertes(5),
      getCentres(),
    ])

    // Ce que MAYA ne peut pas promouvoir tant que la fiche est vide.
    const incomplets = centres.filter((c) => !c.description || !c.image_url)

    contenu = (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tuile label="Centres actifs" valeur={chiffres.centres} Icone={MapPin} />
          <Tuile label="Formations au catalogue" valeur={chiffres.formations} Icone={GraduationCap} />
          <Tuile label="Sessions ouvertes" valeur={chiffres.sessionsOuvertes} Icone={CalendarDays} />
          <Tuile label="Articles publiés" valeur={chiffres.articles} Icone={FileText} />
          <Tuile label="Rappels en attente" valeur={chiffres.demandesRappel} Icone={PhoneCall} alerte />
          <Tuile label="Demandes B2B en attente" valeur={chiffres.demandesB2B} Icone={Building2} alerte />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prochaines sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune session à venir avec des places. MAYA ne peut donc inviter à réserver
                  nulle part — c&apos;est la première chose à corriger avant de publier.
                </p>
              ) : (
                <ul className="divide-y text-sm">
                  {sessions.map((s) => (
                    <li key={s.id} className="flex items-baseline justify-between gap-4 py-2">
                      <span className="font-medium">{s.product?.name ?? "Formation inconnue"}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {s.center?.city ?? "—"} · {s.date}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fiches centres incomplètes</CardTitle>
            </CardHeader>
            <CardContent>
              {incomplets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Toutes les fiches ont une photo et une description.
                </p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {incomplets.length} centre{incomplets.length > 1 ? "s" : ""} sur{" "}
                    {centres.length} sans photo ni description : MAYA ne les met pas en avant,
                    un post renverrait sur une page vide.
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {incomplets.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {c.name}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {!isCromeConfigured() && (
          <Panne message="CROME_INGEST_URL / CROME_INGEST_SECRET absents : MAYA peut rédiger, mais rien ne peut être soumis à la publication." />
        )}
      </div>
    )
  } catch (e) {
    contenu = <Panne message={e instanceof Error ? e.message : String(e)} />
  }

  return (
    <>
      <Header title="Dashboard" />
      <div className="flex-1 overflow-auto p-6">{contenu}</div>
    </>
  )
}
