import {
  calendarLookup,
  type CharacterCard,
  daysBetween,
  formatStoryDate,
  type LifeArea,
  LIFE_AREAS,
  type MemoryKind,
  type MemoryStatus,
  type NarrativeStyle,
  PROFILE_SOURCE_LABELS,
  type ProfileField,
  profileLabel,
  type StoryState,
} from '@cl/shared';

/** Conservative token estimate: one per CJK character, one per four other characters (SPEC §2.3). */
export function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef) ||
      code >= 0x20000
    ) {
      cjk++;
    }
  }
  const other = [...text].length - cjk;
  return cjk + Math.ceil(other / 4);
}

export interface ContextMemory {
  kind: MemoryKind;
  key: string;
  content: string;
  importance: number;
  status: MemoryStatus;
  sourceChapters: number[];
  firstChapter: number;
  lastChapter: number;
}

export interface ChapterDigest {
  number: number;
  title: string;
  summary: string;
  beatTags: string[];
  /** Story days since the previous chapter; null when unknown (written before prompt v4). */
  daysSincePrevious: number | null;
  /** Story-calendar start date; null for chapters written before prompt v5. */
  storyDate: string | null;
  /** Life areas, main one first; empty for chapters written before prompt v5. */
  lifeAreas: LifeArea[];
  /** Main life area as read by the consistency reviewer (prompt v6); null when unknown. */
  checkedArea: LifeArea | null;
}

export interface ContextData {
  chapterNumber: number;
  card: CharacterCard;
  /** AI-completed card fields frozen into the story ([推理]/[想象] marked); may be empty. */
  profile: ProfileField[];
  state: StoryState | null;
  direction: { text: string; chaptersActive: number } | null;
  memories: ContextMemory[];
  traitChanges: { chapterNumber: number; trait: string; from: string; to: string; explanation: string }[];
  arcSummaries: { fromChapter: number; toChapter: number; summary: string }[];
  previousChapter: { number: number; title: string; body: string } | null;
  /** Every earlier chapter, oldest first (no bodies). */
  chapterDigests: ChapterDigest[];
  /** Returns about `2 * radius` characters of the chapter body around `keyword`, or null. */
  excerpt: (chapterNumber: number, keyword: string, radius: number) => string | null;
}

export interface ContextSectionStat {
  id: string;
  tokens: number;
  trimmed: boolean;
}

export interface BuiltContext {
  user: string;
  sections: ContextSectionStat[];
  totalTokens: number;
  budgetTokens: number;
  includedMemoryKeys: string[];
  referencedChapters: number[];
  /** Set when the pacing section asks this chapter to change its main life area (SPEC §2.3 #14). */
  rotation: { avoid: LifeArea; suggest: LifeArea[] } | null;
}

const STYLE_TEXT: Record<NarrativeStyle, string> = {
  novel: '小说体。默认第三人称有限视角，贴近主角；如果角色卡的表达方式或开场情境要求第一人称，就用第一人称。',
  diary:
    '日记体：第一人称，每章是一篇（或同一天的几段）日记，以日期和天气开头；对话以回忆的方式出现，始终保持日记的私密口吻。',
  social:
    '小说正文中穿插 1–3 条角色发布的社交动态。每条动态单独成段，以「【动态】」开头，可以带配图描述、点赞数或评论区回复；动态的语气要和正文里的真实内心形成对照。',
};

const RECENT_SUMMARIES = 5;
const RECENT_BEATS = 15;
const RECENT_PEOPLE_WINDOW = 3;
const PREVIOUS_TAIL_CHARS = 1500;
const RELATED_LIMIT = 5;
const EXCERPT_LIMIT = 3;
const EXCERPT_RADIUS = 150;
const DORMANT_AFTER = 10;
const DORMANT_LIMIT = 2;
const STALE_AFTER = 12;
const STALE_LIMIT = 2;
const OPEN_THREAD_CAP = 10;
const FOCUS_WINDOW = 8;
const FOCUS_THRESHOLD = 6;
const TIME_WINDOW = 5;
const TIME_MIN_DAYS = 7;
const VOLUME_SIZE = 10;
const BIG_JUMP_DAYS = 14;
const AREA_WINDOW = 10;
const AREA_THRESHOLD = 5;
const AREA_SUGGESTIONS = 3;

function renderProfile(fields: ProfileField[]): string {
  const extra = fields.filter((f) => f.key !== 'name');
  if (!extra.length) return '';
  return `\n补全设定（[推理]/[想象] 是系统推断的细节；与角色卡原文或已发生的事实冲突时，以原文和事实为准）：\n${extra
    .map((f) => `- ${profileLabel(f.key)}${f.source === 'original' ? '' : `[${PROFILE_SOURCE_LABELS[f.source]}]`}：${f.value}`)
    .join('\n')}`;
}

function renderCard(card: CharacterCard, compact: boolean, profile: ProfileField[] = []): string {
  const lines: string[] = [`姓名：${card.name}`];
  if (card.age) lines.push(`年龄：${card.age}`);
  if (card.gender) lines.push(`性别：${card.gender}`);
  if (card.identity) lines.push(`身份：${card.identity}`);
  lines.push(`背景：${compact && card.background.length > 600 ? `${card.background.slice(0, 600)}…` : card.background}`);
  if (card.personality) lines.push(`性格：${card.personality}`);
  if (card.values?.length) lines.push(`核心价值观：${card.values.join('；')}`);
  if (card.speechStyle) lines.push(`表达方式：${card.speechStyle}`);
  if (card.world) lines.push(`世界与环境：${card.world}`);
  if (card.relationships?.length) {
    lines.push('人际关系：');
    for (const r of card.relationships) lines.push(`- ${r.name}（${r.relation}）${!compact && r.note ? `：${r.note}` : ''}`);
  }
  if (card.goals?.length) lines.push(`目标：${card.goals.join('；')}`);
  if (card.openingHint) lines.push(`开场情境（仅供第一章参考）：${card.openingHint}`);
  return `<<<角色卡开始>>>\n${lines.join('\n')}${compact ? '' : renderProfile(profile)}\n<<<角色卡结束>>>`;
}

const chapterList = (nums: number[]) => `第${nums.join('、')}章`;

function renderMemory(m: ContextMemory, compact: boolean): string {
  if (compact) return `- ${m.key}`;
  const label = { person: '人物', event: '事件', promise: '承诺', thread: '线索', trait: '特征' }[m.kind];
  return `- [${label}·重要度${m.importance}] ${m.key}：${m.content}（来源${chapterList(m.sourceChapters.slice(-4))}，最近提到第${m.lastChapter}章）`;
}

interface Selection {
  previousTrimmed: boolean;
  threadsCompact: boolean;
  traitsLimited: boolean;
  arcsLimited: boolean;
  cardCompact: boolean;
  people: ContextMemory[];
  events: ContextMemory[];
  related: ChapterDigest[];
  excerpts: { memory: ContextMemory; chapter: number; text: string }[];
  dormant: ContextMemory[];
}

interface Section {
  id: string;
  text: string;
  trimmed: boolean;
}

/** Assembles the user message within the token budget (SPEC §2.3). Pure: all data comes in through `data`. */
export function assembleContext(
  data: ContextData,
  opts: { budgetTokens: number; systemTokens: number },
): BuiltContext {
  const n = data.chapterNumber;
  const open = data.memories
    .filter((m) => m.status === 'open')
    .sort((a, b) => b.importance - a.importance || a.firstChapter - b.firstChapter);
  const people = data.memories.filter((m) => m.kind === 'person' && m.status !== 'resolved');
  const openText = open.map((m) => `${m.key} ${m.content}`).join('\n');
  const prevBody = data.previousChapter?.body ?? '';
  const mustPeople = people.filter(
    (p) => p.lastChapter >= n - RECENT_PEOPLE_WINDOW || openText.includes(p.key) || prevBody.includes(p.key),
  );
  const optionalPeople = people
    .filter((p) => !mustPeople.includes(p))
    .sort((a, b) => b.importance - a.importance || b.lastChapter - a.lastChapter);
  const events = data.memories
    .filter((m) => (m.kind === 'event' || m.kind === 'trait') && m.status !== 'resolved' && m.importance >= 2)
    .sort((a, b) => b.importance - a.importance || b.lastChapter - a.lastChapter);

  const recent = data.chapterDigests.slice(-RECENT_SUMMARIES);
  const beats = data.chapterDigests.slice(-RECENT_BEATS);
  const older = data.chapterDigests.slice(0, -RECENT_SUMMARIES);
  const focus = [JSON.stringify(data.state ?? {}), data.direction?.text ?? '', openText, prevBody].join('\n');
  const terms = [...people, ...open].map((m) => m.key).filter((k) => k.length >= 2 && focus.includes(k));
  const related = older
    .map((d) => ({ d, score: terms.filter((t) => d.summary.includes(t) || d.title.includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.d.number - a.d.number)
    .slice(0, RELATED_LIMIT)
    .map((x) => x.d);
  const excerptCandidates = open
    .filter((m) => m.importance >= 2)
    .flatMap((m) => {
      const chapter = m.sourceChapters[0] ?? m.firstChapter;
      const text = data.excerpt(chapter, m.key, EXCERPT_RADIUS);
      return text ? [{ memory: m, chapter, text }] : [];
    })
    .slice(0, EXCERPT_LIMIT);
  // Long-story pacing (SPEC §2.5): threads left hanging too long, too many open threads, one thread dominating.
  const stale = open
    .filter((m) => (m.importance >= 2 || m.kind === 'promise') && n - m.firstChapter >= STALE_AFTER)
    .sort((a, b) => a.firstChapter - b.firstChapter)
    .slice(0, STALE_LIMIT);
  const dominant = open
    .map((m) => ({ m, hits: m.sourceChapters.filter((c) => c >= n - FOCUS_WINDOW && c < n).length }))
    .sort((a, b) => b.hits - a.hits)[0];
  const recentDays = data.chapterDigests.slice(-TIME_WINDOW).map((d) => d.daysSincePrevious);
  const knownDays = recentDays.length === TIME_WINDOW && recentDays.every((d) => d !== null);
  const daysPassed = knownDays ? recentDays.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
  const slowTime = daysPassed !== null && daysPassed < TIME_MIN_DAYS;
  const newVolume = n > 1 && (n - 1) % VOLUME_SIZE === 0 && !recentDays.some((d) => (d ?? 0) >= BIG_JUMP_DAYS);
  // Life areas: the reader's direction takes priority, so the rotation hint is skipped while one is active.
  // The reviewer's reading wins over the writer's own label, which tends to be optimistic (prompt v6).
  const mainOf = (d: ChapterDigest) => d.checkedArea ?? d.lifeAreas[0] ?? null;
  const areaWindow = data.chapterDigests.slice(-AREA_WINDOW).filter((d) => mainOf(d));
  const mainCounts = new Map<LifeArea, number>();
  for (const d of areaWindow) mainCounts.set(mainOf(d)!, (mainCounts.get(mainOf(d)!) ?? 0) + 1);
  const [topArea, topCount] = [...mainCounts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const lastSeen = new Map<LifeArea, number>();
  for (const d of data.chapterDigests) for (const a of [...d.lifeAreas, ...(d.checkedArea ? [d.checkedArea] : [])]) lastSeen.set(a, d.number);
  const areaSuggestions = LIFE_AREAS.filter((a) => a !== topArea)
    .sort((a, b) => (lastSeen.get(a) ?? 0) - (lastSeen.get(b) ?? 0))
    .slice(0, AREA_SUGGESTIONS);
  const rotation = topArea && topCount >= AREA_THRESHOLD && !data.direction ? { avoid: topArea, suggest: areaSuggestions } : null;
  const pacingLines = [
    ...(slowTime
      ? [
          `最近 ${TIME_WINDOW} 章在故事里只过去了 ${daysPassed} 天。本章请从上一章之后 1–4 周开始：开头用一两句交代这段时间里的日常，让季节、天气和处境跟着变化。如果上一章停在一件必须马上处理的事上，先用几句话交代它的结果，再跳过去。`,
        ]
      : []),
    ...(!slowTime && newVolume
      ? ['新的一卷从本章开始：适合做一次较大的时间跳跃（两周到两个月），让季节或生活处境有明显变化。']
      : []),
    ...(rotation
      ? [
          `最近 ${areaWindow.length} 章里有 ${topCount} 章的主线是「${topArea}」。本章请把主线放在${areaSuggestions.map((a) => `「${a}」`).join('、')}中的一个上（这些方面最近很少写到）。「${topArea}」这条线最多作为背景带过一两句。`,
        ]
      : []),
    ...(open.length > OPEN_THREAD_CAP
      ? [`未解决的线索已有 ${open.length} 条：本章不要再开新的线索，优先推进或收束已有的。`]
      : []),
    ...(dominant && dominant.hits >= FOCUS_THRESHOLD
      ? [
          `最近 ${FOCUS_WINDOW} 章里有 ${dominant.hits} 章都围绕「${dominant.m.key}」。下一章请让生活的其他部分进来（工作、钱、朋友、家人、身体、季节变化、新认识的人），或者让这条线出现决定性的进展。`,
        ]
      : []),
  ];
  const previousDigest = data.chapterDigests.at(-1);
  const firstDated = data.chapterDigests.find((d) => d.storyDate);
  const calendarText =
    n === 1
      ? '这是第 1 章。请根据角色卡（季节、年代、开场情境）选一个开始日期填入 storyDate（YYYY-MM-DD；年份可以虚构，架空世界也用公历记录）。'
      : previousDigest?.storyDate && firstDated?.storyDate
        ? `上一章开始于 ${formatStoryDate(previousDigest.storyDate)}（故事第 ${daysBetween(firstDated.storyDate, previousDigest.storyDate) + 1} 天）。本章的 storyDate 不能早于它。\n下面是可能的开始日期和对应的星期，storyTime 或正文提到星期几时以此为准：${calendarLookup(previousDigest.storyDate).join('；')}`
        : '前面的章节没有记录日期。请为本章选一个与前情相符的日期填入 storyDate（YYYY-MM-DD），之后的章节会以它为起点。';
  const dormant = open
    .filter((m) => m.lastChapter <= n - 1 - DORMANT_AFTER)
    .sort((a, b) => a.lastChapter - b.lastChapter)
    .slice(0, DORMANT_LIMIT);

  const render = (sel: Selection): Section[] => {
    const out: Section[] = [];
    const add = (id: string, title: string, body: string, trimmed = false) =>
      out.push({ id, text: `【${title}】\n${body}`, trimmed });

    add('style', '叙述形式', STYLE_TEXT[data.card.narrativeStyle]);
    add('card', '角色卡', renderCard(data.card, sel.cardCompact, data.profile), sel.cardCompact);
    add(
      'state',
      '当前状态',
      data.state
        ? `时间：${data.state.time}\n地点：${data.state.location}\n正在经历：${data.state.situation}\n目标：${data.state.goals.join('；')}\n心情：${data.state.mood}`
        : '故事还没有开始。',
    );
    add(
      'direction',
      '故事走向',
      data.direction
        ? `<<<走向开始>>>\n${data.direction.text}\n<<<走向结束>>>\n已生效 ${data.direction.chaptersActive} 章${data.direction.chaptersActive === 0 ? '（从本章开始生效）' : ''}。请在本章用具体的行动、冲突或结果推进它，可以分几章逐步实现。`
        : '当前没有指定走向，按角色自身的生活逻辑发展。',
    );
    add('calendar', '故事日历', calendarText);
    if (open.length) {
      add(
        'open_threads',
        '未解决的承诺与线索（都要记得，不必每章都处理）',
        sel.threadsCompact
          ? `${open.map((m) => m.key).join('、')}`
          : open.map((m) => renderMemory(m, false)).join('\n'),
        sel.threadsCompact,
      );
    }
    if (stale.length) {
      add(
        'stale_threads',
        '需要收束的线索',
        `这些线索已经悬了很久：${stale.map((m) => `${m.key}（已悬 ${n - m.firstChapter} 章）`).join('；')}。请在本章或接下来两章内，至少给其中一条一个明确的结果（揭晓、解决、放弃，或转化成新的问题），不要再用“仍未确认”“仍未说出”拖延。`,
      );
    }
    if (pacingLines.length) add('pacing', '节奏提示', pacingLines.join('\n'));
    if (sel.dormant.length) {
      add(
        'dormant',
        '久未提及的线索',
        `可以考虑在合适的时机让它们重新出现：${sel.dormant.map((m) => `${m.key}（上次提到第${m.lastChapter}章）`).join('；')}`,
      );
    }
    if (sel.people.length) add('people', '人物', sel.people.map((m) => renderMemory(m, false)).join('\n'));
    if (sel.events.length) add('events', '重要事件与特征', sel.events.map((m) => renderMemory(m, false)).join('\n'));
    if (data.traitChanges.length) {
      const traits = sel.traitsLimited ? data.traitChanges.slice(-5) : data.traitChanges;
      add(
        'traits',
        '性格与状态的变化',
        traits.map((t) => `- 第${t.chapterNumber}章：${t.trait}从「${t.from}」到「${t.to}」，因为${t.explanation}`).join('\n'),
        sel.traitsLimited,
      );
    }
    const arcs = sel.arcsLimited ? data.arcSummaries.slice(-3) : data.arcSummaries;
    if (arcs.length) {
      add(
        'arcs',
        '前情：各卷摘要',
        `${sel.arcsLimited && data.arcSummaries.length > arcs.length ? '（更早的卷略）\n' : ''}${arcs.map((a) => `- 第${a.fromChapter}–${a.toChapter}章：${a.summary}`).join('\n')}`,
        sel.arcsLimited,
      );
    }
    if (sel.related.length) {
      add(
        'related_chapters',
        '前情：与当前相关的更早章节',
        [...sel.related].sort((a, b) => a.number - b.number).map((d) => `- 第${d.number}章《${d.title}》：${d.summary}`).join('\n'),
      );
    }
    if (recent.length) {
      add('recent_summaries', '前情：最近几章', recent.map((d) => `- 第${d.number}章《${d.title}》：${d.summary}`).join('\n'));
    }
    if (sel.excerpts.length) {
      add(
        'excerpts',
        '原文回查',
        sel.excerpts.map((e) => `- 关于「${e.memory.key}」，第${e.chapter}章原文：「${e.text}」`).join('\n'),
      );
    }
    if (beats.length) {
      add(
        'beats',
        '最近的桥段（不要重演同类情节）',
        beats.map((d) => `- 第${d.number}章《${d.title}》：${d.beatTags.join('、')}`).join('\n'),
      );
    }
    if (data.previousChapter) {
      const body = data.previousChapter.body;
      const text =
        sel.previousTrimmed && body.length > PREVIOUS_TAIL_CHARS ? `……${body.slice(-PREVIOUS_TAIL_CHARS)}` : body;
      add(
        'previous_chapter',
        '上一章原文',
        `第${data.previousChapter.number}章《${data.previousChapter.title}》\n${text}`,
        sel.previousTrimmed && body.length > PREVIOUS_TAIL_CHARS,
      );
    }
    add(
      'task',
      '任务',
      n === 1
        ? '请写第 1 章（开场章）：在一个具体场景里展示角色的生活与当前困境，自然地引出 2–3 个配角和 1–2 条之后可以展开的线索。'
        : `请写第 ${n} 章。承接上一章的结尾（时间可以推进，但要交代清楚），推进至少一条未解决的线索或故事走向，让本章有具体的冲突或变化，并写出它的后果。`,
    );
    return out;
  };

  const total = (sections: Section[]) =>
    opts.systemTokens + sections.reduce((acc, s) => acc + estimateTokens(s.text) + 1, 0);

  const sel: Selection = {
    previousTrimmed: false,
    threadsCompact: false,
    traitsLimited: false,
    arcsLimited: false,
    cardCompact: false,
    people: [...mustPeople],
    events: [],
    related: [],
    excerpts: [],
    dormant: [],
  };

  // Required sections first; compress them in a fixed order until they fit.
  const compressions: (keyof Selection)[] = ['previousTrimmed', 'threadsCompact', 'traitsLimited', 'arcsLimited', 'cardCompact'];
  for (const step of compressions) {
    if (total(render(sel)) <= opts.budgetTokens) break;
    (sel[step] as boolean) = true;
  }

  // Optional content in priority order, one item at a time while it fits.
  const tryAdd = <T>(list: T[], item: T) => {
    list.push(item);
    if (total(render(sel)) > opts.budgetTokens) list.pop();
  };
  for (const p of optionalPeople) tryAdd(sel.people, p);
  for (const e of events) tryAdd(sel.events, e);
  for (const d of related) tryAdd(sel.related, d);
  for (const x of excerptCandidates) tryAdd(sel.excerpts, x);
  for (const d of dormant) tryAdd(sel.dormant, d);

  const sections = render(sel);
  const included = new Set<string>([...open.map((m) => m.key), ...sel.people.map((m) => m.key), ...sel.events.map((m) => m.key)]);
  const referenced = new Set<number>([
    ...recent.map((d) => d.number),
    ...sel.related.map((d) => d.number),
    ...sel.excerpts.map((e) => e.chapter),
    ...(data.previousChapter ? [data.previousChapter.number] : []),
  ]);
  return {
    user: sections.map((s) => s.text).join('\n\n'),
    sections: sections.map((s) => ({ id: s.id, tokens: estimateTokens(s.text) + 1, trimmed: s.trimmed })),
    totalTokens: total(sections),
    budgetTokens: opts.budgetTokens,
    includedMemoryKeys: [...included],
    referencedChapters: [...referenced].sort((a, b) => a - b),
    rotation,
  };
}
