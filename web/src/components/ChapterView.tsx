import { type Chapter, formatStoryDate } from '@cl/shared';

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

/** One 生活故事序列 box. */
export function ChapterView({ chapter }: { chapter: Chapter }) {
  const headingId = `chapter-${chapter.number}-title`;
  return (
    <article className="segment" id={`chapter-${chapter.number}`} aria-labelledby={headingId} data-testid="chapter">
      <header className="segment-head">
        <span className="segment-no">生活故事序列 {chapter.number}</span>
        <h3 className="segment-title" id={headingId}>
          {chapter.title}
        </h3>
        <span className="segment-meta">
          {chapter.storyDate && `${formatStoryDate(chapter.storyDate)} · `}
          {chapter.storyTime} · {chapter.location}
        </span>
      </header>
      <div className="segment-body">
        {splitParagraphs(chapter.body).map((p, i) => (
          <Paragraph key={i} text={p} />
        ))}
      </div>
      {chapter.direction && (
        <details className="segment-direction">
          <summary>本段走向：{chapter.direction.text}</summary>
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
