import {
  type CharacterCard,
  type ProfileField,
  PROFILE_SOURCE_LABELS,
  type ProfileState,
  profileLabel,
} from '@cl/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { errorText } from './QueryState';

function Row({ label, children, source, reason }: { label: string; children: React.ReactNode; source?: ProfileField['source']; reason?: string }) {
  return (
    <li className="info-row">
      <span className="info-label">{label}：</span>
      <span className="info-value">
        {children}
        {source && source !== 'original' && (
          <span className={`source-tag source-${source}`} title={reason || undefined}>
            [{PROFILE_SOURCE_LABELS[source]}]
          </span>
        )}
      </span>
    </li>
  );
}

function ProfileStatusRow({ characterId, state, frozen }: { characterId: string; state: ProfileState; frozen: boolean }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.completeProfile(characterId),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['story'] }),
  });
  if (state.status === 'pending' || retry.isPending) {
    return (
      <p className="profile-status" role="status">
        <span className="spinner" aria-hidden="true" /> 正在根据角色卡补全设定…
      </p>
    );
  }
  if (frozen) return null;
  if (state.status === 'failed' || state.status === 'none' || state.error) {
    return (
      <div className="profile-status profile-status-warn">
        <span>{state.status === 'none' ? '还没有补全设定。' : `补全设定失败：${state.error ?? '未知原因'}`}</span>
        <button type="button" className="link-btn" onClick={() => retry.mutate()}>
          {state.status === 'none' ? '补全设定' : '重新补全'}
        </button>
        {retry.isError && <span className="field-error">{errorText(retry.error)}</span>}
      </div>
    );
  }
  return null;
}

/** The left panel body: profile fields (with [推理]/[想象] marks) followed by the card's own text. */
export function CharacterInfo({
  characterId,
  card,
  profile,
  profileFrozen,
}: {
  characterId: string;
  card: CharacterCard;
  profile: ProfileState;
  profileFrozen: boolean;
}) {
  const fields = profile.profile?.fields ?? [];
  const has = (key: string) => fields.some((f) => f.key === key);
  return (
    <>
      <ProfileStatusRow characterId={characterId} state={profile} frozen={profileFrozen} />
      <ul className="info-list" aria-label={`${card.name}的角色卡`}>
        {fields.map((f) => (
          <Row key={f.key} label={profileLabel(f.key)} source={f.source} reason={f.reason}>
            {f.value}
          </Row>
        ))}
        {!has('name') && <Row label="名字">{card.name}</Row>}
        {!has('age') && card.age && <Row label="年龄">{card.age}</Row>}
        {!has('gender') && card.gender && <Row label="性别">{card.gender}</Row>}
        {!has('occupation') && card.identity && <Row label="身份">{card.identity}</Row>}
        <Row label="背景">{card.background}</Row>
        {card.personality && <Row label="性格">{card.personality}</Row>}
        {card.values?.length ? <Row label="核心价值观">{card.values.join('；')}</Row> : null}
        {card.speechStyle && !has('speech') && <Row label="表达方式">{card.speechStyle}</Row>}
        {card.world && <Row label="世界与环境">{card.world}</Row>}
        {card.relationships?.length ? (
          <Row label="人际关系">
            <ul className="info-sublist">
              {card.relationships.map((r) => (
                <li key={r.name}>
                  {r.name}（{r.relation}）{r.note ? `：${r.note}` : ''}
                </li>
              ))}
            </ul>
          </Row>
        ) : null}
        {card.goals?.length ? <Row label="目标">{card.goals.join('；')}</Row> : null}
      </ul>
      {fields.length > 0 && (
        <p className="muted small info-note">
          [推理] 根据角色卡推断，[想象] 为补充的细节，鼠标悬停可看依据。{profileFrozen ? '这个故事开始时的设定已固定。' : '开始故事时会固定下来。'}
        </p>
      )}
    </>
  );
}
