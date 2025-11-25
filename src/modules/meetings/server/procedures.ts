import { z } from "zod";
import { and, count, desc, eq, getTableColumns, ilike, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "@/db";
import { agents, meetings } from "@/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/constants";
import { streamVideo } from "@/lib/stream-video";
import { generateAvatarUri } from "@/lib/avatar";

import { meetingsInsertSchema, meetingsUpdateSchema } from "../schemas";
import { MeetingStatus } from "../types";

export const meetingsRouter = createTRPCRouter({
    generateToken: protectedProcedure.mutation(async ({ ctx }) => {
        const userId = ctx.auth.user.id;
        const userName = ctx.auth.user.name;
        const userImage = ctx.auth.user.image ?? generateAvatarUri({ seed: userName, variant: "initials" });

        // Only send minimal required fields to avoid 5KB limit
        await streamVideo.upsertUsers([
            {
                id: userId,
                name: userName,
                role: "admin",
                image: userImage,
            },
        ]);

        const expirationTime = Math.floor(Date.now() / 1000) + 3600;
        const issuedAt = Math.floor(Date.now() / 1000) - 60;

        const token = streamVideo.generateUserToken({
            user_id: userId,
            exp: expirationTime,
            iat: issuedAt,
        });

        return token;
    }),

    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const [removedMeeting] = await db
                .delete(meetings)
                    .where(
                        and(
                            eq(meetings.id, input.id),
                            eq(meetings.userId, ctx.auth.user.id),
                        ),
                    )
                    .returning();
                if (!removedMeeting) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Meeting not found",
                    });
                }
    
                return removedMeeting;
            }),

    update: protectedProcedure
        .input(meetingsUpdateSchema)
        .mutation(async ({ input, ctx }) => {
            const [updatedMeeting] = await db
                    .update(meetings)
                    .set(input)
                    .where(
                        and(
                            eq(meetings.id, input.id),
                            eq(meetings.userId, ctx.auth.user.id),
                        ),
                    )
                    .returning();
                if (!updatedMeeting) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Meeting not found",
                    });
                }
    
                return updatedMeeting;
            }),

    create: protectedProcedure
        .input(meetingsInsertSchema)
            .mutation(async ({ input, ctx }) => {
                const [ createdMeeting] = await db
                    .insert(meetings)
                    .values({
                        ...input,
                        userId: ctx.auth.user.id,
                    })
                    .returning();

                const call = streamVideo.video.call("default", createdMeeting.id);
                await call.create({
                    data: {
                        created_by_id: ctx.auth.user.id,
                        custom: {
                            meetingId: createdMeeting.id,
                            meetingName: createdMeeting.name,
                        },
                        settings_override: {
                            transcription: {
                                language: "en",
                                mode: "auto-on",
                                closed_caption_mode: "auto-on",
                            },
                            recording: {
                                mode: "auto-on",
                                quality: "1080p",
                            },
                        },
                    },
                })
                
                const [existingAgent] = await db
                    .select()
                    .from(agents)
                    .where(eq(agents.id, createdMeeting.agentId));

                if (!existingAgent) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Agent not found",
                    });
                }

                await streamVideo.upsertUsers([
                    {
                        id: existingAgent.id,
                        name: existingAgent.name,
                        role: "user",
                        image: generateAvatarUri({ 
                            seed: existingAgent.name, 
                            variant: "botttsNeutral",
                        }),
                    },
                ]);

                return createdMeeting;
        }),
    
    getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({input, ctx})=> {
        const [existingMeeting] = await db
            .select({
                ...getTableColumns(meetings),
                agent: agents,
                duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
            })
            .from(meetings)
            .innerJoin(agents, eq(meetings.agentId, agents.id))
            .where(
                and(
                    eq(meetings.id, input.id),
                    eq(meetings.userId, ctx.auth.user.id),
                )
            );

        if (!existingMeeting) {
            throw new TRPCError({ code:"NOT_FOUND", message:"Meeting not found"})
        }

        return existingMeeting;
    }),
    
    getMany: protectedProcedure
        .input(
                z.object({
                page: z.number().default(DEFAULT_PAGE),
                pageSize: z
                    .number()
                    .min(MIN_PAGE_SIZE)
                    .max(MAX_PAGE_SIZE)
                    .default(DEFAULT_PAGE_SIZE),
                search: z.string().nullish(),
                agentId: z.string().nullish(),
                status: z.enum([
                    MeetingStatus.Upcoming,
                    MeetingStatus.Active,
                    MeetingStatus.Completed,
                    MeetingStatus.Processing,
                    MeetingStatus.Cancelled,
                ])
                .nullish(),
            })
        )
    .query(async ({ ctx, input })=> {
        const { search, page, pageSize, status, agentId } = input;

        const data = await db
            .select({
                ...getTableColumns(meetings),
                agent: agents,
                duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
            })
            .from(meetings)
            .innerJoin(agents, eq(meetings.agentId, agents.id))
            .where(
                and(
                    eq(meetings.userId, ctx.auth.user.id),
                    search ? ilike(meetings.name, `%${search}%`) : undefined,
                    status ? eq(meetings.status, status) : undefined,
                    agentId ? eq(meetings.agentId, agentId) : undefined,
                )
            )
            .orderBy(desc(meetings.createdAt), desc(meetings.id))
            .limit(pageSize)
            .offset((page - 1) * pageSize);

            const [total] = await db
            .select({ count: count() })
            .from(meetings)
            .innerJoin(agents, eq(meetings.agentId, agents.id))
            .where(
                and(
                    eq(meetings.userId, ctx.auth.user.id),
                    search ? ilike(meetings.name, `%${search}%`) : undefined,
                    status ? eq(meetings.status, status) : undefined,
                    agentId ? eq(meetings.agentId, agentId) : undefined,
                )
            );

        const totalPages = Math.ceil(total.count / pageSize);

        return {
            items: data,
            total: total.count,
            totalPages,
        };
    }),

});