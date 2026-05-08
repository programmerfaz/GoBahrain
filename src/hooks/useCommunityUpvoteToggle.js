import { useRef, useState, useCallback } from 'react'
import { Animated } from 'react-native'
import { upvoteCommunityPost, removeUpvoteCommunityPost } from '../services/community'

/** Home-style community upvote: optimistic state, button spring scale, particle burst on add. */
export const useCommunityUpvoteToggle = () => {
  const upvoteAnimationsRef = useRef({})
  const upvoteInFlightRef = useRef(new Set())
  const [particlesVisible, setParticlesVisible] = useState(false)
  const [particlePosition, setParticlePosition] = useState({ x: 0, y: 0 })

  const getUpvoteScaleAnim = useCallback((postId) => {
    if (!postId) return null
    if (!upvoteAnimationsRef.current[postId]) {
      upvoteAnimationsRef.current[postId] = new Animated.Value(1)
    }
    return upvoteAnimationsRef.current[postId]
  }, [])

  const runScaleAnim = useCallback((postId, adding) => {
    const scaleAnim = getUpvoteScaleAnim(postId)
    if (!scaleAnim) return
    if (adding) {
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.18,
          tension: 280,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 260,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.92,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 260,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [getUpvoteScaleAnim])

  const handleUpvoteToggle = useCallback(
    (post, event, syncPost) => {
      if (!post?.id || typeof syncPost !== 'function') return
      const adding = !post.upvoted
      if (upvoteInFlightRef.current.has(post.id)) return
      upvoteInFlightRef.current.add(post.id)

      const prev = { upvoted: !!post.upvoted, upvotes: post.upvotes ?? 0 }

      const nextCount = Math.max(0, prev.upvotes + (adding ? 1 : -1))
      syncPost({ ...post, upvoted: adding, upvotes: nextCount })

      runScaleAnim(post.id, adding)

      if (adding) {
        if (event?.nativeEvent?.pageX != null && event?.nativeEvent?.pageY != null) {
          setParticlePosition({
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          })
        }
        setParticlesVisible(true)
        setTimeout(() => setParticlesVisible(false), 1000)
      }

      const persist = async () => {
        try {
          const count = adding
            ? await upvoteCommunityPost(post.id)
            : await removeUpvoteCommunityPost(post.id)
          syncPost({ ...post, upvoted: adding, upvotes: count })
        } catch (e) {
          console.warn('[Community] upvote toggle failed:', e)
          syncPost({ ...post, upvoted: prev.upvoted, upvotes: prev.upvotes })
        } finally {
          upvoteInFlightRef.current.delete(post.id)
        }
      }

      setTimeout(persist, 0)
    },
    [runScaleAnim],
  )

  return {
    handleUpvoteToggle,
    getUpvoteScaleAnim,
    particlesVisible,
    particlePosition,
  }
}
