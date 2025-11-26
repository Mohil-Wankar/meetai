import { createAvatar } from "@dicebear/core";
import { botttsNeutral, initials, micah } from "@dicebear/collection";

interface Props {
    seed: string,
    variant: "botttsNeutral" | "micah" | "initials";
};

export const generateAvatarUri = ({ seed, variant }: Props) =>{
    let avatar;

    if (variant === "botttsNeutral") {
        avatar = createAvatar(botttsNeutral, { seed });
    }
    else if (variant === "micah") {
        avatar = createAvatar(micah, { seed });
    }
    else {
        avatar = createAvatar(initials, { seed, fontWeight: 500, fontSize: 42 });
    }

    return avatar.toDataUri();
}