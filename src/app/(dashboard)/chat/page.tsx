"use client"

import { Header } from "@/components/layout/header"
import { ChatMessages } from "@/components/chat/chat-messages"
import { ChatInput } from "@/components/chat/chat-input"
import { useAiChat } from "@/hooks/use-ai-chat"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

export default function ChatPage() {
  const { messages, isStreaming, sendMessage, stopStreaming, clear } = useAiChat()

  return (
    <>
      <Header title="Chat MAYA">
        <Button
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={isStreaming || messages.length === 0}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Effacer
        </Button>
      </Header>

      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatMessages messages={messages} onSuggestionClick={sendMessage} />
        <ChatInput onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
      </div>
    </>
  )
}
