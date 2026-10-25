import { type ImportIssue, issuesFromZod } from '@cl/shared';
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what}不存在`);

export function validationError(issues: ImportIssue[], message = '输入不符合要求'): HttpError {
  return new HttpError(400, 'VALIDATION', message, { issues });
}

/** Parses request input with a shared zod schema; throws a 400 with field issues on failure. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) throw validationError(issuesFromZod(parsed.error));
  return parsed.data;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ code: err.code, message: err.message, ...err.extra });
    }
    const fastifyErr = err as { code?: string; statusCode?: number; message: string };
    if (fastifyErr.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ code: 'PAYLOAD_TOO_LARGE', message: '内容太大（上限 64KB）' });
    }
    if (fastifyErr.statusCode && fastifyErr.statusCode >= 400 && fastifyErr.statusCode < 500) {
      return reply.code(fastifyErr.statusCode).send({ code: 'BAD_REQUEST', message: '请求格式不正确' });
    }
    req.log.error(err);
    return reply.code(500).send({ code: 'INTERNAL', message: '服务器内部错误' });
  });
}
