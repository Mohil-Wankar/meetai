import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button";

import Link from "next/link";
import { VideoIcon } from "lucide-react";

interface Props {
    meetingId : string;
}

export const UpcomingState = ({
    meetingId,
}: Props) => {
    return (
        <div className = "bg-white rounded-lg px-4 py-5 flex flex-col gap-y-8 items-center justify-center ">
            <EmptyState 
                image = "/upcoming.svg"
                title="Not started yet"
                description="Once you start the meeting, a summary will appear here."
            />
            <div className="flex flex-col-reverse lg:flex-row lg:justify-center items-center gap-2 w-full">
                <Button asChild className="w-full lg:w-auto">
                    <Link href={`/call/${meetingId}`}>
                        <VideoIcon />
                        Start meeting 
                    </Link>       
                </Button>
                
            </div>
        </div>
    )
}