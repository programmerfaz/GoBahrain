import React from 'react'
import { Image } from 'expo-image'

const DEFAULT_CACHE = 'memory-disk'

const resizeModeToContentFit = (resizeMode) => {
  if (!resizeMode || resizeMode === 'cover') return 'cover'
  if (resizeMode === 'contain') return 'contain'
  if (resizeMode === 'stretch') return 'fill'
  if (resizeMode === 'center') return 'none'
  return 'cover'
}

/**
 * Remote and local images with disk + memory caching (expo-image).
 * Prefer this for avatars, plan thumbs, and any URI that repeats across screens.
 */
export const CachedImage = ({
  source,
  style,
  resizeMode,
  contentFit,
  cachePolicy = DEFAULT_CACHE,
  recyclingKey,
  transition = 0,
  ...rest
}) => {
  const uri = source && typeof source === 'object' && !Array.isArray(source) && source.uri ? source.uri : null
  const key = recyclingKey ?? uri ?? undefined
  const fit = contentFit ?? resizeModeToContentFit(resizeMode)
  return (
    <Image
      source={source}
      style={style}
      contentFit={fit}
      cachePolicy={cachePolicy}
      recyclingKey={key}
      transition={transition}
      {...rest}
    />
  )
}

/** Prefetch one or many HTTPS URLs into the same cache used by CachedImage */
export const prefetchImageUrls = (urls) => {
  const list = ([]).concat(urls == null ? [] : urls).filter(Boolean)
  if (list.length === 0) return Promise.resolve(true)
  return Image.prefetch(list, 'memory-disk')
}
