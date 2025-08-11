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
  const [unreadCount, setUnreadCount] = useState(0)
  const [firstUnreadId, setFirstUnreadId] = useState<number | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const firstUnreadRef = useRef<HTMLDivElement>(null)
  // IntersectionObserver + read batching
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null)
  const pendingLastSeenDateRef = useRef<string | null>(null)
  const readTimerRef = useRef<NodeJS.Timeout | null>(null)
  // Track the last read receipt we sent to identify self acks
  const lastSentReadDateRef = useRef<string | null>(null)

  // Effect for handling conversation changes and WebSocket connection
  useEffect(() => {
    console.log("ChatArea effect triggered:", {
      conversationId: chat.conversationId,
      chatType: chat.type,
      currentUserId,
    })

    // Cleanup function for WebSocket and observer
    const cleanup = () => {
      if (wsRef.current) {
        console.log("Closing WebSocket connection")
        wsRef.current.close()
        wsRef.current = null
      }
      setWsConnected(false)
      if (intersectionObserverRef.current) {
        intersectionObserverRef.current.disconnect()
        intersectionObserverRef.current = null
      }
      if (readTimerRef.current) {
        clearTimeout(readTimerRef.current)
        readTimerRef.current = null
      }
      pendingLastSeenDateRef.current = null
    }

    if (chat.conversationId) {
      // Reset state for new conversation
      setMessages([]) // Clear messages from previous chat
      setLoading(true) // Indicate loading for new chat
      setPage(1) // Reset page for new chat

      const loadAndConnect = async () => {
        await loadMessages() // Load initial messages
        connectWebSocket() // Then connect WebSocket
        setupIntersectionObserver() // Setup observer for read receipts
      }
      loadAndConnect()
    } else {
      console.log("No conversation ID available")
      setMessages([]) // Clear messages if no conversation is selected
      setLoading(false)
      cleanup() // Ensure everything is cleaned up if no chat is selected
    }

    return () => {
      cleanup() // Cleanup on component unmount or dependency change
    }
  }, [chat.conversationId]) // Dependency on conversationId

  // Effect for scrolling behavior - Telegram-like
  useEffect(() => {
    if (!loading && messages.length > 0) {
      // If there are unread messages, scroll to first unread
      if (firstUnreadId && firstUnreadRef.current) {
        firstUnreadRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
      } else {
        // If no unread messages, scroll to bottom (latest message)
        scrollToBottom()
      }
    }
  }, [messages, loading, firstUnreadId])

  // Effect for auto-scrolling new messages (only if user is at bottom)
  useEffect(() => {
    if (!loading) {
      // Auto-scroll new messages only - this handles WebSocket messages
      scrollToBottom()
    }
  }, [messages.length])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const setupIntersectionObserver = () => {
    if (intersectionObserverRef.current) {
      intersectionObserverRef.current.disconnect()
    }

    intersectionObserverRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const createdAt = entry.target.getAttribute('data-created-at') || ''
          const isUnreadMessage = entry.target.getAttribute('data-is-unread') === 'true'
          const isFromOthers = entry.target.getAttribute('data-from-others') === 'true'

          if (entry.isIntersecting && isUnreadMessage && isFromOthers) {
            if (createdAt) {
              const current = pendingLastSeenDateRef.current
              const tNew = new Date(String(createdAt)).getTime()
              const tOld = current ? new Date(String(current)).getTime() : -Infinity
              if (Number.isFinite(tNew) && tNew > tOld) {
                pendingLastSeenDateRef.current = createdAt
              }
            }
            scheduleReadReceipts()
          }
        })
      },
      { root: null, rootMargin: '0px', threshold: 0.5 }
    )

    // Observe any existing message elements
    const messageElements = document.querySelectorAll('[data-created-at]')
    messageElements.forEach((el) => intersectionObserverRef.current?.observe(el))
  }

  const scheduleReadReceipts = () => {
    if (readTimerRef.current) clearTimeout(readTimerRef.current)
    readTimerRef.current = setTimeout(() => {
      sendReadReceipts()
    }, 200)
  }

  const sendReadReceipts = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    const lastSeen = pendingLastSeenDateRef.current
    if (!lastSeen) return

    const readReceiptData = {
      type: "mark_as_read",
      last_seen_date: lastSeen,
      user_id: currentUserId,
      conversation_id: chat.conversationId,
    }
    console.log("Sending read receipts up to last_seen_date:", readReceiptData.last_seen_date)

    try {
      // Remember this timestamp to detect our own ack from server
      lastSentReadDateRef.current = lastSeen
      wsRef.current.send(JSON.stringify(readReceiptData))
      pendingLastSeenDateRef.current = null

      // Optimistically mark incoming messages as read up to cutoff
      const cutoff = new Date(String(lastSeen)).getTime()
      if (Number.isFinite(cutoff)) {
        setMessages((prev) => {
          const updated = prev.map((msg) => {
            const t = new Date(String(msg.created_at)).getTime()
            if (msg.sender_id !== currentUserId && Number.isFinite(t) && t <= cutoff && msg.is_read === false) {
              return { ...msg, is_read: true }
            }
            return msg
          })

          const newUnreadCount = updated.filter((m) => m.is_read === false && m.sender_id !== currentUserId).length
          setUnreadCount(newUnreadCount)
          const firstUnread = updated.find((m) => m.is_read === false && m.sender_id !== currentUserId)
          setFirstUnreadId(firstUnread ? firstUnread.id : null)
          return updated
        })
      }
    } catch (error) {
      console.error("Error sending read receipts:", error)
    }
  }

  const loadMessages = async () => {
    if (!chat.conversationId) {
      console.log("No conversation ID, skipping message load")
      setLoading(false) // Ensure loading is false if no conversation
      return
    }
    console.log("Loading messages for conversation:", chat.conversationId)

    const ensureType = (raw: any): Message => {
      const inferredType: 'message' | 'file' = raw?.type
        ? (raw.type === 'file' ? 'file' : 'message')
        : (raw?.attachment_id != null || raw?.file_name != null ? 'file' : 'message')
      return {
        id: Number(raw.id),
        conversation_id: Number(raw.conversation_id),
        attachment_id: raw.attachment_id != null ? Number(raw.attachment_id) : null,
        sender_id: Number(raw.sender_id),
        content: raw.content ?? null,
        file_name: raw.file_name ?? null,
        file_type: raw.file_type ?? null,
        description: raw.description ?? null,
        file_size: raw.file_size != null ? Number(raw.file_size) : null,
        created_at: String(raw.created_at ?? raw.timestamp ?? new Date().toISOString()),
        type: inferredType,
        is_read: Boolean(raw.is_read)
      }
    }

    try {
      // Note: The current page state is always 1 here. For actual pagination,
      // you'd need a mechanism to increment page and prepend messages.
      const url = `http://127.0.0.1:8096/all-messages?conversation_id=${chat.conversationId}&page=${page}`
      console.log("Fetching messages from:", url)
      const response = await fetch(url, {
        method: "POST",
        headers: { accept: "application/json" },
        body: "" // Ensure body is empty string for POST without payload
      })
      console.log("Messages response status:", response.status)
      if (response.ok) {
        const data = await response.json()
        console.log("Messages response data:", data)
        
        // Handle new API format with readed_messages and not_readed_messages
        let allMessages: Message[] = []
        let unreadMessages: Message[] = []
        
        console.log("Raw readed_messages:", data.readed_messages)
        console.log("Raw not_readed_messages:", data.not_readed_messages)
        
        // Collect read messages (mark them as read)
        if (data.readed_messages && Array.isArray(data.readed_messages)) {
          const readMessages = data.readed_messages.map((msg: any) => {
            const m = ensureType(msg)
            return { ...m, is_read: true }
          })
          allMessages = [...readMessages]
          console.log("Read messages with timestamps:", readMessages.map((m: Message) => ({ id: m.id, content: m.content, created_at: m.created_at })))
        }
        
        // Collect unread messages and mark them
        if (data.not_readed_messages && Array.isArray(data.not_readed_messages)) {
          const allUnreadMessages = data.not_readed_messages.map((msg: any) => {
            const m = ensureType(msg)
            return { ...m, is_read: false }
          })
          
          // For unread count, only count messages from others
          unreadMessages = allUnreadMessages.filter((msg: Message) => msg.sender_id !== currentUserId)
          
          // But add ALL unread messages to the messages array (including user's own)
          allMessages = [...allMessages, ...allUnreadMessages]
          console.log("Unread messages with timestamps:", allUnreadMessages.map((m: Message) => ({ id: m.id, content: m.content, created_at: m.created_at })))
        }
        
        // Sort all messages chronologically (oldest first, like Telegram)
        allMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        console.log("After sorting:", allMessages.map(m => ({ id: m.id, content: m.content, created_at: m.created_at, is_read: m.is_read })))

        // Find the first unread message in the sorted array (only from others)
        const firstUnreadMessage = allMessages.find(msg => msg.is_read === false && msg.sender_id !== currentUserId)
        
        // Set unread count and first unread message ID
        setUnreadCount(unreadMessages.length)
        setFirstUnreadId(firstUnreadMessage ? firstUnreadMessage.id : null)
        
        console.log("Combined messages (chronological order):", allMessages)
        console.log("Unread count:", unreadMessages.length)
        console.log("First unread ID:", firstUnreadMessage ? firstUnreadMessage.id : null)
        setMessages(allMessages)
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
          const parsedId = Number.parseInt(data.message.id)
          const newMsg: Message = {
            id: Number.isNaN(parsedId) ? Date.now() : parsedId,
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
            // Wait for server confirmation to mark as read
            is_read: false
          }
          console.log("Adding text message to state:", newMsg)
          setMessages((prev) => {
            const updated = [...prev, newMsg]
            // Recompute counters: new incoming message counts as unread
            const newUnreadCount = updated.filter(m => m.is_read === false && m.sender_id !== currentUserId).length
            setUnreadCount(newUnreadCount)
            const firstUnread = updated.find(m => m.is_read === false && m.sender_id !== currentUserId)
            setFirstUnreadId(firstUnread ? firstUnread.id : null)
            console.log("Updated messages array with text message:", updated)
            return updated
          })
        } else if (data.type === "file") {
          // Support either data.message or data.metadata shapes
          const payload = (data as any).message ?? (data as any).metadata
          if (!payload) {
            console.warn('File event without payload')
            return
          }
          const parsedId = Number.parseInt(payload.id)
          const parsedAttachment = Number.parseInt(payload.attachment_id)
          const newMsg: Message = {
            id: Number.isNaN(parsedId) ? Date.now() : parsedId,
            conversation_id: payload.conversation_id,
            sender_id: payload.sender_id,
            content: null, // File messages typically don't have content in this schema
            type: "file",
            attachment_id: Number.isNaN(parsedAttachment) ? null : parsedAttachment,
            file_name: payload.file_name,
            file_type: payload.file_type,
            description: payload.description,
            file_size: payload.file_size,
            created_at: payload.timestamp,
            // Wait for server confirmation to mark as read
            is_read: false
          }
          console.log("Adding file message to state:", newMsg)
          setMessages((prev) => {
            const updated = [...prev, newMsg]
            // Recompute counters: new incoming file message counts as unread if from others
            const newUnreadCount = updated.filter(m => m.is_read === false && m.sender_id !== currentUserId).length
            setUnreadCount(newUnreadCount)
            const firstUnread = updated.find(m => m.is_read === false && m.sender_id !== currentUserId)
            setFirstUnreadId(firstUnread ? firstUnread.id : null)
            console.log("Updated messages array with file message:", updated)
            return updated
          })
        } else if (data.type === "messages_read") {
          // Backend confirms with last_seen_date (timestamp-based receipts)
          const lastSeen = data.last_seen_date
          if (!lastSeen) {
            console.warn("messages_read without last_seen_date")
            return
          }
          const cutoff = new Date(String(lastSeen)).getTime()
          if (!Number.isFinite(cutoff)) {
            console.warn("Invalid last_seen_date in messages_read:", lastSeen)
            return
          }

          const readerId: number | undefined =
            typeof data.user_id === 'number' ? data.user_id :
            typeof data.reader_id === 'number' ? data.reader_id :
            typeof data.readerId === 'number' ? data.readerId : undefined

          // Self ack detection: if server echoes our last sent last_seen_date, treat as self
          const isSelfAckByTimestamp = lastSentReadDateRef.current === lastSeen
          if (isSelfAckByTimestamp) {
            // Clear the ref once matched
            lastSentReadDateRef.current = null
          }

          const isPeerReader = typeof readerId === 'number'
            ? readerId !== currentUserId
            : !isSelfAckByTimestamp

          setMessages((prev) => {
            const updated = prev.map((msg) => {
              const t = new Date(String(msg.created_at)).getTime()
              if (!Number.isFinite(t) || t > cutoff || msg.is_read === true) return msg

              if (isPeerReader) {
                // Peer read our messages up to cutoff -> mark our outgoing as read
                if (msg.sender_id === currentUserId) return { ...msg, is_read: true }
              } else {
                // We read incoming messages up to cutoff
                if (msg.sender_id !== currentUserId) return { ...msg, is_read: true }
              }
              return msg
            })

            const newUnreadCount = updated.filter(m => m.is_read === false && m.sender_id !== currentUserId).length
            setUnreadCount(newUnreadCount)
            const firstUnread = updated.find(m => m.is_read === false && m.sender_id !== currentUserId)
            setFirstUnreadId(firstUnread ? firstUnread.id : null)
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
      // Optimistic update
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
        is_read: false
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
            is_read: false
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
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-gray-900">{getChatTitle()}</h3>
              {unreadCount > 0 && (
                <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {unreadCount}
                </span>
              )}
            </div>
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
              <div className="text-xs text-gray-400 text-center mb-2">
                Debug: {messages.length} messages loaded
                {unreadCount > 0 && ` • ${unreadCount} unread`}
              </div>
              {messages.map((message, index) => {
                const isFirstUnread = message.id === firstUnreadId
                // A message is unread only if from others and marked unread
                const isUnread = message.is_read === false && message.sender_id !== currentUserId
                
                return (
                  <div 
                    key={message.id}
                    data-created-at={message.created_at}
                    data-is-unread={message.is_read === false}
                    data-from-others={message.sender_id !== currentUserId}
                    ref={(el) => {
                      if (el && intersectionObserverRef.current) {
                        intersectionObserverRef.current.observe(el)
                      }
                    }}
                  >
                    {isFirstUnread && unreadCount > 0 && (
                      <div 
                        ref={firstUnreadRef}
                        className="flex items-center justify-center my-4"
                      >
                        <div className="flex-1 h-px bg-blue-200"></div>
                        <span className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full border border-blue-200">
                          {unreadCount} unread message{unreadCount > 1 ? 's' : ''}
                        </span>
                        <div className="flex-1 h-px bg-blue-200"></div>
                      </div>
                    )}
                    <div className={isUnread ? "relative" : ""}>
                      {/* {isUnread && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r-full"></div>
                      )} */}
                      <MessageBubble
                        message={message}
                        isOwn={message.sender_id === currentUserId}
                        chatType={chat.type}
                        chatData={chat.data}
                      />
                    </div>
                  </div>
                )
              })}
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
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
