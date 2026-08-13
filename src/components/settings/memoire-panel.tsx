"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trash2, Brain } from "lucide-react"

interface Fait {
  cle: string
  fait: string
  pourquoi: string | null
  updated_at: string
}

/**
 * Ce que MAYA croit devoir appliquer, et de quoi le retirer.
 *
 * Une mémoire qu'on ne peut pas relire est une mémoire qu'on ne peut pas
 * corriger : une consigne mal comprise s'appliquerait à chaque post sans que
 * personne ne sache d'où elle vient.
 */
export function MemoirePanel() {
  const [faits, setFaits] = useState<Fait[]>([])
  const [max, setMax] = useState(30)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/admin-maya/api/memoire")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setFaits(data.faits ?? [])
      setMax(data.max ?? 30)
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur")
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  async function retirer(cle: string) {
    setFaits((prev) => prev.filter((f) => f.cle !== cle))
    await fetch(`/admin-maya/api/memoire?cle=${encodeURIComponent(cle)}`, { method: "DELETE" })
    await charger()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4" aria-hidden="true" />
          Consignes durables
        </CardTitle>
        <CardDescription>
          Ce que MAYA applique à chaque échange et à chaque tâche planifiée, en plus de sa
          persona. {faits.length} sur {max}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chargement && <p className="text-sm text-muted-foreground">Chargement…</p>}

        {erreur && (
          <p className="text-sm text-destructive">
            Mémoire illisible : <code>{erreur}</code>
          </p>
        )}

        {!chargement && !erreur && faits.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucune consigne. Dites-lui « désormais, … » dans le chat et elle la retiendra.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {faits.map((f) => (
            <li
              key={f.cle}
              className="flex items-start justify-between gap-4 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{f.cle}</p>
                <p className="mt-1 text-sm">{f.fait}</p>
                {f.pourquoi && (
                  <p className="mt-1 text-xs text-muted-foreground">Pourquoi : {f.pourquoi}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void retirer(f.cle)}
                aria-label={`Oublier la consigne ${f.cle}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
