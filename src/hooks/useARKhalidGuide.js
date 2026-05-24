import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  buildARPreferenceContext,
  buildARRetrievalQuery,
  buildKhalidIdleLine,
  buildKhalidLockedIntro,
  fetchKhalidSpotNarration,
} from '../services/arKhalidGuide'

export const useARKhalidGuide = ({
  lockedPoi,
  lockedPoiLive,
  isLockedMode,
  navigateToDest,
  profileSummary,
  generalLabels,
  maxDistanceKm,
  visiblePoiNames = [],
}) => {
  const [narration, setNarration] = useState('')
  const [narrationLoading, setNarrationLoading] = useState(false)
  const narrateGenRef = useRef(0)

  const preferenceContext = useMemo(
    () =>
      buildARPreferenceContext({
        profileSummary,
        generalLabels,
        maxDistanceKm,
      }),
    [profileSummary, generalLabels, maxDistanceKm],
  )

  const retrievalOptions = useMemo(
    () => ({
      queryText: buildARRetrievalQuery(preferenceContext),
      personaSummary: preferenceContext.personaSummary,
      generalLabels: preferenceContext.generalLabels,
    }),
    [preferenceContext],
  )

  const idleLine = useMemo(() => buildKhalidIdleLine(preferenceContext), [preferenceContext])

  const activePoi = isLockedMode ? lockedPoiLive || lockedPoi : null

  useEffect(() => {
    if (!isLockedMode || !activePoi || navigateToDest) {
      setNarration('')
      setNarrationLoading(false)
      return undefined
    }

    const gen = narrateGenRef.current + 1
    narrateGenRef.current = gen
    setNarration(buildKhalidLockedIntro(activePoi.name))
    setNarrationLoading(true)

    let cancelled = false
    ;(async () => {
      const text = await fetchKhalidSpotNarration(activePoi, preferenceContext)
      if (cancelled || narrateGenRef.current !== gen) return
      setNarration(text)
      setNarrationLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [isLockedMode, activePoi, navigateToDest, preferenceContext])

  const displayLine = isLockedMode && activePoi ? narration : idleLine
  const isSpeaking = narrationLoading || (isLockedMode && Boolean(displayLine))

  const getChatHandoff = useCallback(() => {
    const poi = activePoi
    if (poi) {
      return {
        place: poi.name,
        summary: [narration, visiblePoiNames.length ? `Also in view: ${visiblePoiNames.join(', ')}` : '']
          .filter(Boolean)
          .join(' ')
          .slice(0, 500),
      }
    }
    return {
      place: 'AR explorer',
      summary: [idleLine, visiblePoiNames.length ? `In camera view: ${visiblePoiNames.join(', ')}` : '']
        .filter(Boolean)
        .join(' ')
        .slice(0, 500),
    }
  }, [activePoi, narration, visiblePoiNames, idleLine])

  return {
    preferenceContext,
    retrievalOptions,
    displayLine,
    narrationLoading,
    isSpeaking,
    idleLine,
    getChatHandoff,
  }
}
