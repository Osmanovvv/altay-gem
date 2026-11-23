import { Fragment } from "react";
import { parseRichText, type RichInline } from "@/lib/rich-text";

export interface RichTextProps {
  text: string;
  className?: string;
  fontSize?: number;
  lineHeight?: number;
  color?: string;
  strongColor?: string;
}

function renderInlines(inlines: RichInline[], strongColor: string) {
  return inlines.map((node, idx) => {
    switch (node.kind) {
      case "text":
        return <Fragment key={idx}>{node.text}</Fragment>;
      case "bold":
        return (
          <strong key={idx} style={{ fontWeight: 600, color: strongColor }}>
            {node.text}
          </strong>
        );
      case "italic":
        return <em key={idx}>{node.text}</em>;
      case "underline":
        return <u key={idx}>{node.text}</u>;
      case "strike":
        return <s key={idx}>{node.text}</s>;
      case "link":
        return (
          <a
            key={idx}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "var(--color-accent-dark)" }}
          >
            {node.text}
          </a>
        );
    }
  });
}

function renderLines(lines: RichInline[][], strongColor: string) {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderInlines(line, strongColor)}
    </Fragment>
  ));
}

export function RichText({
  text,
  className,
  fontSize = 15,
  lineHeight = 1.6,
  color = "var(--color-text)",
  strongColor = "var(--color-bg-dark)",
}: RichTextProps) {
  const blocks = parseRichText(text);
  if (blocks.length === 0) return null;

  return (
    <div
      className={className ? `space-y-3 break-words ${className}` : "space-y-3 break-words"}
      style={{
        fontFamily: "var(--font-body)",
        fontSize,
        lineHeight,
        color,
      }}
    >
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case "heading": {
            const Tag = block.level <= 2 ? "h3" : "h4";
            return (
              <Tag
                key={idx}
                style={{
                  fontWeight: 600,
                  fontSize: block.level <= 2 ? fontSize + 3 : fontSize + 1,
                  lineHeight: 1.35,
                  color: strongColor,
                }}
              >
                {renderInlines(block.inlines, strongColor)}
              </Tag>
            );
          }
          case "paragraph":
            return <p key={idx}>{renderLines(block.lines, strongColor)}</p>;
          case "ul":
            return (
              <ul key={idx} className="list-disc space-y-1.5 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInlines(item, strongColor)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx} start={block.start} className="list-decimal space-y-1.5 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInlines(item, strongColor)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={idx}
                className="pl-3 italic"
                style={{ borderLeft: "2px solid var(--color-accent)" }}
              >
                {renderLines(block.lines, strongColor)}
              </blockquote>
            );
        }
      })}
    </div>
  );
}
