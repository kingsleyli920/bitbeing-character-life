import { type CharacterCard, NARRATIVE_STYLE_LABELS } from '@cl/shared';

export function CharacterPanel({ card }: { card: CharacterCard }) {
  const meta = [card.age, card.gender, card.identity].filter(Boolean).join(' · ');
  return (
    <section className="panel character-panel" aria-labelledby="character-name">
      <p className="panel-kicker">{NARRATIVE_STYLE_LABELS[card.narrativeStyle]}</p>
      <h2 id="character-name" className="character-name">
        {card.name}
      </h2>
      {meta && <p className="character-meta">{meta}</p>}
      <p className="character-background">{card.background}</p>
      <details className="fold">
        <summary>更多设定</summary>
        <dl className="card-fields">
          {card.personality && (
            <>
              <dt>性格</dt>
              <dd>{card.personality}</dd>
            </>
          )}
          {card.values?.length ? (
            <>
              <dt>价值观</dt>
              <dd>{card.values.join('；')}</dd>
            </>
          ) : null}
          {card.speechStyle && (
            <>
              <dt>表达方式</dt>
              <dd>{card.speechStyle}</dd>
            </>
          )}
          {card.world && (
            <>
              <dt>环境</dt>
              <dd>{card.world}</dd>
            </>
          )}
          {card.relationships?.length ? (
            <>
              <dt>人际关系</dt>
              <dd>
                <ul className="plain-list">
                  {card.relationships.map((r) => (
                    <li key={r.name}>
                      <strong>{r.name}</strong>（{r.relation}）{r.note ? `：${r.note}` : ''}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}
          {card.goals?.length ? (
            <>
              <dt>目标</dt>
              <dd>{card.goals.join('；')}</dd>
            </>
          ) : null}
        </dl>
      </details>
    </section>
  );
}
