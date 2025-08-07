"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Send,
  Paperclip,
  Users,
  Phone,
  Video,
  MoreVertical,
  ImageIcon,
  FileText,
  Music,
  FileIcon,
  X,
} from "lucide-react"
import type { Friend, Group, Message } from "@shared/api"
import { MessageBubble } from "./MessageBubble"

interface ChatAreaProps {
  chat: {
    type: "friend" | "group"
    data: Friend | Group
    conversationId?: number
  }
  currentUserId: number
}

interface FileMetadata {
  name: string
  size: number
  type: string
  preview?: string
}

export const ChatArea = ({ chat, currentUserId }: ChatAreaProps) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [page, setPage] = useState(1) // This state is not currently used for pagination beyond initial load
  const [wsConnected, setWsConnected] = useState(false)
  const [selectedFile, setSelectedFile] = useState<FileMetadata | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Effect for handling conversation changes and WebSocket connection
  useEffect(() => {
    console.log("ChatArea effect triggered:", {
      conversationId: chat.conversationId,
      chatType: chat.type,
      currentUserId,
    })

    // Cleanup function for WebSocket
    const closeWebSocket = () => {
      if (wsRef.current) {
        console.log("Closing WebSocket connection")
        wsRef.current.close()
        wsRef.current = null
      }
      setWsConnected(false)
    }

    if (chat.conversationId) {
      // Reset state for new conversation
      setMessages([]) // Clear messages from previous chat
      setLoading(true) // Indicate loading for new chat
      setPage(1) // Reset page for new chat

      const loadAndConnect = async () => {
        await loadMessages() // Load initial messages
        connectWebSocket() // Then connect WebSocket
      }
      loadAndConnect()
    } else {
      console.log("No conversation ID available")
      setMessages([]) // Clear messages if no conversation is selected
      setLoading(false)
      closeWebSocket() // Ensure WebSocket is closed if no chat is selected
    }

    return () => {
      closeWebSocket() // Cleanup on component unmount or dependency change
    }
  }, [chat.conversationId]) // Dependency on conversationId

  // Effect for scrolling to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const loadMessages = async () => {
    if (!chat.conversationId) {
      console.log("No conversation ID, skipping message load")
      setLoading(false) // Ensure loading is false if no conversation
      return
    }
    console.log("Loading messages for conversation:", chat.conversationId)
    try {
      // Note: The current page state is always 1 here. For actual pagination,
      // you'd need a mechanism to increment page and prepend messages.
      const url = `http://127.0.0.1:8096/all-messages?conversation_id=${chat.conversationId}&page=${page}`
      console.log("Fetching messages from:", url)
      const response = await fetch(url, {
        method: "POST",
        headers: { accept: "application/json" },
        body: "", // Ensure body is empty string for POST without payload
      })
      console.log("Messages response status:", response.status)
      if (response.ok) {
        const data = await response.json()
        console.log("Messages response data:", data)
        // Assuming backend sends messages newest first, reverse to show oldest first.
        // If backend sends oldest first, remove .reverse()
        setMessages(data.reverse())
      } else {
        const errorText = await response.text()
        console.error("Failed to load messages:", response.status, errorText)
      }
    } catch (error) {
      console.error("Error loading messages:", error)
    } finally {
      setLoading(false)
    }
  }

  const connectWebSocket = () => {
    if (!chat.conversationId) {
      console.log("No conversation ID, skipping WebSocket connection")
      return
    }
    // If a WebSocket connection already exists for this conversation, do not reconnect
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected for this conversation.")
      setWsConnected(true) // Ensure state is correct
      return
    }

    const wsUrl = `ws://127.0.0.1:8096/ws/${chat.conversationId}/${currentUserId}`
    console.log("Connecting to WebSocket:", wsUrl)

    // Close any existing connection before opening a new one, just in case
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    wsRef.current = new WebSocket(wsUrl)

    wsRef.current.onopen = () => {
      console.log("WebSocket connected successfully")
      setWsConnected(true)
    }

    wsRef.current.onclose = () => {
      console.log("WebSocket connection closed")
      setWsConnected(false)
      // Optional: Implement re-connection logic here if desired
    }

    wsRef.current.onmessage = (event) => {
      console.log("WebSocket message received:", event.data)
      try {
        const data = JSON.parse(event.data)
        console.log("Parsed WebSocket data:", data)

        if (data.type === "message") {
          const newMsg: Message = {
            id: Number.parseInt(data.message.id),
            conversation_id: data.message.conversation_id,
            sender_id: data.message.sender_id,
            content: data.message.content,
            type: "message",
            attachment_id: null,
            file_name: null,
            file_type: null,
            description: null,
            file_size: null,
            created_at: data.message.timestamp,
          }
          console.log("Adding text message to state:", newMsg)
          setMessages((prev) => {
            const updated = [...prev, newMsg]
            console.log("Updated messages array with text message:", updated)
            return updated
          })
        } else if (data.type === "file") {
          const newMsg: Message = {
            id: Number.parseInt(data.message.id),
            conversation_id: data.message.conversation_id,
            sender_id: data.message.sender_id,
            content: null, // File messages typically don't have content in this schema
            type: "file",
            attachment_id: Number.parseInt(data.message.attachment_id),
            file_name: data.message.file_name,
            file_type: data.message.file_type,
            description: data.message.description,
            file_size: data.message.file_size,
            created_at: data.message.timestamp,
          }
          console.log("Adding file message to state:", newMsg)
          setMessages((prev) => {
            const updated = [...prev, newMsg]
            console.log("Updated messages array with file message:", updated)
            return updated
          })
        } else {
          console.warn("Unknown message type received from WebSocket:", data.type)
        }
      } catch (e) {
        console.error("Error parsing WebSocket message or updating state:", e, event.data)
      }
    }

    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error)
      setWsConnected(false) // Update connection status on error
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) {
      console.log("No message to send")
      return
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected or not ready. State:", wsRef.current?.readyState)
      alert("Chat connection lost or not ready. Please wait a moment and try again.")
      return
    }
    if (!chat.conversationId) {
      console.error("No conversation ID to send message to.")
      return
    }

    console.log("Attempting to send message:", newMessage)
    setSending(true)

    const messageData = {
      type: "message",
      message: {
        // Using a temporary client-side ID. Backend should assign a permanent one.
        id: Date.now().toString(),
        conversation_id: chat.conversationId,
        sender_id: currentUserId,
        content: newMessage,
        timestamp: new Date().toISOString(),
        type: "text", // Assuming 'text' for regular messages
      },
    }
    console.log("Message data being sent via WebSocket:", messageData)

    try {
      wsRef.current.send(JSON.stringify(messageData))
      setNewMessage("")
      console.log("Message sent successfully via WebSocket")
      // Optimistic update: Add message to UI immediately
      // The backend should ideally send back the confirmed message,
      // and we'd update/replace this optimistic entry.
      // For now, we'll just add it.
      const optimisticMessage: Message = {
        id: Number.parseInt(messageData.message.id), // Use client-generated ID for optimistic update
        conversation_id: messageData.message.conversation_id,
        sender_id: messageData.message.sender_id,
        content: messageData.message.content,
        type: "message",
        attachment_id: null,
        file_name: null,
        file_type: null,
        description: null,
        file_size: null,
        created_at: messageData.message.timestamp,
      }
      setMessages((prev) => [...prev, optimisticMessage])
    } catch (error) {
      console.error("Error sending message via WebSocket:", error)
      alert("Failed to send message.")
    } finally {
      setSending(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) return <ImageIcon className="h-4 w-4" />
    if (fileType.startsWith("audio/")) return <Music className="h-4 w-4" />
    if (fileType.includes("pdf") || fileType.includes("document")) return <FileText className="h-4 w-4" />
    return <FileIcon className="h-4 w-4" />
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const fileMetadata: FileMetadata = {
      name: file.name,
      size: file.size,
      type: file.type,
    }

    //Create preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setSelectedFile({
          ...fileMetadata,
          preview: e.target?.result as string,
        })
      }
      reader.readAsDataURL(file)
    } else {
      setSelectedFile(fileMetadata)
    }
  }

  const handleFileUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file || !chat.conversationId || !selectedFile) {
      console.log("File upload skipped: no file, conversation ID, or selected file.")
      return
    }

    console.log("Starting file upload process...")
    console.log("WebSocket state:", wsRef.current?.readyState)
    console.log("WebSocket connected:", wsConnected)

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not ready for file upload. State:", wsRef.current?.readyState)
      alert("Chat connection not ready. Please wait and try again.")
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append("conversation_id", chat.conversationId.toString())
    formData.append("sender_id", currentUserId.toString())
    formData.append("description", "") // Assuming description is optional or empty for now
    formData.append("file", file)

    try {
      console.log("Uploading file to backend...")
      const response = await fetch("http://127.0.0.1:8096/file", {
        method: "POST",
        headers: { accept: "application/json" }, // Ensure this is correct for your backend
        body: formData,
      })
      console.log("File upload response status:", response.status)

      if (response.ok) {
        const backendFileData = await response.json()
        console.log("Backend file response:", backendFileData)

        // Double-check WebSocket is still connected before sending message
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.error("WebSocket disconnected during file upload. File uploaded but not sent to chat.")
          alert("Connection lost during upload. File uploaded but not sent to chat.")
          return
        }

        // Create the file message with backend metadata
        const fileMessage = {
          type: "file",
          message: {
            id: Date.now().toString(), // Client-side ID for optimistic update
            conversation_id: chat.conversationId,
            sender_id: currentUserId,
            attachment_id: backendFileData.attachment_id.toString(), // Ensure this is string if backend sends it as number
            file_name: backendFileData.file_name,
            file_type: backendFileData.file_type,
            description: backendFileData.description || "",
            file_size: backendFileData.file_size,
            timestamp: new Date().toISOString(),
          },
        }

        console.log("Sending file message via WebSocket:", fileMessage)
        try {
          wsRef.current.send(JSON.stringify(fileMessage))
          console.log("File message sent successfully via WebSocket")

          // Optimistic update for file message
          const optimisticFileMessage: Message = {
            id: Number.parseInt(fileMessage.message.id),
            conversation_id: fileMessage.message.conversation_id,
            sender_id: fileMessage.message.sender_id,
            content: null,
            type: "file",
            attachment_id: Number.parseInt(fileMessage.message.attachment_id),
            file_name: fileMessage.message.file_name,
            file_type: fileMessage.message.file_type,
            description: fileMessage.message.description,
            file_size: fileMessage.message.file_size,
            created_at: fileMessage.message.timestamp,
          }
          setMessages((prev) => [...prev, optimisticFileMessage])

          // Clear selected file after successful upload and send
          setSelectedFile(null)
        } catch (wsError) {
          console.error("Error sending file message via WebSocket:", wsError)
          alert("File uploaded but failed to send to chat. Please refresh and try again.")
        }
      } else {
        const errorText = await response.text()
        console.error("File upload failed:", response.status, errorText)
        alert("Failed to upload file.")
      }
    } catch (error) {
      console.error("Error during file upload:", error)
      alert("Error uploading file.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = "" // Clear file input
      }
    }
  }

  const cancelFileSelection = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const getChatTitle = () => {
    if (chat.type === "group") {
      return (chat.data as Group).name
    } else {
      const friend = chat.data as Friend
      return `${friend.firstname} ${friend.lastname}`
    }
  }

  const getChatSubtitle = () => {
    if (chat.type === "group") {
      return "Group chat"
    } else {
      const friend = chat.data as Friend
      return friend.active ? "Online" : "Offline"
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
              {chat.type === "group" ? (
                <Users className="w-5 h-5" />
              ) : (
                (chat.data as Friend).firstname.charAt(0) + (chat.data as Friend).lastname.charAt(0)
              )}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-gray-900">{getChatTitle()}</h3>
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-500">{getChatSubtitle()}</p>
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-gray-400"}`}></div>
                <span className="text-xs text-gray-400">{wsConnected ? "Connected" : "Connecting..."}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex justify-center py-8">
              <div className="text-center text-gray-500">
                <p>No messages yet</p>
                <p className="text-sm">Start the conversation!</p>
                <p className="text-xs mt-2">Debug: {messages.length} messages loaded</p>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-400 text-center mb-2">Debug: {messages.length} messages loaded</div>
              {messages.map((message) => (
                <MessageBubble
                  key={message.id} // Ensure message.id is unique and stable
                  message={message}
                  isOwn={message.sender_id === currentUserId}
                  chatType={chat.type}
                  chatData={chat.data}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      {/* File Preview */}
      {selectedFile && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
            <div className="flex items-center space-x-3">
              {selectedFile.preview ? (
                <img
                  src={selectedFile.preview || "/placeholder.svg"}
                  alt="Preview"
                  className="w-12 h-12 object-cover rounded"
                />
              ) : (
                <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                  {getFileIcon(selectedFile.type)}
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium text-sm text-gray-900 truncate max-w-48">{selectedFile.name}</p>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span>{formatFileSize(selectedFile.size)}</span>
                  <span>•</span>
                  <span>{selectedFile.type}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={handleFileUpload}
                disabled={uploading || !wsConnected}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                title={!wsConnected ? "WebSocket not connected" : "Send file"}
              >
                {uploading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : "Send"}
              </Button>
              <Button onClick={cancelFileSelection} variant="ghost" size="sm" className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Message Input */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex items-center space-x-2">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !!selectedFile}
          >
            {uploading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
          <div className="flex-1 relative">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Type a message..."
              className="pr-12 h-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              disabled={sending}
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending || !wsConnected}
            className="h-10 w-10 p-0 bg-blue-600 hover:bg-blue-700"
            title={!wsConnected ? "Connecting to chat..." : "Send message"}
          >
            {sending ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
