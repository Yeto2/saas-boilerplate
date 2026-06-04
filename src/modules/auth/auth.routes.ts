import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { register, login } from './auth.service.js';
import { rotate, revoke } from './token.service.js';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).optional(),
});
const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const RefreshSchema = z.object({ refreshToken: z.string().min(1) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'validation_error', fields: parsed.error.flatten().fieldErrors });
    }
    const result = register(parsed.data);
    return reply.code(201).send(result);
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'validation_error', fields: parsed.error.flatten().fieldErrors });
    }
    return login(parsed.data.email, parsed.data.password);
  });

  app.post('/auth/refresh', async (req, reply) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'validation_error', fields: parsed.error.flatten().fieldErrors });
    }
    return rotate(parsed.data.refreshToken);
  });

  app.post('/auth/logout', async (req, reply) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'validation_error', fields: parsed.error.flatten().fieldErrors });
    }
    revoke(parsed.data.refreshToken);
    return reply.code(204).send();
  });
}
