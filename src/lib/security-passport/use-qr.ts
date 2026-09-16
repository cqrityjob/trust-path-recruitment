// Security Passport — QR generation for the verification affordance.
//
// Uses the `qrcode` package already present in this repository's
// dependencies (no lockfile change). Rendered to a data URL so an exported
// card image is self-contained — a QR that needs a network fetch would be a
// blank square in exactly the situation the card exists for.
//
// Encodes the supplied destination. Live callers pass only a newly created
// selective-disclosure URL; this hook never mints a token or broadens access.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { TRUST_PALETTE } from "./design/trust-system";

export function useQrDataUrl(text: string, dark: string = TRUST_PALETTE.navy): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 0,
      scale: 8,
      color: { dark, light: "#FFFFFF" },
    })
      .then((url) => {
        if (alive) setDataUrl(url);
      })
      .catch(() => {
        // A missing QR degrades to the printed URL beside it, which is why
        // VerifyBlock always renders both. Never blocks the card.
        if (alive) setDataUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [text, dark]);

  return dataUrl;
}
