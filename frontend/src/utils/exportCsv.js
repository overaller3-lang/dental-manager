// Utility minimale per esportare array di oggetti in CSV (UTF-8 + BOM)
// così Excel apre correttamente accenti e simboli.
//
// columns: [{ key, label, format? }]
// format(value, row) → string  (opzionale)
function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function exportToCsv(filename, columns, rows) {
  const header = columns.map(c => escapeCell(c.label)).join(',')
  const body = rows.map(row =>
    columns.map(c => {
      const raw = c.key.split('.').reduce((acc, k) => acc?.[k], row)
      const formatted = c.format ? c.format(raw, row) : raw
      return escapeCell(formatted)
    }).join(',')
  )
  const csv = '﻿' + [header, ...body].join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
