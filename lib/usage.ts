// Usage limits are removed — all requests pass through in local mode

export async function checkUsage(_supabase: null, _userId: string) {
  return null
}

export async function incrementUsage(_supabase: null, _userId: string) {}

export async function checkUsageByModel(
  _supabase: null,
  _userId: string,
  _model: string,
  _isAuthenticated: boolean
) {}
