import { createAvatar } from "@dicebear/core";
import { botttsNeutral, initials, micah } from "@dicebear/collection";

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface GeneratedAvatarProps {
    seed: string;
    className ?: string;
    variant: "botttsNeutral" | "initials" | "micah";
}

export const GeneratedAvatar = ({
    seed,
    className,
    variant
}: GeneratedAvatarProps) => {
    let avatar;

    if (variant === "botttsNeutral") {
        avatar = createAvatar(botttsNeutral, {
            seed,
        });
    } else if (variant === "initials") {
        avatar = createAvatar(initials, {
            seed,
            fontWeight: 500,
            fontSize: 42,
        });
    } else {
        avatar = createAvatar(micah, {
            seed,
            mouth: ["laughing", "smirk", "surprised" ],
            baseColor: ["f9c9b6","F2CCB7"],
            hairColor: ["000000"],
            eyebrows: ["up", "eyelashesUp"],
            eyes: ["eyes","eyesShadow","round", "smiling", "smilingShadow"],
            nose: ["curve","pointed","tound"],
            shirt: ["collared","crew","open"],
            shirtColor: ["d2eff3","6bd9e9","9287ff", "e0ddff", "f4d150", "f9c9b6", "fc909f", "ffffff"],
        });
    }

    return (
        <Avatar className={cn(className)}>
            <AvatarImage src={avatar.toDataUri()} alt = "Avatar"/>
            <AvatarFallback>{seed.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
    );
};
