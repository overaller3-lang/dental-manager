import { useState, useRef } from 'react'

export function useColOrder(tableKey, defaultKeys) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`col-order-${tableKey}`) || 'null')
      if (Array.isArray(saved)) {
        const valid = saved.filter(k => defaultKeys.includes(k))
        const added = defaultKeys.filter(k => !saved.includes(k))
        return [...valid, ...added]
      }
    } catch {}
    return defaultKeys
  })

  const dragSrc = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  const headerProps = (key) => ({
    draggable: true,
    title: 'Trascina per riordinare',
    style: dragOver === key ? { outline: '2px solid #3b82f6', outlineOffset: '-2px' } : undefined,
    onDragStart: (e) => {
      dragSrc.current = key
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: (e) => {
      e.preventDefault()
      setDragOver(key)
    },
    onDragLeave: () => setDragOver(null),
    onDrop: (e) => {
      e.preventDefault()
      setDragOver(null)
      if (!dragSrc.current || dragSrc.current === key) return
      const fi = order.indexOf(dragSrc.current)
      const ti = order.indexOf(key)
      if (fi === -1 || ti === -1) return
      const next = [...order]
      next.splice(fi, 1)
      next.splice(ti, 0, dragSrc.current)
      setOrder(next)
      localStorage.setItem(`col-order-${tableKey}`, JSON.stringify(next))
    },
    onDragEnd: () => { dragSrc.current = null; setDragOver(null) }
  })

  return { order, headerProps }
}
