import { LogLevel, WorkerMailer } from "worker-mailer"

/** One email, in plain text and in HTML for the clients that show it. */
export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  /** Resolves once the server has taken the message. Throws when it does not. */
  send(message: MailMessage): Promise<void>
}

/** The name the app's emails come from. The address is the account that sends them. */
const SENDER_NAME = "Leira"

/** Gmail's port for SMTP over TLS from the first byte. */
const IMPLICIT_TLS_PORT = 465

/**
 * The SMTP server is slow at worst for a few seconds. The person waiting on
 * the answer should not wait for the package's default minute.
 */
const TIMEOUT_MS = 10_000

/**
 * Sends through the SMTP server in the `SMTP_*` settings, or null when they
 * are incomplete, so a Worker without them sends nothing and says so.
 *
 * Port 465 is TLS from the start, as Gmail asks. Any other port starts in
 * plain text and moves to TLS if the server offers it: the local stack's
 * Mailpit offers neither TLS nor a login, and takes the mail as it is.
 */
export function smtpMailer(env: Env): Mailer | null {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: password } = env
  if (!host || !user || !password) return null
  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : IMPLICIT_TLS_PORT
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null

  const secure = port === IMPLICIT_TLS_PORT
  return {
    async send(message) {
      await WorkerMailer.send(
        {
          host,
          port,
          secure,
          startTls: !secure,
          credentials: { username: user, password },
          authType: ["plain", "login"],
          socketTimeoutMs: TIMEOUT_MS,
          responseTimeoutMs: TIMEOUT_MS,
          // Its lower levels log every exchange with the server, the login included.
          logLevel: LogLevel.ERROR,
        },
        {
          from: { name: SENDER_NAME, email: user },
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }
      )
    },
  }
}
