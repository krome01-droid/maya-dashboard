"use client"

import { Header } from "@/components/layout/header"
import { ChatMessages } from "@/components/chat/chat-messages"
import { ChatInput } from "@/components/chat/chat-input"
import { useAiChat } from "@/hooks/use-ai-chat"
import { Button } from "@/components/ui/button"
import { Trash2, SquarePen, History } from "lucide-react"
import { useState } from "react"

/** « il y a 3 h », « hier », « le 11/08 » — plus lisible qu'un horodatage. */
function ilYA(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  if (h < 48) return "hier"
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
}

export default function ChatPage() {
  const {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    clear,
    sessions,
    sessionId,
    ouvrirSession,
    nouvelleConversation,
  } = useAiChat()

  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)
  const anterieures = sessions.filter((s) => s.session_id !== sessionId)

  return (
    <>
      <Header title="Chat MAYA">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setHistoriqueOuvert((v) => !v)}
          aria-expanded={historiqueOuvert}
          disabled={anterieures.length === 0}
        >
          <History className="mr-2 h-4 w-4" aria-hidden="true" />
          Historique
          {anterieures.length > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground">{anterieures.length}</span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={nouvelleConversation}
          disabled={isStreaming || messages.length === 0}
        >
          <SquarePen className="mr-2 h-4 w-4" aria-hidden="true" />
          Nouvelle
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={isStreaming || messages.length === 0}
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Effacer
        </Button>
      </Header>

      {historiqueOuvert && anterieures.length > 0 && (
        <div className="border-b bg-muted/30 px-4 py-3">
          <p className="mb-2 text-xs text-muted-foreground">
            « Effacer » supprime définitivement la conversation ouverte. « Nouvelle » la conserve.
          </p>
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {anterieures.map((s) => (
              <li key={s.session_id}>
                <button
                  type="button"
                  onClick={() => {
                    void ouvrirSession(s.session_id)
                    setHistoriqueOuvert(false)
                  }}
                  className="flex w-full items-baseline justify-between gap-4 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate">{s.titre}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.messages} msg · {ilYA(s.derniere_activite)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatMessages messages={messages} onSuggestionClick={sendMessage} />
        <ChatInput onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
      </div>
    </>
  )
}
