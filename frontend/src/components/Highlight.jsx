export default function Highlight({ text, query }) {
  if (!query || !text) return <>{text ?? ''}</>
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-yellow-200 text-inherit not-italic rounded-sm px-0">{part}</mark>
          : part
      )}
    </>
  )
}
