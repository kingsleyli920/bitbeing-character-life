import type { Chapter } from '@cl/shared';

const POST_PREFIX = '【动态】';

function Paragraph({ text }: { text: string }) {
  if (text.startsWith(POST_PREFIX)) {
    return (
      <div className="post" role="note" aria-label="社交动态">
        <span className="post-label">动态</span>
        <p>{text.slice(POST_PREFIX.length).trim()}</p>
      </div>
    );
  }
  return <p>{text}</p>;
}

export function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n|\n(?=【动态】)/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function ChapterView({ chapter }: { chapter: Chapter }) {
  const headingId = `chapter-${chapter.number}-title`;
  return (
    <article className="chapter" id={`chapter-${chapter.number}`} aria-labelledby={headingId} data-testid="chapter">
      <p className="chapter-no">第 {chapter.number} 章</p>
      <h2 className="chapter-title" id={headingId}>
        {chapter.title}
      </h2>
      <p className="chapter-meta">
        {chapter.storyTime} · {chapter.location}
      </p>
      <div className="chapter-body">
        {splitParagraphs(chapter.body).map((p, i) => (
          <Paragraph key={i} text={p} />
        ))}
      </div>
      {chapter.direction && (
        <details className="chapter-direction">
          <summary>本章走向：{chapter.direction.text}</summary>
          {chapter.directionHandling && (
            <>
              <p>{chapter.directionHandling.how}</p>
              {chapter.directionHandling.adjustments && <p>与设定的调和：{chapter.directionHandling.adjustments}</p>}
            </>
          )}
        </details>
      )}
    </article>
  );
}
