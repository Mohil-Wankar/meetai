import OpenAI from "openai";
import { and, eq, not } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";

import {
    MessageNewEvent,
    CallEndedEvent,
    CallTranscriptionReadyEvent,
    CallRecordingReadyEvent,
    CallSessionParticipantLeftEvent,
    CallSessionStartedEvent
} from "@stream-io/node-sdk";

import { db } from "@/db";
import { agents, meetings } from "@/db/schema";
import { streamVideo } from "@/lib/stream-video";
import { inngest } from "@/inngest/client";
import { generateAvatarUri } from "@/lib/avatar";
import { streamChat } from "@/lib/stream-chat";

const openaiclient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// In-memory cache to prevent duplicate processing of messages
const processedMessages = new Map<string, number>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of processedMessages.entries()) {
        if (now - timestamp > CACHE_TTL) {
            processedMessages.delete(key);
        }
    }
}, 60 * 1000); // Clean up every minute

function verifySignatureWithSDK(body: string, signature: string): boolean {
    return streamVideo.verifyWebhook(body, signature);
};

export async function POST(req: NextRequest) {
    const signature = req.headers.get("x-signature");
    const apikey = req.headers.get("x-api-key");

    if (!signature || !apikey) {
        return NextResponse.json(
            { error: "Missing signature or API key" },
            { status: 400 }
        );
    }

    const body = await req.text();

    if (!verifySignatureWithSDK(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const eventType = (payload as Record<string, unknown>)?.type;

    if (eventType === "call.session_started") {
        const event = payload as CallSessionStartedEvent;
        const meetingId = event.call.custom?.meetingId;

        if (!meetingId) {
            return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
        }

        const [existingMeeting] = await db
            .select()
            .from(meetings)
            .where(
                and(
                    eq(meetings.id, meetingId),
                    not(eq(meetings.status, "completed")),
                    not(eq(meetings.status, "active")),
                    not(eq(meetings.status, "cancelled")),
                    not(eq(meetings.status, "processing")),
                )
            );

        if (!existingMeeting) {
            return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
        }

        await db
            .update(meetings)
            .set({
                status: "active",
                startedAt: new Date(),
            })
            .where(eq(meetings.id, meetingId));

        const [existingAgent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, existingMeeting.agentId));

        if (!existingAgent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        const call = streamVideo.video.call("default", meetingId);
        const realtimeClient = await streamVideo.video.connectOpenAi({
            call,
            openAiApiKey: process.env.OPENAI_API_KEY!,
            agentUserId: existingAgent.id,
        });

        realtimeClient.updateSession({
            instructions: existingAgent.instructions,
        });
    } else if (eventType === "call.session_participant_left") {
        const event = payload as CallSessionParticipantLeftEvent;
        const meetingId = event.call_cid.split(":")[1];

        if (!meetingId) {
            return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
        }

        const call = streamVideo.video.call("default", meetingId);
        await call.end();
    } else if (eventType === "call.session_ended") {
        const event = payload as CallEndedEvent;
        const meetingId = event.call.custom?.meetingId;

        if (!meetingId) {
            return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
        }

        await db
            .update(meetings)
            .set({
                status: "processing",
                endedAt: new Date(),
            })
            .where(and(eq(meetings.id, meetingId), eq(meetings.status, "active")));
    } else if (eventType === "call.transcription_ready") {
        const event = payload as CallTranscriptionReadyEvent;
        const meetingId = event.call_cid.split(":")[1];

        const [updatedMeeting] = await db
            .update(meetings)
            .set({
                transcriptUrl: event.call_transcription.url,
            })
            .where(eq(meetings.id, meetingId))
            .returning();

        if (!updatedMeeting) {
            return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
        }

        await inngest.send({
            name: "meetings/processing",
            data: {
                meetingId: updatedMeeting.id,
                transcriptUrl: updatedMeeting.transcriptUrl,
            },
        });

    } else if (eventType === "call.recording_ready") {
        const event = payload as CallRecordingReadyEvent;
        const meetingId = event.call_cid.split(":")[1];

        await db
            .update(meetings)
            .set({
                recordingUrl: event.call_recording.url,
            })
            .where(eq(meetings.id, meetingId))
    } else if (eventType === "message.new") {
        const event = payload as MessageNewEvent;

        const userId = event.user?.id;
        const channelId = event.channel_id;
        const text = event.message?.text;

        if (!userId || !channelId || !text) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const [existingMeeting] = await db
            .select()
            .from(meetings)
            .where(and(eq(meetings.id, channelId), eq(meetings.status, "completed")));

        if (!existingMeeting) {
            return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
        }

        const [existingAgent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, existingMeeting.agentId));

        if (!existingAgent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        if (userId === existingAgent.id) {
            // Skip messages from the agent itself
            return NextResponse.json({ status: "agent_message_skipped" });
        }

        // Check if this message has already been processed
        const messageId = event.message?.id;
        if (messageId && processedMessages.has(messageId)) {
            return NextResponse.json({ status: "already_processing" });
        }

        // Mark message as being processed
        if (messageId) {
            processedMessages.set(messageId, Date.now());
        }

        const channel = streamChat.channel("messaging", channelId);
        await channel.watch();

        // Check if agent has already responded to this message
        const allMessages = channel.state.messages;
        const currentMessageIndex = allMessages.findIndex(msg => msg.id === event.message?.id);
        
        if (currentMessageIndex !== -1) {
            // Look for any agent messages after this user message
            const messagesAfterCurrent = allMessages.slice(currentMessageIndex + 1);
            const agentAlreadyReplied = messagesAfterCurrent.some(
                msg => msg.user?.id === existingAgent.id
            );
            
            if (agentAlreadyReplied) {
                // Agent has already responded to this message
                return NextResponse.json({ status: "already_processed" });
            }
        }

        const instructions = `
        You are an AI assistant helping the user revisit a recently completed meeting.
        Below is a summary of the meeting, generated from the transcript:
        
        ${existingMeeting.summary}
        
        The following are your original instructions from the live meeting assistant. Please continue to follow these behavioral guidelines as you assist the user:
        
        ${existingAgent.instructions}
        
        The user may ask questions about the meeting, request clarifications, or ask for follow-up actions.
        Always base your responses on the meeting summary above.
        
        You also have access to the recent conversation history between you and the user. Use the context of previous messages to provide relevant, coherent, and helpful responses. If the user's question refers to something discussed earlier, make sure to take that into account and maintain continuity in the conversation.
        
        If the summary does not contain enough information to answer a question, politely let the user know.
        
        Be concise, helpful, and focus on providing accurate information from the meeting and the ongoing conversation.
        `;

        const previousMessages = channel.state.messages
            .filter((msg) => msg.text && msg.text.trim() !== "")
            .filter((msg) => msg.id !== event.message?.id)
            .slice(-5)
            .map<ChatCompletionMessageParam>((message) => ({
                role: message.user?.id === existingAgent.id ? "assistant" : "user",
                content: message.text || "",
            }));

        const GPTResponse = await openaiclient.chat.completions.create({
            messages: [
                { role: "system", content: instructions },
                ...previousMessages,
                { role: "user", content: text },
            ],
            model: "gpt-4o",
        });

        const GPTResponseText = GPTResponse.choices[0].message.content;

        if (!GPTResponseText) {
            return NextResponse.json(
                { error: "No response from GPT" },
                { status: 400 }
            );
        }

        const avatarUrl = generateAvatarUri({
            seed: existingAgent.name,
            variant: "botttsNeutral",
        });

        await streamChat.upsertUser({
            id: existingAgent.id,
            name: existingAgent.name,
            image: avatarUrl,
        });

        await channel.sendMessage({
            text: GPTResponseText,
            user: {
                id: existingAgent.id,
                name: existingAgent.name,
                image: avatarUrl,
            },
            quoted_message_id: event.message?.id,
        });
    }

    return NextResponse.json({ status: "ok" });
};