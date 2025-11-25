"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { useTRPC } from "@/trpc/client";
import { useConfirm } from "@/hooks/use-confirm";

import { MeetingIdViewHeader } from "../components/meeting-id-view-header";
import { UpdateMeetingDialog } from "../components/update-meeting-dialog";

interface Props {
    meetingId: string;
};

export const MeetingIdView = ({meetingId}: Props) => {
    const trpc = useTRPC();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [UpdateMeetingDialogOpen, setUpdateMeetingDialogOpen] = useState(false);

    const [ RemoveConfirmation, confirmRemove ] = useConfirm(
        "Are you sure?",
        "The following action will permanently delete this meeting and cannot be undone.",
    );

    const { data } = useSuspenseQuery(
        trpc.meetings.getOne.queryOptions({ id: meetingId }),
    );

    const removeMeeting = useMutation(
        trpc.meetings.remove.mutationOptions({
            onSuccess: () => {
                queryClient.invalidateQueries(trpc.meetings.getMany.queryOptions({}));
                router.push("/meetings");
            },
        }),
    );

    const handleRemoveMeeting = async () => {
        const ok = await confirmRemove();

        if (!ok) return;

        await removeMeeting.mutateAsync({ id: meetingId });
    };

    return (
        <>
            <RemoveConfirmation />
            <UpdateMeetingDialog 
                open={UpdateMeetingDialogOpen}
                onOpenChange={setUpdateMeetingDialogOpen}
                initialValues={data}
            />
            <div className="flex-1 px-4 py-4 md:px-8 flex flex-col gap-y-4">
                <MeetingIdViewHeader 
                meetingId={meetingId} 
                meetingName={data.name} 
                onEdit={() => setUpdateMeetingDialogOpen(true)} 
                onRemove={handleRemoveMeeting} 
                />
                {JSON.stringify(data, null, 2)}
            </div>
        </>
    );
};

export const MeetingIdViewLoading = () => {
    return (
        <LoadingState 
            title="Loading Meeting"
            description="This may take a few seconds..."
        />
    );
};

export const MeetingIdViewError = () => {
    return (
        <ErrorState
            title="Error Loading Meeting"
            description="Please try again later."
        />
    );
};