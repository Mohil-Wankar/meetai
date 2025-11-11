import { Dispatch, SetStateAction } from "react";

import { CommandDialog, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface Props {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>
};

export const DashboardCommand = ({ open, setOpen} : Props) => {
    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput 
                placeholder="Find a meeting or an agent"
            />
            <CommandList>
                <CommandItem>
                    Test
                </CommandItem>
            </CommandList>
        </CommandDialog>
    );
};