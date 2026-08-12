"use client"

import { SessionProvider } from "next-auth/react"

// `basePath` doit inclure celui de l'app : NextAuth côté client construit ses
// URLs à la racine du domaine et taperait /api/auth/session, hors de /admin-maya.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath="/admin-maya/api/auth">{children}</SessionProvider>
}
