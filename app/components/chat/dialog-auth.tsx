"use client"

// Auth dialog disabled — Supabase auth not used in this deployment
type DialogAuthProps = {
  open: boolean
  setOpen: (open: boolean) => void
}

export function DialogAuth({ open: _open, setOpen: _setOpen }: DialogAuthProps) {
  return null
}
