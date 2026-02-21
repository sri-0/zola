"use client"

// Feedback requires Supabase — disabled in this deployment
type FeedbackFormProps = {
  authUserId?: string
  onClose: () => void
}

export function FeedbackForm({ onClose: _onClose }: FeedbackFormProps) {
  return null
}
