import { describe, expect, it } from "vitest";
import { MAX_ENCODED_TEXT, fitForLink, shareLink, waDigits, waLink } from "@/lib/domain/whatsapp-link";

describe("waDigits", () => {
  it("strips the plus from a valid international number", () => expect(waDigits("+923001234567")).toBe("923001234567"));
  it("refuses anything that isn't one, so a bad number never builds a link", () => {
    for (const bad of ["", "   ", null, undefined, "03001234567", "923001234567", "+92", "+92 300 1234567", "not a number"]) expect(waDigits(bad as string | null | undefined)).toBeNull();
  });
  it("trims stray spaces around a valid number", () => expect(waDigits("  +923001234567 ")).toBe("923001234567"));
});

describe("waLink", () => {
  it("opens the person's chat with the message encoded", () => {
    expect(waLink("+923001234567", "Hi Ali, quick check on “Cash up”?")).toBe(`https://wa.me/923001234567?text=${encodeURIComponent("Hi Ali, quick check on “Cash up”?")}`);
  });
  it("encodes characters that would break a URL", () => {
    const url = waLink("+923001234567", "a&b=c#d?e\nnew line 100%")!;
    expect(url).not.toMatch(/[ \n#]/);
    expect(new URL(url).searchParams.get("text")).toBe("a&b=c#d?e\nnew line 100%");
  });
  it("is null without a usable number", () => {
    expect(waLink(null, "hi")).toBeNull();
    expect(waLink("0300", "hi")).toBeNull();
  });
});

describe("fitForLink", () => {
  it("leaves a normal message alone", () => expect(fitForLink("  hello  ")).toBe("hello"));
  it("cuts a long one so the encoded link stays short, ending with an ellipsis", () => {
    const out = fitForLink("word ".repeat(2000));
    expect(encodeURIComponent(out).length).toBeLessThanOrEqual(MAX_ENCODED_TEXT);
    expect(out.endsWith("…")).toBe(true);
  });
  it("counts multi-byte text by its encoded size and never splits a character", () => {
    const out = fitForLink("گ".repeat(1500));
    expect(encodeURIComponent(out).length).toBeLessThanOrEqual(MAX_ENCODED_TEXT);
    expect([...out].every((c) => c === "گ" || c === "…")).toBe(true);
  });
});

describe("shareLink", () => {
  it("opens WhatsApp's chat chooser with the text ready", () => {
    expect(shareLink("Week summary")).toBe("https://wa.me/?text=Week%20summary");
  });
});
