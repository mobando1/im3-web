import { useState, useEffect } from "react";

type TocItem = { id: string; text: string; level: number };

export function TableOfContents({ content }: { content: string }) {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    // Parse headings from rendered content
    const el = document.querySelector("[data-blog-content]");
    if (!el) return;

    const h2h3 = el.querySelectorAll("h2, h3");
    const items: TocItem[] = [];
    h2h3.forEach((heading, i) => {
      const id = heading.id || `heading-${i}`;
      if (!heading.id) heading.id = id;
      items.push({
        id,
        text: heading.textContent || "",
        level: heading.tagName === "H2" ? 2 : 3,
      });
    });
    setHeadings(items);
  }, [content]);

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find(e => e.isIntersecting);
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );

    headings.forEach(h => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav className="sticky top-24">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contenido</p>
      <ul className="space-y-1.5 border-l-2 border-gray-100 dark:border-gray-800">
        {headings.map(h => (
          <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`block py-1 pl-3 text-sm border-l-2 -ml-[2px] transition-colors ${
                activeId === h.id
                  ? "border-[#2FA4A9] text-[#2FA4A9] font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
