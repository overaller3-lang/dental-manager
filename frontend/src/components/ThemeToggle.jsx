import { useState, useRef, useEffect } from 'react'
import { useTema, FONTS } from '../context/ThemeContext'

const FONT_PREVIEW = {
  system:   'Aa - default sistema',
  inter:    'Aa - moderno pulito',
  jakarta:  'Aa - moderno geometrico',
  space:    'Aa - distintivo',
  atkinson: 'Aa - alta leggibilità',
  lexend:   'Aa - per dislessia',
  andika:   'Aa - per alfabetizzazione',
}

const FONT_FAMILY_INLINE = {
  system:   'system-ui, sans-serif',
  inter:    "'Inter', system-ui, sans-serif",
  jakarta:  "'Plus Jakarta Sans', system-ui, sans-serif",
  space:    "'Space Grotesk', system-ui, sans-serif",
  atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
  lexend:   "'Lexend', system-ui, sans-serif",
  andika:   "'Andika', system-ui, sans-serif",
}

export default function ThemeToggle() {
  const { altoContrasto, toggleTema, font, setFont } = useTema()
  const [aperto, setAperto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!aperto) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setAperto(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [aperto])

  const fontiPerGruppo = {
    moderno: FONTS.filter(f => f.gruppo === 'moderno'),
    accessibile: FONTS.filter(f => f.gruppo === 'accessibile'),
  }

  return (
    <div ref={ref} className="fixed bottom-5 right-5 z-[100]">
      {aperto && (
        <div
          role="dialog"
          aria-label="Impostazioni accessibilità"
          className={`absolute bottom-full right-0 mb-2 w-72 rounded-xl shadow-2xl border-2 p-3 ${
            altoContrasto ? 'bg-white border-black text-black' : 'bg-white border-gray-300 text-gray-900'
          }`}
        >
          {/* Toggle alto contrasto */}
          <label className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-gray-100">
            <span className="text-sm font-medium">Alto contrasto</span>
            <input
              type="checkbox"
              checked={altoContrasto}
              onChange={toggleTema}
              className="w-4 h-4 cursor-pointer"
            />
          </label>

          <hr className="my-2 border-gray-200" />

          <p className="px-2 text-xs font-semibold text-gray-500 uppercase mb-1">Font</p>

          <button
            onClick={() => setFont('system')}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm hover:bg-gray-100 ${
              font === 'system' ? 'bg-gray-100 font-semibold' : ''
            }`}
            style={{ fontFamily: FONT_FAMILY_INLINE.system }}
          >
            <span className="inline-block w-4">{font === 'system' ? '✓' : ''}</span>
            {FONT_PREVIEW.system}
          </button>

          <p className="px-2 mt-2 text-[10px] font-semibold text-gray-400 uppercase">Moderni</p>
          {fontiPerGruppo.moderno.map(f => (
            <button
              key={f.id}
              onClick={() => setFont(f.id)}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-sm hover:bg-gray-100 ${
                font === f.id ? 'bg-gray-100 font-semibold' : ''
              }`}
              style={{ fontFamily: FONT_FAMILY_INLINE[f.id] }}
            >
              <span className="inline-block w-4">{font === f.id ? '✓' : ''}</span>
              {f.label} <span className="text-xs text-gray-400 ml-1">— {FONT_PREVIEW[f.id].replace('Aa - ', '')}</span>
            </button>
          ))}

          <p className="px-2 mt-2 text-[10px] font-semibold text-gray-400 uppercase">Accessibili</p>
          {fontiPerGruppo.accessibile.map(f => (
            <button
              key={f.id}
              onClick={() => setFont(f.id)}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-sm hover:bg-gray-100 ${
                font === f.id ? 'bg-gray-100 font-semibold' : ''
              }`}
              style={{ fontFamily: FONT_FAMILY_INLINE[f.id] }}
            >
              <span className="inline-block w-4">{font === f.id ? '✓' : ''}</span>
              {f.label} <span className="text-xs text-gray-400 ml-1">— {FONT_PREVIEW[f.id].replace('Aa - ', '')}</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setAperto(v => !v)}
        aria-pressed={aperto}
        aria-label="Impostazioni accessibilità: alto contrasto e font"
        title="Impostazioni accessibilità"
        className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-base font-bold transition-all border-2
          ${altoContrasto
            ? 'bg-yellow-300 text-black border-black hover:bg-yellow-400'
            : 'bg-gray-800 text-white border-white hover:bg-gray-700'
          }`}
      >
        <span aria-hidden="true">{altoContrasto ? '◑' : '◐'}</span>
      </button>
    </div>
  )
}
