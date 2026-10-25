import { type Chapter, type CharacterCard, NARRATIVE_STYLE_LABELS } from '@cl/shared';

/** The whole story as Markdown: title, a short card, then every chapter in order. */
export function storyToMarkdown(card: CharacterCard, chapters: Chapter[], exportedAt: string): string {
  const lines = [
    `# ${card.name}的故事`,
    '',
    `> ${[card.age, card.gender, card.identity].filter(Boolean).join(' · ')}${card.identity || card.age ? '　' : ''}${NARRATIVE_STYLE_LABELS[card.narrativeStyle]}`,
    `> ${card.background.replaceAll('\n', ' ')}`,
    '',
    `共 ${chapters.length} 章 · 导出于 ${exportedAt.slice(0, 10)} · 由「角色人生」生成`,
    '',
  ];
  for (const c of chapters) {
    lines.push(`## 第${c.number}章 ${c.title}`, '', `*${c.storyTime} · ${c.location}*`, '', c.body.trim(), '');
    if (c.direction) {
      lines.push(`> 本章走向：${c.direction.text}${c.directionHandling ? `——${c.directionHandling.how}` : ''}`, '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
