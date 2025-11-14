import { z } from 'zod';

export const agentsInsertSchema = z.object({
    name: z.string().min(1, { message: "Agent Name is required" }),
    instructions: z.string().min(1, { message: "Instructions are required" }),
});