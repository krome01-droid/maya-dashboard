import { cronAutorise } from "@/lib/cron/auth"
import { getChiffres, getCentres, getSessionsOuvertes, getFormations } from "@/lib/supabase/queries"
import { envoyerEmail, isResendConfigured } from "@/lib/resend/client"

/**
 * Le brief quotidien : l'état réel de la plateforme, sans commentaire de modèle.
 *
 * Volontairement sans IA. Un brief est un relevé ; le faire rédiger ajouterait
 * un risque d'affirmation inventée à un document qu'Armel lit en diagonale le
 * matin — exactement le mauvais endroit pour ça. Les chiffres viennent de la
 * base, la mise en forme est du HTML.
 *
 * Ce que le brief signale, ce sont les blocages de communication : sans session
 * ouverte, MAYA ne peut inviter à réserver nulle part ; sans fiche complète,
 * elle ne peut pas mettre un centre en avant.
 */
export const maxDuration = 120

function echapper(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)
}

export async function GET(req: Request) {
  const refus = cronAutorise(req)
  if (refus) return refus

  try {
    const [chiffres, centres, sessions, formations] = await Promise.all([
      getChiffres(),
      getCentres(),
      getSessionsOuvertes(10),
      getFormations(),
    ])

    const incomplets = centres.filter((c) => !c.description || !c.image_url)
    const sansSlug = formations.filter((f) => !f.slug)

    const alertes: string[] = []
    if (chiffres.sessionsOuvertes === 0) {
      alertes.push(
        "Aucune session ouverte : la publication sociale n'a rien à promouvoir et se rabattra sur le blog.",
      )
    }
    if (chiffres.demandesRappel > 0) {
      alertes.push(`${chiffres.demandesRappel} demande(s) de rappel en attente.`)
    }
    if (chiffres.demandesB2B > 0) {
      alertes.push(`${chiffres.demandesB2B} demande(s) B2B en attente.`)
    }
    if (incomplets.length > 0) {
      alertes.push(
        `${incomplets.length} centre(s) sans photo ni description : ${incomplets
          .map((c) => c.name)
          .join(", ")}.`,
      )
    }
    if (sansSlug.length > 0) {
      alertes.push(
        `${sansSlug.length} formation(s) sans slug — sans page, donc non promouvables : ${sansSlug
          .map((f) => f.name)
          .join(", ")}.`,
      )
    }

    const date = new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1a1c1c">
  <div style="background:#050505;color:#fff;padding:20px 24px">
    <h1 style="margin:0;font-size:18px;letter-spacing:.05em">
      <span style="color:#f20d0d">INRI'S</span> MOTO — brief MAYA
    </h1>
    <p style="margin:4px 0 0;font-size:12px;color:#999">${echapper(date)}</p>
  </div>

  <table style="width:100%;border-collapse:collapse;margin:0">
    ${[
      ["Centres actifs", chiffres.centres],
      ["Formations au catalogue", chiffres.formations],
      ["Sessions ouvertes", chiffres.sessionsOuvertes],
      ["Articles publiés", chiffres.articles],
      ["Rappels en attente", chiffres.demandesRappel],
      ["Demandes B2B en attente", chiffres.demandesB2B],
    ]
      .map(
        ([l, v]) =>
          `<tr><td style="padding:10px 24px;border-bottom:1px solid #eee">${l}</td>` +
          `<td style="padding:10px 24px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${v}</td></tr>`,
      )
      .join("")}
  </table>

  ${
    alertes.length
      ? `<div style="padding:16px 24px;background:#fdf2f2;border-left:3px solid #f20d0d;margin:16px 24px">
           <p style="margin:0 0 8px;font-weight:bold;font-size:13px">À traiter</p>
           <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">
             ${alertes.map((a) => `<li>${echapper(a)}</li>`).join("")}
           </ul>
         </div>`
      : `<p style="padding:16px 24px;font-size:13px;color:#666">Rien à signaler.</p>`
  }

  ${
    sessions.length
      ? `<div style="padding:0 24px 16px">
           <p style="font-weight:bold;font-size:13px;margin:16px 0 8px">Prochaines sessions</p>
           <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">
             ${sessions
               .map(
                 (s) =>
                   `<li>${echapper(s.date)} — ${echapper(s.product?.name ?? "?")} · ${echapper(
                     s.center?.city ?? "?",
                   )}</li>`,
               )
               .join("")}
           </ul>
         </div>`
      : ""
  }

  <p style="padding:16px 24px;font-size:11px;color:#999;border-top:1px solid #eee">
    Relevé automatique de la base moto-ecole-inris.fr. Aucun texte n'est rédigé par un modèle.
  </p>
</div>`

    const resume = { chiffres, alertes, sessions: sessions.length }

    if (!isResendConfigured()) {
      // Pas de transporteur : on rend le brief plutôt que d'échouer. Le cron le
      // journalise, et l'information n'est pas perdue.
      return Response.json({ status: "ok", sent: false, reason: "Resend non configuré", ...resume })
    }

    const envoi = await envoyerEmail(`MAYA — brief du ${date}`, html)
    if (!envoi.ok) {
      return Response.json({ status: "error", error: envoi.error, ...resume }, { status: 502 })
    }

    return Response.json({ status: "ok", sent: true, email_id: envoi.id, ...resume })
  } catch (err) {
    console.error("[cron/daily-brief]", err instanceof Error ? err.message : err)
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur brief" },
      { status: 500 },
    )
  }
}
