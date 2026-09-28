// Security Passport — the platform marks beside each share channel.
//
// One table for the link panel and the social image panel, so a channel
// looks the same wherever it is offered.

import {
  Copy,
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  Share2,
  X as XIcon,
} from "lucide-react";
import type { ShareChannel } from "@/lib/security-passport/share-channels";

/** Platform marks, tinted only so a row is recognisable at a glance. The
 *  surface, type and spacing around them stay CQrityjob's own. */
export const CHANNEL_ICON: Readonly<
  Record<ShareChannel, { readonly Icon: typeof Linkedin; readonly colour: string | null }>
> = {
  linkedin: { Icon: Linkedin, colour: "#0A66C2" },
  facebook: { Icon: Facebook, colour: "#1877F2" },
  x: { Icon: XIcon, colour: null },
  email: { Icon: Mail, colour: null },
  instagram: { Icon: Instagram, colour: "#C13584" },
  whatsapp: { Icon: MessageCircle, colour: "#25D366" },
  copy_link: { Icon: Copy, colour: null },
  native: { Icon: Share2, colour: null },
};
