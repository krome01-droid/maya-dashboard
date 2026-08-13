"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { LogIn, AlertCircle, Eye, EyeOff, ExternalLink } from "lucide-react"

// Le mot de passe appartient à Supabase Auth, partagé avec la marketplace :
// le réinitialiser ici le réinitialiserait là-bas, et inversement. On renvoie
// donc au parcours du site plutôt que d'ouvrir sur ce dashboard un second
// point d'envoi d'e-mails accessible sans être connecté.
const URL_MOT_DE_PASSE_OUBLIE =
  "https://www.moto-ecole-inris.fr/mot-de-passe-oublie"

function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const searchParams = useSearchParams()
  const raw = searchParams.get("callbackUrl") ?? "/admin-maya"
  // `/signin` n'existe pas (simple redirection) : y renvoyer ferait boucler.
  const callbackUrl = raw.endsWith("/signin") ? "/admin-maya" : raw

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await signIn("credentials", {
      username,
      password,
      callbackUrl,
      redirect: false,
    })

    if (result?.error) {
      // Message unique : distinguer « compte inconnu » de « pas admin »
      // dirait à un tiers quels comptes existent.
      setError("Identifiants incorrects ou accès non autorisé.")
      setLoading(false)
    } else if (result?.url) {
      window.location.href = result.url
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-4">
            <h1 className="text-2xl font-black tracking-tight">
              <span className="text-primary italic">INRI&apos;S</span>
              <span className="italic"> MOTO</span>
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Agent MAYA
            </p>
          </div>
          <CardTitle className="text-lg">Connexion</CardTitle>
          <CardDescription>
            Compte administrateur de la marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Identifiant ou e-mail</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="password">Mot de passe</Label>
                <a
                  href={URL_MOT_DE_PASSE_OUBLIE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  Mot de passe oublié ?
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={
                    showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                  }
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || !username || !password}
            >
              <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
          {/* Le message d'erreur ne dit jamais laquelle des deux causes
              s'applique — le dire désignerait les comptes existants. Mais
              l'exigence, elle, peut être affichée en permanence : un compte
              valide sans le rôle `admin` est refusé exactement comme un mot de
              passe erroné, et rien ne le laissait deviner. */}
          <p className="mt-6 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            L&apos;accès est réservé aux comptes de la marketplace portant le
            rôle <span className="font-medium text-foreground">administrateur</span>.
            Un compte valide qui ne l&apos;a pas est refusé de la même manière
            qu&apos;un mot de passe erroné.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
