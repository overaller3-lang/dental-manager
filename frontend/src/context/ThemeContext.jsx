import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

// Mappa font → label e classe CSS applicata su <html>
export const FONTS = [
  { id: 'system',   label: 'Sistema (default)',          gruppo: 'default' },
  { id: 'inter',    label: 'Inter',                      gruppo: 'moderno' },
  { id: 'jakarta',  label: 'Plus Jakarta Sans',          gruppo: 'moderno' },
  { id: 'space',    label: 'Space Grotesk',              gruppo: 'moderno' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible',      gruppo: 'accessibile' },
  { id: 'lexend',   label: 'Lexend',                     gruppo: 'accessibile' },
  { id: 'andika',   label: 'Andika',                     gruppo: 'accessibile' },
]

const FONT_CLASSES = FONTS.map(f => `font-${f.id}`)

export function ThemeProvider({ children }) {
  const [altoContrasto, setAltoContrasto] = useState(
    () => localStorage.getItem('alto-contrasto') === 'true'
  )
  const [font, setFont] = useState(
    () => localStorage.getItem('font-app') || 'system'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('alto-contrasto', altoContrasto)
    localStorage.setItem('alto-contrasto', altoContrasto)
  }, [altoContrasto])

  useEffect(() => {
    const root = document.documentElement
    FONT_CLASSES.forEach(c => root.classList.remove(c))
    if (font && font !== 'system') root.classList.add(`font-${font}`)
    localStorage.setItem('font-app', font)
  }, [font])

  return (
    <ThemeContext.Provider value={{
      altoContrasto,
      toggleTema: () => setAltoContrasto(v => !v),
      font,
      setFont,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTema = () => useContext(ThemeContext)
