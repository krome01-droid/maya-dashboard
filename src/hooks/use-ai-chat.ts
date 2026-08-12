"use client"

import { useState, useCallback, useRef } from "react"
import type { ChatMessage, FileAttachment, StreamEvent, ToolCallResult } from "@/lib/ai/types"

/**
 * Le chat de MAYA — streaming seul, sans persistance.
 *
 * LOU et STAN sauvegardent chaque échange dans leur base (`conversations`).
 * MAYA n'a pas de table pour ça : la base de la marketplace appartient au
 * produit, et y écrire l'historique de conversation d'un agent y ajouterait
 * une table de back-office dans un schéma de réservation. Tant qu'il n'y a
 * pas de base propre à l'agent, la conversation vit dans l'onglet.
 */
export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  const clear = useCallback(() => {
    stopStreaming()
    setMessages([])
  }, [stopStreaming])

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
      }
    },
    [messages],
  )

  return { messages, isStreaming, sendMessage, stopStreaming, clear }
}
