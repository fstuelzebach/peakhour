import { useEffect, type ReactNode } from 'react'

export function Sheet({ open, onClose, children }: { open: boolean; onClose?: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {children}
      </div>
    </div>
  )
}
