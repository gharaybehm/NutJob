import { Fragment } from "react";

// Renders an answer's light formatting — "- " list lines and **bold** — as
// React elements. Model text is never treated as HTML: every piece is a text
// node, so nothing it writes can become markup or a link.

function inline(text: string, keyBase: string) {
  // **bold** only; anything unbalanced stays as written.
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={`${keyBase}-${i}`} className="font-semibold">{p.slice(2, -2)}</strong>
    ) : (
      <Fragment key={`${keyBase}-${i}`}>{p}</Fragment>
    )
  );
}

export default function AnswerText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="my-1.5 list-disc space-y-1 ps-5">
        {list.map((item, i) => <li key={i}>{inline(item, `${key}-${i}`)}</li>)}
      </ul>
    );
    list = [];
  };

  lines.forEach((line, i) => {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      return;
    }
    flushList(`ul-${i}`);
    if (line.trim().length === 0) return;
    // Markdown heading marks the model was told not to use are dropped.
    blocks.push(<p key={`p-${i}`} className="my-1.5 first:mt-0 last:mb-0">{inline(line.replace(/^#{1,6}\s+/, ""), `p-${i}`)}</p>);
  });
  flushList("ul-end");

  return <div className="break-words">{blocks}</div>;
}
