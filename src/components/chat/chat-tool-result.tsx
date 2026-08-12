"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import type { ToolCallResult } from "@/lib/ai/types"
import { Wrench, Check, AlertCircle, ChevronDown, ChevronRight } from "lucide-react"

const TOOL_LABELS: Record<string, string> = {
  get_centres: "Centres du réseau",
  get_formations: "Catalogue formations",
  get_sessions_ouvertes: "Sessions ouvertes",
  get_articles: "Articles du blog",
  get_chiffres: "Compteurs plateforme",
  generate_visual: "Visuel de marque",
  submit_social_post: "Soumission à CROME OS",
}

function summarizeResult(toolName: string, result: unknown): string {
  if (!result || typeof result !== "object") return ""
  const r = result as Record<string, unknown>

  if (r.error) return `Erreur : ${r.error}`

  switch (toolName) {
    case "get_centres":
      return r.total != null
        ? `${r.total} centre(s) actif(s)` +
            (Array.isArray(r.sans_photo_ni_description) && r.sans_photo_ni_description.length
              ? ` — ${r.sans_photo_ni_description.length} fiche(s) incomplète(s)`
              : "")
        : ""
    case "get_formations":
      return r.total != null ? `${r.total} formation(s) au catalogue` : ""
    case "get_sessions_ouvertes":
      return r.total != null
        ? r.total === 0
          ? "Aucune session ouverte — rien à promouvoir"
          : `${r.total} session(s) avec des places`
        : ""
    case "get_articles":
      return r.total != null ? `${r.total} article(s) publié(s)` : ""
    case "get_chiffres":
      return r.centres != null
        ? `${r.centres} centres · ${r.sessionsOuvertes} sessions · ${r.articles} articles`
        : ""
    case "generate_visual":
      if (Array.isArray(r.catalogue)) return `${r.catalogue.length} scène(s) disponible(s)`
      if (r.refused) return `Refusé : ${r.reason ?? "scène inconnue"}`
      if (r.image_url) return "Visuel généré"
      return ""
    case "submit_social_post":
      // On affiche la lecture rendue par l'outil plutôt que de réinterpréter
      // published/queued ici : deux endroits qui traduisent le même booléen
      // finissent toujours par diverger.
      return typeof r.lecture === "string" ? r.lecture : ""
    default:
      return ""
  }
}

export function ChatToolResult({ toolCall }: { toolCall: ToolCallResult }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[toolCall.toolName] ?? toolCall.toolName
  const isLoading = toolCall.result === null
  const isError = toolCall.status === "error"
  const summary = !isLoading ? summarizeResult(toolCall.toolName, toolCall.result) : ""

  return (
    <div className="my-2 rounded-md border bg-muted/50 px-3 py-2">
      <div
        className="flex cursor-pointer items-center gap-2"
        onClick={() => !isLoading && setExpanded(!expanded)}
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{label}</span>
        {isLoading ? (
          <Badge variant="outline" className="text-[10px]">
            En cours...
          </Badge>
        ) : isError ? (
          <Badge variant="destructive" className="text-[10px]">
            <AlertCircle className="mr-1 h-3 w-3" />
            Erreur
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            <Check className="mr-1 h-3 w-3" />
            OK
          </Badge>
        )}
        {!isLoading && (
          expanded
            ? <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
        )}
      </div>
      {summary && !expanded && (
        <p className="mt-1 text-[11px] text-muted-foreground">{summary}</p>
      )}
      {expanded && toolCall.result != null && (
        <pre className="mt-1 max-h-40 overflow-auto text-[11px] text-muted-foreground">
          {typeof toolCall.result === "string"
            ? toolCall.result
            : JSON.stringify(toolCall.result as object, null, 2)}
        </pre>
      )}
    </div>
  )
}
