import { describe, expect, it } from "vitest"
import { deletionEmail } from "./deletionEmail"

const DELETE_ON = new Date("2026-12-17T10:00:00.000Z")
const GARDENS = "https://leira.test/gardens"

describe("deletionEmail", () => {
  it("tells, in English, when the account goes and how to keep it", () => {
    const email = deletionEmail({ language: "en", deleteOn: DELETE_ON, gardensUrl: GARDENS })
    expect(email.subject).toBe("Your Leira account will be deleted on 17 December 2026")
    expect(email.text).toContain("17 December 2026")
    expect(email.text).toContain(GARDENS)
    expect(email.text).toContain("there is nothing else to do")
    expect(email.text).toContain("leiragarden@gmail.com")
  })

  it("writes in European Portuguese when asked", () => {
    const email = deletionEmail({ language: "pt", deleteOn: DELETE_ON, gardensUrl: GARDENS })
    expect(email.subject).toBe("A tua conta do Leira vai ser apagada a 17 de dezembro de 2026")
    expect(email.text).toContain(GARDENS)
    expect(email.text).toContain("leiragarden@gmail.com")
  })

  // The Worker runs in UTC, and nearly everyone using the app is in Portugal.
  it("gives the date as it is in Portugal", () => {
    const lateInSummer = new Date("2027-06-30T23:30:00.000Z")
    const email = deletionEmail({ language: "en", deleteOn: lateInSummer, gardensUrl: GARDENS })
    expect(email.subject).toContain("1 July 2027")
  })

  it("says the same in HTML, with the address as a link", () => {
    const email = deletionEmail({ language: "en", deleteOn: DELETE_ON, gardensUrl: GARDENS })
    expect(email.html).toContain(`<a href="${GARDENS}">${GARDENS}</a>`)
    expect(email.html).toContain("17 December 2026")
    expect(email.html).toContain('lang="en"')
  })

  it("escapes what it puts in the HTML", () => {
    const email = deletionEmail({
      language: "en",
      deleteOn: DELETE_ON,
      gardensUrl: 'https://leira.test/gardens?a=1&b="2"',
    })
    expect(email.html).toContain('href="https://leira.test/gardens?a=1&amp;b=&quot;2&quot;"')
    expect(email.html).not.toContain('b="2"')
  })

  it("leaves no placeholder unfilled", () => {
    for (const language of ["en", "pt"] as const) {
      const email = deletionEmail({ language, deleteOn: DELETE_ON, gardensUrl: GARDENS })
      for (const part of [email.subject, email.text, email.html]) expect(part).not.toContain("{{")
    }
  })
})
