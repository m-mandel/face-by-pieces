import { useEffect, useMemo, useState } from 'react'
import { renderLegacySvg } from './legacyPortraits'
import { getPortraitBounds } from './portraitBounds'

export default function PortraitArtwork({
  artwork,
  styleId,
  visibleIndices = null,
  className,
  label,
  fitToInk = false,
}) {
  const [measurement, setMeasurement] = useState(null)
  const bounds = measurement?.artwork === artwork ? measurement.bounds : null
  useEffect(() => {
    if (!fitToInk || styleId !== 'line-art') return undefined
    let active = true
    getPortraitBounds(artwork).then((nextBounds) => {
      if (active) setMeasurement({ artwork, bounds: nextBounds })
    })
    return () => {
      active = false
    }
  }, [artwork, fitToInk, styleId])

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

  // Keep the portrait area empty until its final framing is known. Showing the
  // full PNG canvas here would make the first clue jump when bounds arrive.
  if (fitToInk && measurement?.artwork !== artwork) {
    return (
      <div
        className={className}
        role="img"
        aria-label="Loading portrait"
        aria-busy="true"
      />
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
