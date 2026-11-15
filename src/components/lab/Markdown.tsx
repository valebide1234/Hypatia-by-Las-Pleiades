import type { ReactNode } from "react";

/** Inline Markdown: **bold**, *italic* and [text](url). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={m.index} className="font-semibold text-white">{inline(m[1])}</strong>);
    else if (m[2] !== undefined) out.push(<em key={m.index}>{inline(m[2])}</em>);
    else
      out.push(
        <a key={m.index} href={m[4]} target="_blank" rel="noreferrer" className="text-pleiad-300 underline-offset-2 hover:underline">
          {m[3]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) => line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/**
 * Renders the small Markdown subset the Lab produces (headings, paragraphs, lists, quotes and
 * tables). Not a general Markdown renderer.
 */
export default function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (line.startsWith("# ")) blocks.push(<h2 key={i} className="font-display text-3xl leading-tight text-white">{inline(line.slice(2))}</h2>);
    else if (line.startsWith("## ")) blocks.push(<h3 key={i} className="mt-7 border-b border-white/10 pb-1.5 font-display text-2xl text-white">{inline(line.slice(3))}</h3>);
    else if (line.startsWith("> ")) blocks.push(<blockquote key={i} className="rounded-lg border-l-2 border-amber-300/60 bg-amber-300/[0.06] px-3 py-2 text-amber-50/90">{inline(line.slice(2))}</blockquote>);
    else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) items.push(lines[i++]!.slice(2));
      i--;
      blocks.push(
        <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-slate-500">
          {items.map((x, k) => (
            <li key={k}>{inline(x)}</li>
          ))}
        </ul>,
      );
    } else if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) rows.push(lines[i++]!);
      i--;
      const [head, , ...body] = rows;
      blocks.push(
        <div key={i} className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                {cells(head!).map((c, k) => (
                  <th key={k} scope="col" className="border-b border-white/15 py-1.5 pr-3 font-medium">{inline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k} className="border-b border-white/5">
                  {cells(r).map((c, j) => (
                    <td key={j} className={`py-1.5 pr-3 ${j === 0 ? "text-slate-100" : "tabular-nums"}`}>{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else blocks.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="space-y-3 text-sm leading-relaxed text-slate-300">{blocks}</div>;
}
