import type { ReactNode } from "react";

function safeHref(href: string): string {
  if (/^https?:\/\//.test(href) || /^(#|\/|\.\/|\.\.\/)/.test(href)) return href;
  return "#";
}

function inline(text: string, keyPrefix = "inline"): ReactNode[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
    .filter(Boolean)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{inline(part.slice(2, -2), `${key}-strong`)}</strong>;
      }
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        const href = safeHref(link[2]);
        const external = /^https?:\/\//.test(href);
        return (
          <a href={href} key={key} rel={external ? "noreferrer" : undefined} target={external ? "_blank" : undefined}>
            {link[1]}
          </a>
        );
      }
      return part;
    });
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDelimiter(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function headingParts(label: string): { id: string; label: string } {
  const explicit = /^(.*?)\s+\{#([a-z0-9-]+)\}$/.exec(label);
  const visibleLabel = explicit?.[1] ?? label;
  const fallbackId = visibleLabel
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "");
  return { id: explicit?.[2] ?? fallbackId, label: visibleLabel };
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index]?.trimEnd() ?? "";
  const next = lines[index + 1]?.trimEnd() ?? "";
  return (
    !line.trim() ||
    line.startsWith("```") ||
    /^(#{1,4})\s+/.test(line) ||
    /^(-{3,}|\*{3,})$/.test(line.trim()) ||
    line.trimStart().startsWith(">") ||
    line.trimStart().startsWith("- ") ||
    /^\s*\d+\.\s+/.test(line) ||
    (line.trimStart().startsWith("|") && isTableDelimiter(next))
  );
}

export function MarkdownArticle({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre key={`code-${index}`} data-language={language || undefined}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const parsed = headingParts(heading[2]);
      const content = inline(parsed.label, `heading-${index}`);
      if (level === 1) blocks.push(<h1 id={parsed.id} key={`h-${index}`}>{content}</h1>);
      if (level === 2) blocks.push(<h2 id={parsed.id} key={`h-${index}`}>{content}</h2>);
      if (level === 3) blocks.push(<h3 id={parsed.id} key={`h-${index}`}>{content}</h3>);
      if (level === 4) blocks.push(<h4 id={parsed.id} key={`h-${index}`}>{content}</h4>);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith(">")) {
        quote.push(lines[index].trimStart().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          <p>{inline(quote.join(" "), `quote-${index}`)}</p>
        </blockquote>,
      );
      continue;
    }

    if (line.trimStart().startsWith("|") && isTableDelimiter(lines[index + 1] ?? "")) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trimStart().startsWith("|")) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="markdown-table-wrap" key={`table-${index}`}>
          <table>
            <thead><tr>{headers.map((header, cell) => <th key={`${header}-${cell}`}>{inline(header, `th-${index}-${cell}`)}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${index}-${rowIndex}`}>
                  {headers.map((_, cell) => <td key={`cell-${index}-${rowIndex}-${cell}`}>{inline(row[cell] ?? "", `td-${index}-${rowIndex}-${cell}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.trimStart().startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith("- ")) {
        items.push(lines[index].trimStart().slice(2));
        index += 1;
      }
      blocks.push(
        <ul key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{inline(item, `ul-${index}-${itemIndex}`)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`ordered-${index}`}>
          {items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{inline(item, `ol-${index}-${itemIndex}`)}</li>)}
        </ol>,
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{inline(paragraph.join(" "), `p-${index}`)}</p>);
  }

  return <article className="markdown-article">{blocks}</article>;
}
