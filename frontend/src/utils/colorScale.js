// Scala colore configurabile per i contatori del calendario in dashboard.
// Persistenza in localStorage. Il default replica la vecchia logica rosso→verde 0..6.
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'dashboard.calendar-color-scale'
const EVENT = 'colorScaleChange'

export const DEFAULT_SCALE = {
  min: 0,
  max: 6,
  colorMin: '#dc2626',
  colorMax: '#16a34a',
  midVal: null,
  colorMid: null,
}

export function loadScale() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SCALE
    const v = JSON.parse(raw)
    return { ...DEFAULT_SCALE, ...v }
  } catch {
    return DEFAULT_SCALE
  }
}

export function saveScale(scale) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scale))
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useColorScale() {
  const [scale, setScale] = useState(loadScale)
  useEffect(() => {
    const refresh = () => setScale(loadScale())
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return scale
}

function hexToRgb(hex) {
  const v = (hex || '#000000').replace('#', '')
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  }
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function lerp(c1, c2, t) {
  return rgbToHex(
    c1.r + (c2.r - c1.r) * t,
    c1.g + (c2.g - c1.g) * t,
    c1.b + (c2.b - c1.b) * t,
  )
}

export function colorForValue(value, scale) {
  if (value == null || isNaN(value)) return '#d1d5db'
  const { min, max, colorMin, colorMax, midVal, colorMid } = scale
  if (value <= min) return colorMin
  if (value >= max) return colorMax
  const cMin = hexToRgb(colorMin)
  const cMax = hexToRgb(colorMax)
  if (midVal != null && colorMid && midVal > min && midVal < max) {
    const cMid = hexToRgb(colorMid)
    if (value <= midVal) {
      const t = (value - min) / (midVal - min)
      return lerp(cMin, cMid, t)
    }
    const t = (value - midVal) / (max - midVal)
    return lerp(cMid, cMax, t)
  }
  const t = (value - min) / (max - min)
  return lerp(cMin, cMax, t)
}
