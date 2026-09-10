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
  roundId = null,
  requestId = null,
  onLoadStateChange,
}) {
  const [preparation, setPreparation] = useState(null)
  const [displayedFrame, setDisplayedFrame] = useState(null)
  const currentPreparation =
    preparation?.artwork === artwork &&
    preparation.roundId === roundId &&
    preparation.visibleIndices === visibleIndices &&
    preparation.requestId === requestId
      ? preparation
      : null
  const frame =
    displayedFrame?.artwork === artwork && displayedFrame.roundId === roundId
      ? displayedFrame
      : null
  const bounds = frame?.bounds
  const failed = currentPreparation?.status === 'error'
  const loading = fitToInk && currentPreparation?.status !== 'ready' && !failed
  useEffect(() => {
    if (!fitToInk || styleId !== 'line-art') return undefined
    let active = true
    const layers = artwork.layers.filter(
      (_layer, index) =>
        visibleIndices === null || visibleIndices.includes(index),
    )
    const finish = (status, bounds = null) => {
      if (!active) return
      const state = {
        artwork,
        visibleIndices,
        roundId,
        requestId,
        status,
        bounds,
      }
      setPreparation(state)
      if (status === 'ready') {
        setDisplayedFrame((previous) => {
          const continuing =
            previous?.artwork === artwork && previous.roundId === roundId
          const nextIndices =
            visibleIndices ?? artwork.layers.map((_layer, index) => index)
          const previousIndices = continuing
            ? (previous.visibleIndices ??
              artwork.layers.map((_layer, index) => index))
            : []
          // Fade only additions to a retained drawing. Shuffled clue sets swap
          // together at full opacity so there is never a fade through white.
          const additive =
            previousIndices.length > 0 &&
            previousIndices.every((index) => nextIndices.includes(index))
          return {
            ...state,
            label,
            entering: additive
              ? nextIndices.filter((index) => !previousIndices.includes(index))
              : [],
          }
        })
      }
      onLoadStateChange?.(state)
    }
    Promise.all([getPortraitBounds(artwork), loadPortraitLayers(layers)])
      .then(([bounds]) => finish('ready', bounds))
      .catch(() => finish('error'))
    return () => {
      active = false
    }
  }, [
    artwork,
    fitToInk,
    styleId,
    visibleIndices,
    roundId,
    requestId,
    label,
    onLoadStateChange,
  ])

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

  // The first frame waits for loading. Later requests retain the last complete
  // frame, including its SVG/image nodes, until their replacement is decoded.
  if (fitToInk && !frame) {
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

  const shownIndices = fitToInk ? frame.visibleIndices : visibleIndices
  const shownLabel = fitToInk ? frame.label : label
  const loadError = fitToInk && failed && (
    <p className="portrait-load-error" role="alert">
      Couldn’t load the drawing. Please try again.
    </p>
  )

  if (fitToInk && bounds) {
    return (
      <div
        className={className}
        role="img"
        aria-label={shownLabel}
        aria-busy={loading}
      >
        <svg
          className="png-layer-viewport"
          viewBox={bounds.viewBox.join(' ')}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          {artwork.layers.map((layer, index) =>
            shownIndices === null || shownIndices.includes(index) ? (
              <image
                key={layer.id}
                className={
                  frame.entering.includes(index)
                    ? 'png-layer-entering'
                    : undefined
                }
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
        {loadError}
      </div>
    )
  }

  return (
    <div
      className={className}
      role="img"
      aria-label={shownLabel}
      aria-busy={loading}
    >
      <div className="png-layers">
        {artwork.layers.map((layer, index) =>
          shownIndices === null || shownIndices.includes(index) ? (
            <img
              key={layer.id}
              className={
                fitToInk && frame.entering.includes(index)
                  ? 'png-layer-entering'
                  : undefined
              }
              src={layer.src}
              data-layer={layer.id}
              alt=""
              draggable={false}
            />
          ) : null,
        )}
      </div>
      {loadError}
    </div>
  )
}
