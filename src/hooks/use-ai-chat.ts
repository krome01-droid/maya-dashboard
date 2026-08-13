"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { ChatMessage, FileAttachment, StreamEvent, ToolCallResult } from "@/lib/ai/types"

export interface ResumeSession {
  session_id: string
  titre: string
  messages: number
  derniere_activite: string
}

const CLE_SESSION = "maya.session"

/**
 * Le chat de MAYA, avec mémoire.
 *
 * L'identifiant de session vit dans `localStorage` : rouvrir l'onglet reprend
 * la conversation là où elle s'était arrêtée. L'écriture, elle, se fait côté
 * serveur dans la route de chat — pas ici. Le navigateur peut être fermé au
 * milieu d'une réponse ; c'est le flux qui sait quand elle est complète, et
 * lui seul.
 */
export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ResumeSession[]>([])
  const [chargement, setChargement] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const rafraichirSessions = useCallback(async () => {
    try {
      const res = await fetch("/admin-maya/api/conversations")
      if (res.ok) setSessions(((await res.json()).sessions ?? []) as ResumeSession[])
    } catch {
      // Le sélecteur reste vide : ce n'est pas une raison de casser le chat.
    }
  }, [])

  // Reprise au montage : on relit la session mémorisée, ou on en ouvre une.
  useEffect(() => {
    let annule = false
    const existant = window.localStorage.getItem(CLE_SESSION)
    const id = existant ?? crypto.randomUUID()
    if (!existant) window.localStorage.setItem(CLE_SESSION, id)
    setSessionId(id)

    void (async () => {
      try {
        const res = await fetch(`/admin-maya/api/conversations/${id}`)
        if (res.ok && !annule) {
          setMessages(((await res.json()).messages ?? []) as ChatMessage[])
        }
      } catch {
        // Historique injoignable : on repart d'une conversation vide plutôt
        // que d'afficher une erreur pour une mémoire, qui reste un confort.
      } finally {
        if (!annule) setChargement(false)
      }
      await rafraichirSessions()
    })()

    return () => {
      annule = true
    }
  }, [rafraichirSessions])

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  /** Ouvre une conversation vide, sans toucher aux précédentes. */
  const nouvelleConversation = useCallback(() => {
    stopStreaming()
    const id = crypto.randomUUID()
    window.localStorage.setItem(CLE_SESSION, id)
    setSessionId(id)
    setMessages([])
  }, [stopStreaming])

  /** Reprend une conversation antérieure. */
  const ouvrirSession = useCallback(
    async (id: string) => {
      stopStreaming()
      window.localStorage.setItem(CLE_SESSION, id)
      setSessionId(id)
      setChargement(true)
      try {
        const res = await fetch(`/admin-maya/api/conversations/${id}`)
        setMessages(res.ok ? (((await res.json()).messages ?? []) as ChatMessage[]) : [])
      } finally {
        setChargement(false)
      }
    },
    [stopStreaming],
  )

  /**
   * Efface la conversation courante — sur le serveur aussi.
   *
   * Ne vider que l'affichage laisserait l'historique en base et le ferait
   * réapparaître au prochain chargement : « Effacer » doit effacer.
   */
  const clear = useCallback(async () => {
    stopStreaming()
    setMessages([])
    if (sessionId) {
      try {
        await fetch(`/admin-maya/api/conversations/${sessionId}`, { method: "DELETE" })
      } catch {
        // Suppression distante impossible : l'affichage est vidé quand même.
      }
    }
    nouvelleConversation()
    await rafraichirSessions()
  }, [sessionId, stopStreaming, nouvelleConversation, rafraichirSessions])

  const sendMessage = useCallback(
    async (content: string, attachments?: FileAttachment[]) => {
      if (!content.trim() && !attachments?.length) return

      const userMessage: ChatMessage = {
        role: "user",
        content,
        attachments,
        timestamp: new Date().toISOString(),
      }
      const historique = [...messages, userMessage]

      setMessages([...historique, { role: "assistant", content: "", toolCalls: [] }])
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      // Accumulés hors du state : un `setMessages` par token ferait re-rendre
      // toute la liste à chaque delta.
      let texte = ""
      const outils: ToolCallResult[] = []

      const majDernier = () => {
        setMessages((prev) => {
          const copie = [...prev]
          copie[copie.length - 1] = {
            role: "assistant",
            content: texte,
            toolCalls: [...outils],
            timestamp: new Date().toISOString(),
          }
          return copie
        })
      }

      try {
        const res = await fetch("/admin-maya/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId ?? undefined,
            messages: historique.map((m) => ({
              role: m.role,
              content: m.content,
              attachments: m.attachments,
            })),
          }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          texte = `**Erreur** : ${err.error ?? res.status}`
          majDernier()
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let tampon = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          tampon += decoder.decode(value, { stream: true })
          const lignes = tampon.split("\n")
          // La dernière peut être tronquée : elle repart dans le tampon.
          tampon = lignes.pop() ?? ""

          for (const ligne of lignes) {
            if (!ligne.trim()) continue
            let ev: StreamEvent
            try {
              ev = JSON.parse(ligne) as StreamEvent
            } catch {
              continue
            }

            switch (ev.type) {
              case "text_delta":
                texte += ev.content
                majDernier()
                break
              case "tool_use_start":
                outils.push({
                  toolName: ev.toolName,
                  toolInput: ev.toolInput,
                  result: null,
                  status: "success",
                })
                majDernier()
                break
              case "tool_result": {
                const cible = [...outils].reverse().find((t) => t.toolName === ev.toolName)
                if (cible) {
                  cible.result = ev.result
                  cible.status = ev.status
                }
                majDernier()
                break
              }
              case "error":
                texte += `\n\n**Erreur** : ${ev.error}`
                majDernier()
                break
              case "message_stop":
                break
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          texte += `\n\n**Erreur** : ${e instanceof Error ? e.message : String(e)}`
          majDernier()
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
        // Le titre d'une conversation vient de son premier message : la liste
        // n'est juste qu'une fois le tour terminé.
        void rafraichirSessions()
      }
    },
    [messages, sessionId, rafraichirSessions],
  )

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    clear,
    sessions,
    sessionId,
    chargement,
    ouvrirSession,
    nouvelleConversation,
  }
}
