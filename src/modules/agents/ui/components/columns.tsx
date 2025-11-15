"use client"

import { GeneratedAvatar } from "@/components/generated-avatar"

import { CornerDownRightIcon, VideoIcon } from "lucide-react"
import { ColumnDef } from "@tanstack/react-table"

import { AgentGetOne } from "../../types"
import { Badge } from "@/components/ui/badge"



export const columns: ColumnDef<AgentGetOne>[] = [
    {
        accessorKey: "name",
        header: "Agent Name",
        cell: ({ row }) => (
            <div className="flex flex-col gap-y-1">
                <div className="flex items-center gap-x-2">
                    <GeneratedAvatar 
                        variant="botttsNeutral"
                        seed={row.original.name}
                        className="size-6"
                    />
                    <span className="font-semibold capitalize" >{row.original.name}</span>
                </div>
                    <div className="flex items-center gap-x-2">
                        <CornerDownRightIcon className="size-3 text-muted-foreground"/>
                        <span className="text-sm text-muted-foreground max-w-[200px] truncate capitalize">
                            {row.original.instructions}
                        </span>
                    </div>
                </div>
        )
    },
    {
        accessorKey: "meetingCount",
        header: "Meetings",
        cell: () => (
            <Badge
                variant="outline"
                className="flex items-center gap-x-2 [&>svg]:size-4"
            >
                <VideoIcon className="text-blue-700" />
                5 Meetings
            </Badge>
        )
    }
]