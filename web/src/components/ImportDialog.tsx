import { type ImportCharacterRequest, type ImportIssue, parseCardImport } from '@cl/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../api/client';
import { Modal } from './Modal';
import { errorText } from './QueryState';

type Format = ImportCharacterRequest['format'];

const TABS: { id: Format; label: string }[] = [
  { id: 'text', label: '粘贴描述' },
  { id: 'json', label: '自定义 JSON' },
  { id: 'tavern', label: '酒馆卡 JSON' },
];

const FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  description: '描述',
  background: '背景',
  personality: '性格',
  values: '价值观',
  speechStyle: '表达方式',
  age: '年龄',
  gender: '性别',
  identity: '身份',
  world: '世界设定',
  relationships: '人际关系',
  goals: '目标',
  narrativeStyle: '叙述形式',
  openingHint: '开场情境',
};

export function fieldLabel(path: string): string {
  if (!path) return '整体';
  const [head, ...rest] = path.split('.');
  return [FIELD_LABELS[head!] ?? head, ...rest.map((p) => (/^\d+$/.test(p) ? `第 ${Number(p) + 1} 条` : (FIELD_LABELS[p] ?? p)))].join(' · ');
}

export const JSON_EXAMPLE = JSON.stringify(
  {
    name: '许多多',
    age: '35 岁',
    identity: '重庆的公交车司机',
    background: '在重庆开了十年 461 路公交，线路要穿过嘉陵江大桥。离婚后一个人带着读小学的儿子，晚上在社区夜校学画画。',
    personality: '热心、爱操心，嘴上不饶人，心里很软。',
    values: ['准点是对乘客的承诺', '孩子比面子重要'],
    speechStyle: '重庆话，说话快，爱开玩笑。',
    relationships: [{ name: '许小树', relation: '儿子', note: '九岁，喜欢恐龙' }],
    goals: ['让儿子考上想去的初中', '在夜校结业展上展出一幅画'],
    narrativeStyle: 'novel',
  },
  null,
  2,
);

export const TAVERN_EXAMPLE = JSON.stringify(
  {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: '阿泽',
      description: '{{char}}是广州的自由写作者，三十出头，毒舌但有趣，常把日常吐槽发给{{user}}。收入不稳定，但够用。',
      personality: '毒舌、敏感、嘴硬心软',
      scenario: '广州老城区，骑楼下的糖水铺',
      first_mes: '“你又来了？”{{char}}抬头看了{{user}}一眼，把笔记本合上。',
    },
  },
  null,
  2,
);

const TEXT_EXAMPLE = {
  name: '程雨',
  description: '二十六岁，在大理开了一家只有六个座位的咖啡馆。之前在北京做了三年广告，辞职那天把工牌留在了地铁站。她怕热闹又怕孤单，正在学着和来来往往的客人相处。',
};

function IssueList({ issues }: { issues: ImportIssue[] }) {
  return (
    <ul className="issue-list" role="alert" aria-label="校验问题">
      {issues.map((i, k) => (
        <li key={k}>
          <strong>{fieldLabel(i.path)}</strong>：{i.message}
        </li>
      ))}
    </ul>
  );
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<Format>('text');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState<Record<'json' | 'tavern', string>>({ json: '', tavern: '' });
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [done, setDone] = useState<{ id: string; name: string; warnings: string[] } | null>(null);

  const request = (): ImportCharacterRequest =>
    format === 'text' ? { format, name, description } : { format, content: content[format] };

  const submit = useMutation({
    mutationFn: () => api.importCharacter(request()),
    onSuccess: ({ character, warnings }) => {
      void queryClient.invalidateQueries({ queryKey: ['characters'] });
      if (warnings.length === 0) {
        onClose();
        navigate(`/characters/${character.id}`);
      } else {
        setDone({ id: character.id, name: character.name, warnings });
      }
    },
    onError: (err) => {
      const body = err instanceof ApiError ? (err.body as { issues?: ImportIssue[] } | undefined) : undefined;
      if (body?.issues) setIssues(body.issues);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const local = parseCardImport(request());
    if (!local.ok) {
      setIssues(local.issues);
      return;
    }
    setIssues([]);
    submit.mutate();
  };

  const issueFor = (path: string) => issues.find((i) => i.path === path)?.message;

  if (done) {
    return (
      <Modal title="导入成功" onClose={onClose}>
        <p>已导入「{done.name}」。导入时有以下提示：</p>
        <ul className="warning-list">
          {done.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <div className="modal-actions">
          <span className="header-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            留在书架
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              navigate(`/characters/${done.id}`);
            }}
          >
            开始阅读
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="导入角色" onClose={onClose}>
      <div className="tabs" role="tablist" aria-label="导入格式">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={format === t.id}
            className={`tab ${format === t.id ? 'tab-active' : ''}`}
            onClick={() => {
              setFormat(t.id);
              setIssues([]);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <form className="import-form" onSubmit={onSubmit} noValidate>
        {format === 'text' ? (
          <>
            <label className="field-label" htmlFor="import-name">
              姓名
            </label>
            <input id="import-name" type="text" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(issueFor('name'))} />
            {issueFor('name') && <span className="field-error">{issueFor('name')}</span>}
            <label className="field-label" htmlFor="import-description">
              角色描述（20–2000 字：身份、经历、性格、正在面对的事）
            </label>
            <textarea
              id="import-description"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={Boolean(issueFor('description'))}
            />
            {issueFor('description') && <span className="field-error">{issueFor('description')}</span>}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setName(TEXT_EXAMPLE.name);
                setDescription(TEXT_EXAMPLE.description);
              }}
            >
              填入示例
            </button>
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="import-content">
              {format === 'json'
                ? '粘贴角色卡 JSON。必填 name、background、personality；可选 age、identity、values、speechStyle、relationships、goals、narrativeStyle（novel / diary / social）等。'
                : '粘贴 SillyTavern 角色卡的 JSON（V1，或 spec 为 chara_card_v2 / v3）。目前不支持 PNG 图片卡。'}
            </label>
            <textarea
              id="import-content"
              className="mono"
              rows={12}
              value={content[format]}
              onChange={(e) => setContent((c) => ({ ...c, [format]: e.target.value }))}
              aria-invalid={issues.length > 0}
              spellCheck={false}
            />
            <button
              type="button"
              className="link-btn"
              onClick={() => setContent((c) => ({ ...c, [format]: format === 'json' ? JSON_EXAMPLE : TAVERN_EXAMPLE }))}
            >
              填入示例
            </button>
            {issues.length > 0 && <IssueList issues={issues} />}
          </>
        )}
        {submit.isError && !(submit.error instanceof ApiError && submit.error.code === 'VALIDATION') && (
          <p className="field-error" role="alert">
            {errorText(submit.error)}
          </p>
        )}
        <div className="modal-actions">
          <span className="header-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={submit.isPending}>
            {submit.isPending ? '导入中…' : '导入'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
