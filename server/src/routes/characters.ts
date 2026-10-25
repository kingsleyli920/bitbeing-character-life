import {
  type CharacterDetail,
  importCharacterRequestSchema,
  type ImportCharacterResponse,
  openStoryRequestSchema,
  parseCardImport,
} from '@cl/shared';
import type { FastifyInstance } from 'fastify';
import { transaction } from '../db/open.js';
import type { AppDeps } from '../deps.js';
import { HttpError, notFound, parseInput, validationError } from '../http-errors.js';
import {
  deleteCharacter,
  getCharacter,
  insertImportedCharacter,
  listCharacters,
  toSummary,
} from '../repos/characters.js';
import { getActiveJobRow } from '../repos/jobs.js';
import { createStory, getStory, latestStoryId, listStorySummaries } from '../repos/stories.js';
import { getProfileState } from '../repos/profiles.js';
import type { ProfileService } from '../services/profile.js';
import { buildStoryDetail } from '../services/story-view.js';

type IdParams = { Params: { id: string } };

export function characterRoutes(app: FastifyInstance, { db, now }: AppDeps, profiles: ProfileService): void {
  app.get('/api/characters', async () => ({ characters: listCharacters(db) }));

  app.post('/api/characters/import', async (req, reply): Promise<ImportCharacterResponse> => {
    const input = parseInput(importCharacterRequestSchema, req.body);
    const result = parseCardImport(input);
    if (!result.ok) throw validationError(result.issues, '角色卡校验未通过');
    const record = insertImportedCharacter(db, result.card, now());
    profiles.start(record.id);
    reply.code(201);
    return { character: toSummary(record, null), warnings: result.warnings };
  });

  app.get<IdParams>('/api/characters/:id', async (req): Promise<CharacterDetail> => {
    const record = getCharacter(db, req.params.id);
    if (!record) throw notFound('角色');
    return { ...record, profile: getProfileState(db, record.id), stories: listStorySummaries(db, record.id) };
  });

  app.post<IdParams>('/api/characters/:id/profile', async (req, reply) => {
    const record = getCharacter(db, req.params.id);
    if (!record) throw notFound('角色');
    if (!profiles.start(record.id)) throw new HttpError(409, 'PROFILE_IN_PROGRESS', '正在补全设定，请稍候');
    reply.code(202);
    return getProfileState(db, record.id);
  });

  app.delete<IdParams>('/api/characters/:id', async (req, reply) => {
    const record = getCharacter(db, req.params.id);
    if (!record) throw notFound('角色');
    if (record.source === 'preset') throw new HttpError(403, 'FORBIDDEN', '预置角色不能删除');
    transaction(db, () => {
      const busy = listStorySummaries(db, record.id).some((s) => getActiveJobRow(db, s.id));
      if (busy) throw new HttpError(409, 'JOB_IN_PROGRESS', '这个角色的故事正在生成，请稍后再删除');
      deleteCharacter(db, record.id);
    });
    return reply.code(204).send();
  });

  app.post<IdParams>('/api/characters/:id/stories', async (req, reply) => {
    const { reuseLatest } = parseInput(openStoryRequestSchema, req.body);
    const record = getCharacter(db, req.params.id);
    if (!record) throw notFound('角色');
    const { story, created } = transaction(db, () => {
      const existing = reuseLatest ? latestStoryId(db, record.id) : undefined;
      if (existing) return { story: getStory(db, existing)!, created: false };
      return { story: createStory(db, record.id, record.card, now()), created: true };
    });
    reply.code(created ? 201 : 200);
    return buildStoryDetail(db, story);
  });
}
