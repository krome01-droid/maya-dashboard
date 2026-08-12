/**
 * Envoi d'e-mail via Resend — le transporteur déjà utilisé par la marketplace.
 *
 * Appel HTTP direct plutôt que le SDK : un seul endpoint est nécessaire, et
 * cela évite une dépendance de plus dans l'image Docker.
 */
const API = "https://api.resend.com/emails"

export interface EnvoiResultat {
  ok: boolean
  id?: string
  error?: string
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.BRIEF_TO)
}

export async function envoyerEmail(
  sujet: string,
  html: string,
  destinataire?: string,
): Promise<EnvoiResultat> {
  const cle = process.env.RESEND_API_KEY
  const to = destinataire ?? process.env.BRIEF_TO
  const from = process.env.BRIEF_FROM ?? "MAYA <maya@moto-ecole-inris.fr>"

  if (!cle || !to) return { ok: false, error: "RESEND_API_KEY / BRIEF_TO absents" }

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: sujet, html }),
      signal: AbortSignal.timeout(20_000),
    })
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!res.ok) return { ok: false, error: body.message ?? `http_${res.status}` }
    return { ok: true, id: body.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "injoignable" }
  }
}
