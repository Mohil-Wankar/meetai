"use client"

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

import { PanelLeftCloseIcon, PanelLeftIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { DashboardCommand } from "./dashboard-command";

export const DashboardNavbar = () => {
    const { state, toggleSidebar, isMobile } = useSidebar();
    const [commandOpen, setCommandOpen] = useState(false);

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key == "k" && (e.metaKey|| e.ctrlKey)) {
                e.preventDefault();
                setCommandOpen((open) => !open);
            }
        };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
    }, []);

    return (
        <>
            <DashboardCommand open={commandOpen} setOpen={setCommandOpen} />
            <nav className="flex px-4 gap-x-2 items-center py-3 border-b bg-background">
                <Button className="size-9" variant="outline" onClick={toggleSidebar}>
                    {(state === "collapsed" || isMobile) 
                        ? <PanelLeftIcon className="size-4" /> 
                        : <PanelLeftCloseIcon className="size-4" />
                    }
                </Button>
                <Button
                    className="h-9 w-60 justify-start font-normal text-muted-foreground hover:text-muted-foreground"
                    variant="outline"
                    size="sm"
                    onClick={() => setCommandOpen((open) => !open)}
                >
                    <SearchIcon />
                    Search
                    <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-px rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground leading-none">
                        <span className="text-[10px] leading-none">&#8984;</span>
                        <span className="text-[10px] leading-none">+K</span>
                    </kbd>
                </Button>
            </nav>
        </>
    );
};
