import { beforeEach, describe, expect, it, vi } from "vitest"
import { smtpMailer } from "./mail"

// The real package opens a socket with `cloudflare:sockets`, which only the
// Workers runtime has. What matters here is what it is asked to do.
const send = vi.hoisted(() => vi.fn(async (_options: unknown, _email: unknown) => {}))
vi.mock("worker-mailer", () => ({
  WorkerMailer: { send },
  LogLevel: { ERROR: 3 },
}))

const GMAIL = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_USER: "leiragarden@gmail.com",
  SMTP_PASSWORD: "app-password",
} as Env

const MESSAGE = {
  to: "alice@example.com",
  subject: "Your account",
  text: "Plain words",
  html: "<p>Plain words</p>",
}

beforeEach(() => {
  send.mockClear()
})

describe("smtpMailer", () => {
  it.each([
    ["no password", { ...GMAIL, SMTP_PASSWORD: "" }],
    ["no host", { ...GMAIL, SMTP_HOST: "" }],
    ["no user to send as", { ...GMAIL, SMTP_USER: "" }],
    ["nothing at all", {}],
    ["a port that is not a number", { ...GMAIL, SMTP_PORT: "smtp" }],
  ])("is not there with %s, so nothing is sent", (_case, env) => {
    expect(smtpMailer(env as Env)).toBeNull()
  })

  it("sends over TLS from the first byte on port 465, as Gmail asks", async () => {
    await smtpMailer(GMAIL)?.send(MESSAGE)
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        credentials: { username: "leiragarden@gmail.com", password: "app-password" },
      }),
      {
        from: { name: "Leira", email: "leiragarden@gmail.com" },
        to: "alice@example.com",
        subject: "Your account",
        text: "Plain words",
        html: "<p>Plain words</p>",
      }
    )
  })

  it("uses port 465 when none is given", async () => {
    await smtpMailer({ ...GMAIL, SMTP_PORT: "" })?.send(MESSAGE)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
      expect.anything()
    )
  })

  // The local stack's Mailpit speaks plain SMTP and asks for no password.
  it("starts in plain text on any other port, moving to TLS when the server offers it", async () => {
    await smtpMailer({ ...GMAIL, SMTP_HOST: "127.0.0.1", SMTP_PORT: "54325" })?.send(MESSAGE)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ host: "127.0.0.1", port: 54325, secure: false, startTls: true }),
      expect.anything()
    )
  })

  it("passes a failure on to the caller", async () => {
    send.mockRejectedValueOnce(new Error("535 Username and Password not accepted"))
    await expect(smtpMailer(GMAIL)?.send(MESSAGE)).rejects.toThrow("535")
  })
})
