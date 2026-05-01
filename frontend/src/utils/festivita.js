function calcolaEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function calcolaPasquetta(pasqua) {
  const [mm, dd] = pasqua.split('-').map(Number)
  const d = new Date(new Date().getFullYear(), mm - 1, dd + 1)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ANNO = new Date().getFullYear()
const PASQUA = calcolaEaster(ANNO)
const PASQUETTA = calcolaPasquetta(PASQUA)

export const FESTIVITA_BASE = [
  { data: '01-01', nome: 'Capodanno' },
  { data: '01-06', nome: 'Epifania' },
  { data: PASQUA, nome: `Pasqua ${ANNO}` },
  { data: PASQUETTA, nome: `Lunedì di Pasqua ${ANNO}` },
  { data: '04-25', nome: 'Festa della Liberazione' },
  { data: '05-01', nome: 'Festa dei Lavoratori' },
  { data: '06-02', nome: 'Festa della Repubblica' },
  { data: '08-15', nome: 'Ferragosto' },
  { data: '11-01', nome: 'Ognissanti' },
  { data: '12-08', nome: 'Immacolata Concezione' },
  { data: '12-25', nome: 'Natale' },
  { data: '12-26', nome: 'Santo Stefano' },
]
