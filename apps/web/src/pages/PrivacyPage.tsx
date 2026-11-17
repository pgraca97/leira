import { Link } from "@tanstack/react-router"
import { type ReactNode, useEffect } from "react"
import { Trans, useTranslation } from "react-i18next"
import { AppHeader } from "../components/AppHeader"

const CONTACT = "leiragarden@gmail.com"

/** The privacy policies of the services that handle the visitor's data. */
const POLICIES = {
  supabase: "https://supabase.com/privacy",
  cloudflare: "https://www.cloudflare.com/privacypolicy/",
  google: "https://policies.google.com/privacy",
  openWeather: "https://openweather.co.uk/privacy-policy",
  openMeteo: "https://open-meteo.com/en/terms",
  // Cloudflare asks sites that use Turnstile to link to it.
  turnstile: "https://www.cloudflare.com/turnstile-privacy-policy/",
  // The Portuguese data protection authority's page for complaints.
  cnpd: "https://www.cnpd.pt/cidadaos/participacoes/",
} as const

const linkClass = "font-medium text-emerald-800 underline hover:text-emerald-900"

/** A link to another site. `Trans` fills in its words from the translation. */
function ExternalLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a className={linkClass} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

function EmailLink({ children }: { children?: ReactNode }) {
  return (
    <a className={linkClass} href={`mailto:${CONTACT}`}>
      {children}
    </a>
  )
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-stone-900">{heading}</h2>
      {children}
    </section>
  )
}

/**
 * What is kept about a visitor, who else handles it, for how long and what
 * they can do about it. It sits outside the session route, so reading it does
 * not make the reader a guest. Every claim here was checked against the
 * services' own documentation on the date the page gives: change the date
 * with the words.
 */
export function PrivacyPage() {
  const { t } = useTranslation()

  useEffect(() => {
    document.title = t("privacy.title")
  }, [t])

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      {/* The scrolling box is the full width, so its scroll bar sits at the window's edge. */}
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-prose flex-col gap-6 px-4 py-6 text-sm leading-relaxed text-stone-700">
          <header className="flex flex-col gap-2">
            <Link to="/" className={`${linkClass} self-start`}>
              {t("garden.back")}
            </Link>
            <h1 className="text-2xl font-semibold text-stone-900">{t("privacy.title")}</h1>
            <p className="text-stone-500">{t("privacy.updated")}</p>
            <p>{t("privacy.intro")}</p>
          </header>

          <Section heading={t("privacy.who.heading")}>
            <p>
              <Trans i18nKey="privacy.who.body" components={{ email: <EmailLink /> }} />
            </p>
          </Section>

          <Section heading={t("privacy.kept.heading")}>
            <p>{t("privacy.kept.intro")}</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>{t("privacy.kept.gardens")}</li>
              <li>{t("privacy.kept.location")}</li>
              <li>{t("privacy.kept.account")}</li>
              <li>{t("privacy.kept.visits")}</li>
              <li>{t("privacy.kept.sessions")}</li>
              <li>{t("privacy.kept.logs")}</li>
            </ul>
            <p>{t("privacy.kept.optional")}</p>
          </Section>

          <Section heading={t("privacy.browser.heading")}>
            <p>{t("privacy.browser.storage")}</p>
            <p>
              <Trans
                i18nKey="privacy.browser.turnstile"
                components={{ policy: <ExternalLink href={POLICIES.turnstile} /> }}
              />
            </p>
            <p>{t("privacy.browser.analytics")}</p>
          </Section>

          <Section heading={t("privacy.others.heading")}>
            <p>{t("privacy.others.intro")}</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>
                <Trans
                  i18nKey="privacy.others.supabase"
                  components={{ policy: <ExternalLink href={POLICIES.supabase} /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="privacy.others.cloudflare"
                  components={{ policy: <ExternalLink href={POLICIES.cloudflare} /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="privacy.others.google"
                  components={{ policy: <ExternalLink href={POLICIES.google} /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="privacy.others.weather"
                  components={{
                    openweather: <ExternalLink href={POLICIES.openWeather} />,
                    openmeteo: <ExternalLink href={POLICIES.openMeteo} />,
                  }}
                />
              </li>
            </ul>
            <p>{t("privacy.others.transfers")}</p>
          </Section>

          <Section heading={t("privacy.shared.heading")}>
            <p>{t("privacy.shared.body")}</p>
          </Section>

          <Section heading={t("privacy.retention.heading")}>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>{t("privacy.retention.account")}</li>
              <li>{t("privacy.retention.guests")}</li>
              <li>{t("privacy.retention.logs")}</li>
              <li>{t("privacy.retention.backups")}</li>
            </ul>
          </Section>

          <Section heading={t("privacy.basis.heading")}>
            <p>{t("privacy.basis.body")}</p>
          </Section>

          <Section heading={t("privacy.rights.heading")}>
            <p>
              <Trans
                i18nKey="privacy.rights.body"
                components={{ email: <EmailLink />, cnpd: <ExternalLink href={POLICIES.cnpd} /> }}
              />
            </p>
          </Section>

          <Section heading={t("privacy.changes.heading")}>
            <p>{t("privacy.changes.body")}</p>
          </Section>
        </main>
      </div>
    </div>
  )
}
