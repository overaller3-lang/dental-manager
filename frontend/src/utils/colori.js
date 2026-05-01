// Mappa ruolo → classi badge (sfondo + testo + bordo).
// Ogni ruolo ha un colore distinto per essere riconoscibile a colpo d'occhio.
export const RUOLO_BADGE = {
  admin:           'bg-red-100 text-red-700 border border-red-300',
  titolare:        'bg-purple-100 text-purple-700 border border-purple-300',
  dir_sanitario:   'bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-300',
  dentista:        'bg-blue-100 text-blue-700 border border-blue-300',
  igienista:       'bg-cyan-100 text-cyan-700 border border-cyan-300',
  ortodontista:    'bg-indigo-100 text-indigo-700 border border-indigo-300',
  endodontista:    'bg-violet-100 text-violet-700 border border-violet-300',
  parodontologo:   'bg-pink-100 text-pink-700 border border-pink-300',
  medico_estetico: 'bg-rose-100 text-rose-700 border border-rose-300',
  protesista:      'bg-teal-100 text-teal-700 border border-teal-300',
  aso:             'bg-emerald-100 text-emerald-700 border border-emerald-300',
  segreteria:      'bg-green-100 text-green-700 border border-green-300',
  segretario:      'bg-green-100 text-green-700 border border-green-300',
}

const RUOLO_DEFAULT = 'bg-gray-100 text-gray-700 border border-gray-300'

export function classeRuolo(ruolo) {
  return RUOLO_BADGE[ruolo] || RUOLO_DEFAULT
}

// Tavolozza usata per il fallback dell'avatar utente
// (quando l'utente non ha ancora scelto un colore_avatar).
export const PALETTE_AVATAR = [
  '#2563eb', '#16a34a', '#dc2626', '#ea580c', '#9333ea',
  '#0891b2', '#65a30d', '#db2777', '#0284c7', '#7c3aed',
  '#be185d', '#0d9488',
]

// Hash deterministico stringa → colore della palette.
export function colorePerStringa(s) {
  if (!s) return PALETTE_AVATAR[0]
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i)
    hash |= 0
  }
  return PALETTE_AVATAR[Math.abs(hash) % PALETTE_AVATAR.length]
}

export function coloreAvatar(utente) {
  return utente?.colore_avatar || colorePerStringa(`${utente?.cognome || ''}${utente?.nome || ''}${utente?.id ?? ''}`)
}

// ── Badge per i campi enum del dominio ────────────────────────────────────────
// Ogni enum ha un colore distinto per ciascun valore, in modo che a colpo
// d'occhio l'operatore riconosca lo stato di un appuntamento, di un piano,
// di un documento. Le classi seguono la palette Tailwind con bg/testo/bordo.

const BADGE_DEFAULT = 'bg-gray-100 text-gray-700 border border-gray-300'

export const TIPO_APPUNTAMENTO_BADGE = {
  prima_visita: 'bg-purple-100 text-purple-700 border border-purple-300',
  visita:       'bg-blue-100 text-blue-700 border border-blue-300',
  igiene:       'bg-emerald-100 text-emerald-700 border border-emerald-300',
  intervento:   'bg-orange-100 text-orange-700 border border-orange-300',
  urgenza:      'bg-red-100 text-red-700 border border-red-300',
  controllo:    'bg-cyan-100 text-cyan-700 border border-cyan-300',
}

export const STATO_APPUNTAMENTO_BADGE = {
  prenotato:      'bg-blue-100 text-blue-700 border border-blue-300',
  confermato:     'bg-indigo-100 text-indigo-700 border border-indigo-300',
  in_corso:       'bg-yellow-100 text-yellow-700 border border-yellow-300',
  completato:     'bg-green-100 text-green-700 border border-green-300',
  annullato:      'bg-red-100 text-red-700 border border-red-300',
  non_presentato: 'bg-orange-100 text-orange-700 border border-orange-300',
  rinviato:       'bg-amber-100 text-amber-700 border border-amber-300',
}

export const STATO_PIANO_CURA_BADGE = {
  proposto:    'bg-blue-100 text-blue-700 border border-blue-300',
  accettato:   'bg-cyan-100 text-cyan-700 border border-cyan-300',
  in_corso:    'bg-yellow-100 text-yellow-700 border border-yellow-300',
  completato:  'bg-green-100 text-green-700 border border-green-300',
  sospeso:     'bg-amber-100 text-amber-700 border border-amber-300',
  abbandonato: 'bg-gray-200 text-gray-700 border border-gray-400',
}

export const STATO_PREVENTIVO_BADGE = {
  bozza:     'bg-gray-100 text-gray-700 border border-gray-300',
  inviato:   'bg-blue-100 text-blue-700 border border-blue-300',
  accettato: 'bg-green-100 text-green-700 border border-green-300',
  rifiutato: 'bg-red-100 text-red-700 border border-red-300',
  scaduto:   'bg-amber-100 text-amber-700 border border-amber-300',
}

export const STATO_ORDINE_BADGE = {
  bozza:      'bg-gray-100 text-gray-700 border border-gray-300',
  confermato: 'bg-blue-100 text-blue-700 border border-blue-300',
  fatturato:  'bg-green-100 text-green-700 border border-green-300',
  annullato:  'bg-red-100 text-red-700 border border-red-300',
}

export const STATO_PAGAMENTO_BADGE = {
  in_attesa:  'bg-amber-100 text-amber-700 border border-amber-300',
  completato: 'bg-green-100 text-green-700 border border-green-300',
  fallito:    'bg-red-100 text-red-700 border border-red-300',
  rimborsato: 'bg-purple-100 text-purple-700 border border-purple-300',
}

export const METODO_PAGAMENTO_BADGE = {
  contanti:      'bg-emerald-100 text-emerald-700 border border-emerald-300',
  carta_credito: 'bg-blue-100 text-blue-700 border border-blue-300',
  carta_debito:  'bg-cyan-100 text-cyan-700 border border-cyan-300',
  bonifico:      'bg-indigo-100 text-indigo-700 border border-indigo-300',
  assegno:       'bg-purple-100 text-purple-700 border border-purple-300',
}

export const TIPO_DOCUMENTO_FISCALE_BADGE = {
  fattura:               'bg-blue-100 text-blue-700 border border-blue-300',
  ricevuta:              'bg-green-100 text-green-700 border border-green-300',
  documento_commerciale: 'bg-orange-100 text-orange-700 border border-orange-300',
}

// Helper unico per ottenere la classe a partire dal nome dell'enum + valore.
const MAPPE = {
  tipo_appuntamento:      TIPO_APPUNTAMENTO_BADGE,
  stato_appuntamento:     STATO_APPUNTAMENTO_BADGE,
  stato_piano_cura:       STATO_PIANO_CURA_BADGE,
  stato_preventivo:       STATO_PREVENTIVO_BADGE,
  stato_ordine:           STATO_ORDINE_BADGE,
  stato_pagamento:        STATO_PAGAMENTO_BADGE,
  metodo_pagamento:       METODO_PAGAMENTO_BADGE,
  tipo_documento_fiscale: TIPO_DOCUMENTO_FISCALE_BADGE,
}

export function classeEnum(tipo, valore) {
  if (!valore) return BADGE_DEFAULT
  const mappa = MAPPE[tipo]
  return (mappa && mappa[valore]) || BADGE_DEFAULT
}

// Etichette leggibili (sostituisce snake_case con spazi e capitalizza la prima)
export function labelEnum(valore) {
  if (!valore) return ''
  return valore.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}
