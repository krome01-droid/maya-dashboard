import type { Metadata } from "next"
import { Space_Grotesk, Lexend } from "next/font/google"
import { AuthProvider } from "@/providers/auth-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

// Les polices de la charte INRI'S Moto : Space Grotesk pour les titres,
// Lexend pour le corps. Mêmes familles que la marketplace, pour que le
// back-office et le site public ne donnent pas l'impression de deux marques.
const spaceGrotesk = Space_Grotesk({ variable: "--font-display", subsets: ["latin"] })
const lexend = Lexend({ variable: "--font-sans", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "MAYA — Moto-Écoles INRI'S",
  description: "Dashboard Communication & Content Manager",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${spaceGrotesk.variable} ${lexend.variable} h-full`}>
      <body className="h-full bg-background text-foreground antialiased">
        <AuthProvider>
          <TooltipProvider delay={300}>{children}</TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
