import { db } from '@/db';
import { agents, meetings } from '@/db/schema';
import { auth } from '@/lib/auth';
import { polarClient } from '@/lib/polar';
import { MAX_FREE_AGENTS, MAX_FREE_MEETINGS } from '@/modules/premium/constants';
import { shouldThrowError } from '@tanstack/react-query';
import { initTRPC, TRPCError } from '@trpc/server';
import { count, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { cache } from 'react';
export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return { userId: 'user_123' };
});
// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  // transformer: superjson,
});
// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({
      headers: await headers(),
    });
  
  if (!session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: "User is not authorized" });
  }

  return next({ ctx: { ...ctx, auth: session }});
});

export const premiumProcedure = (entity: "meetings" | "agents") =>
  protectedProcedure.use(async ({ ctx, next }) => {
    const customer = await polarClient.customers.getStateExternal({
      externalId: ctx.auth.user.id,
    });

    const [userMeetings] = await db
            .select({
                count: count(meetings.id),
            })
            .from(meetings)
            .where(eq(meetings.userId, ctx.auth.user.id));

    const [userAgents] = await db
            .select({
                count: count(agents.id),
            })
            .from(agents)
            .where(eq(agents.userId, ctx.auth.user.id));

    const isPremium = customer.activeSubscriptions.length > 0;
    const isFreeAgentLimitReached = userAgents.count >= MAX_FREE_AGENTS;
    const isFreeMeetingLimitReached = userMeetings.count >= MAX_FREE_MEETINGS;

    const shouldThrowMeetingError = 
      entity === "meetings" && isFreeMeetingLimitReached && !isPremium;
    const shouldThrowAgentError = 
      entity === "agents" && isFreeAgentLimitReached && !isPremium;

    if (shouldThrowMeetingError) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You have reached the maximum number of meetings allowed on the free plan.`,
      });
    }

    if (shouldThrowAgentError) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You have reached the maximum number of agents allowed on the free plan.`,
      });
    }

    return next({ ctx: { ...ctx, customer }});
  });
