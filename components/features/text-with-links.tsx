import { splitLinks } from "@/lib/domain/links";

/** Text with its web addresses made clickable. They open in a new tab and never run anything but a normal page load. */
export function TextWithLinks({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {splitLinks(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-brand-text underline underline-offset-2 hover:no-underline">
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}
