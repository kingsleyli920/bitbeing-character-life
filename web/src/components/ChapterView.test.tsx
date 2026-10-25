import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeChapter } from '../test/fixtures';
import { ChapterView, splitParagraphs } from './ChapterView';

describe('ChapterView', () => {
  it('splits paragraphs on blank lines and before social posts', () => {
    expect(splitParagraphs('第一段\n\n第二段\n【动态】加班第三天\n\n  \n结尾')).toEqual(['第一段', '第二段', '【动态】加班第三天', '结尾']);
  });

  it('renders social posts as notes and shows how the direction was handled', () => {
    render(
      <ChapterView
        chapter={makeChapter(3, {
          body: '她盯着屏幕。\n\n【动态】家人们谁懂，众筹页改到第五版了',
          direction: { id: 'd1', text: '让她遇到一次挫折' },
          directionHandling: { applied: true, how: '众筹页被 CEO 全部推翻', adjustments: null },
        })}
      />,
    );
    expect(screen.getByRole('note', { name: '社交动态' })).toHaveTextContent('家人们谁懂，众筹页改到第五版了');
    expect(screen.getByText('本段走向：让她遇到一次挫折')).toBeInTheDocument();
    expect(screen.getByText('众筹页被 CEO 全部推翻')).toBeInTheDocument();
  });

  it('shows the story date with its weekday when the chapter has one', () => {
    const { rerender } = render(<ChapterView chapter={makeChapter(4, { storyDate: '2026-06-13', storyTime: '傍晚', location: '上海' })} />);
    expect(screen.getByText('2026年6月13日 星期六 · 傍晚 · 上海')).toBeInTheDocument();
    rerender(<ChapterView chapter={makeChapter(4, { storyDate: null, storyTime: '梅雨季的傍晚', location: '上海' })} />);
    expect(screen.getByText('梅雨季的傍晚 · 上海')).toBeInTheDocument();
  });
});
