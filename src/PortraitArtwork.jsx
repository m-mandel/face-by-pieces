import { useEffect, useMemo, useState } from 'react'
import { renderLegacySvg } from './legacyPortraits'
import { getPortraitBounds } from './portraitBounds'
import { loadPortraitLayers } from './portraitLoading'

export default function PortraitArtwork({
  artwork,
  styleId,
  visibleIndices = null,
  className,
  label,
  fitToInk = false,
  requestId = null,
  onLoadStateChange,
}) {
  const [preparation, setPreparation] = useState(null)
  const currentPreparation =
    preparation?.artwork === artwork &&
    preparation.visibleIndices === visibleIndices &&
    preparation.requestId === requestId
      ? preparation
      : null
  const bounds = currentPreparation?.bounds
  useEffect(() => {
    if (!fitToInk || styleId !== 'line-art') return undefined
    let active = true
    const layers = artwork.layers.filter(
      (_layer, index) =>
        visibleIndices === null || visibleIndices.includes(index),
    )
    const finish = (status, bounds = null) => {
      if (!active) return
      const state = { artwork, visibleIndices, requestId, status, bounds }
      setPreparation(state)
      onLoadStateChange?.(state)
    }
    Promise.all([getPortraitBounds(artwork), loadPortraitLayers(layers)])
      .then(([bounds]) => finish('ready', bounds))
      .catch(() => finish('error'))
    return () => {
      active = false
    }
  }, [artwork, fitToInk, styleId, visibleIndices, requestId, onLoadStateChange])

  const svg = useMemo(
    () =>
      styleId === 'line-art'
        ? null
        : renderLegacySvg(artwork, visibleIndices, styleId),
    [artwork, styleId, visibleIndices],
  )

  if (styleId !== 'line-art') {
    return (
      <div
        className={className}
        role="img"
        aria-label={label}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  // Show the drawing only when its framing and selected layers are ready.
  if (fitToInk && currentPreparation?.status !== 'ready') {
    const failed = currentPreparation?.status === 'error'
    return (
      <div
        className={className}
        role="img"
        aria-label={failed ? 'Drawing could not be loaded' : 'Loading portrait'}
        aria-busy={!failed}
      >
        {failed && (
          <p className="portrait-load-error" role="alert">
            Couldn’t load the drawing. Please try again.
          </p>
        )}
      </div>
    )
  }

  if (fitToInk && bounds) {
    return (
      <div className={className} role="img" aria-label={label}>
        <svg
          className="png-layer-viewport"
          viewBox={bounds.viewBox.join(' ')}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          {artwork.layers.map((layer, index) =>
            visibleIndices === null || visibleIndices.includes(index) ? (
              <image
                key={layer.id}
                href={layer.src}
                data-layer={layer.id}
                x="0"
                y="0"
                width={bounds.width}
                height={bounds.height}
              />
            ) : null,
          )}
        </svg>
      </div>
    )
  }

  return (
    <div className={className} role="img" aria-label={label}>
      <div className="png-layers">
        {artwork.layers.map((layer, index) =>
          visibleIndices === null || visibleIndices.includes(index) ? (
            <img
              key={layer.id}
              src={layer.src}
              data-layer={layer.id}
              alt=""
              draggable={false}
            />
          ) : null,
        )}
      </div>
    </div>
  )
}
