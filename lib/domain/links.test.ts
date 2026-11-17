import { describe, expect, it } from "vitest";
import { splitLinks } from "@/lib/domain/links";

describe("splitLinks", () => {
  it("leaves text without addresses alone", () => {
    expect(splitLinks("Open the shop at 9")).toEqual([{ text: "Open the shop at 9" }]);
    expect(splitLinks("")).toEqual([{ text: "" }]);
  });

  it("marks an address and keeps the words around it", () => {
    expect(splitLinks("Watch https://youtu.be/abc then count")).toEqual([{ text: "Watch " }, { text: "https://youtu.be/abc", href: "https://youtu.be/abc" }, { text: " then count" }]);
  });

  it("keeps sentence punctuation out of the link", () => {
    expect(splitLinks("Guide: https://x.com/a/b.")).toEqual([{ text: "Guide: " }, { text: "https://x.com/a/b", href: "https://x.com/a/b" }, { text: "." }]);
    expect(splitLinks("(see https://x.com/a)")).toEqual([{ text: "(see " }, { text: "https://x.com/a", href: "https://x.com/a" }, { text: ")" }]);
  });

  it("finds several, and ignores anything that is not http or https", () => {
    const parts = splitLinks("a http://one.pk b https://two.pk");
    expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual(["http://one.pk", "https://two.pk"]);
    expect(splitLinks("javascript:alert(1) and ftp://x.com")).toEqual([{ text: "javascript:alert(1) and ftp://x.com" }]);
  });

  it("does not turn a bare scheme into a link", () => {
    expect(splitLinks("https://")).toEqual([{ text: "https://" }]);
  });
});
