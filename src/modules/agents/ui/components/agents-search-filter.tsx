import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";

import { useAgentFilters } from "../../hooks/use-agents-filters";

export const AgentsSearchFilter = () => {
    const [filters, setFilters] = useAgentFilters();

    return (
        <div className="relative">
            <Input 
                placeholder="Filter by name"
                className="h-9 pl-7 bg-white w-[200px]"
                value={filters.search}
                onChange={(e) => setFilters({ search: e.target.value })}
            />
            <SearchIcon className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
    );
};