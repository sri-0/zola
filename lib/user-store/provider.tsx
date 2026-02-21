"use client"

import { LOCAL_USER } from "@/lib/user-store/api"
import type { UserProfile } from "@/lib/user/types"
import { createContext, useContext, useState } from "react"

type UserContextType = {
  user: UserProfile | null
  isLoading: boolean
  updateUser: (updates: Partial<UserProfile>) => Promise<void>
  refreshUser: () => Promise<void>
  signOut: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode
  initialUser: UserProfile | null
}) {
  const [user] = useState<UserProfile | null>(initialUser ?? LOCAL_USER)

  const refreshUser = async () => {}
  const updateUser = async (_updates: Partial<UserProfile>) => {}
  const signOut = async () => {}

  return (
    <UserContext.Provider
      value={{ user, isLoading: false, updateUser, refreshUser, signOut }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider")
  }
  return context
}
