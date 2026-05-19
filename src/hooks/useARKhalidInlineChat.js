import { useState, useRef, useCallback, useEffect } from 'react'
import { sendARKhalidMessage } from '../services/arKhalidChat'

const MAX_API_TURNS = 6

export const useARKhalidInlineChat = ({
  generalLabels = [],
  personaSummary = '',
  viewerUType = 'local',
  arContext = {},
}) => {
  const [latestAnswer, setLatestAnswer] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState(null)
  const apiHistoryRef = useRef([])
  const abortRef = useRef(null)
  const chatLoadingRef = useRef(false)
  const arContextRef = useRef(arContext)
  const prefsRef = useRef({
    generalLabels,
    personaSummary,
    viewerUType,
  })

  chatLoadingRef.current = chatLoading
  arContextRef.current = arContext
  prefsRef.current = {
    generalLabels,
    personaSummary,
    viewerUType,
  }

  useEffect(() => {
    apiHistoryRef.current = []
    setLatestAnswer('')
    setChatError(null)
  }, [arContext?.isLocked, arContext?.lockedPlaceName])

  const sendMessage = useCallback(async (text) => {
    const trimmed = String(text || '').trim()
    if (!trimmed || chatLoadingRef.current) return

    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    setChatError(null)
    chatLoadingRef.current = true
    setChatLoading(true)

    const {
      generalLabels: gl,
      personaSummary: ps,
      viewerUType: vt,
    } = prefsRef.current

    try {
      const { reply } = await sendARKhalidMessage({
        userText: trimmed,
        generalLabels: gl,
        personaSummary: ps,
        viewerUType: vt,
        arContext: arContextRef.current,
        apiHistory: apiHistoryRef.current,
        signal: abortController.signal,
      })

      apiHistoryRef.current = [
        ...apiHistoryRef.current,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: reply },
      ].slice(-MAX_API_TURNS * 2)

      setLatestAnswer(reply)
    } catch (e) {
      if (e?.name === 'AbortError') return
      setChatError(e?.message || 'Could not reach Khalid')
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null
        chatLoadingRef.current = false
        setChatLoading(false)
      }
    }
  }, [])

  const clearChat = useCallback(() => {
    abortRef.current?.abort()
    apiHistoryRef.current = []
    setLatestAnswer('')
    setChatError(null)
    chatLoadingRef.current = false
    setChatLoading(false)
  }, [])

  return {
    latestAnswer,
    chatLoading,
    chatError,
    sendMessage,
    clearChat,
    hasChatReply: Boolean(latestAnswer),
  }
}
