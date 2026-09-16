import { useQrDataUrl } from "@/lib/security-passport/use-qr";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

/** Called only with the token URL returned by the existing share creation flow. */
export function SecureShareQr({ url }: { url: string }) {
  const image = useQrDataUrl(url);
  const { lang } = usePassportCopy();
  return image ? (
    <figure className="my-5 flex items-center gap-4 rounded-2xl bg-secondary/50 p-4">
      <img
        src={image}
        width={112}
        height={112}
        className="shrink-0 rounded-lg border-8 border-white"
        alt={
          lang === "sv" ? "QR-kod till din valda delning" : "QR code for your selected disclosure"
        }
      />
      <figcaption className="text-sm">
        {lang === "sv"
          ? "Samma urval, giltighetstid och återkallningskontroll som länken. Den som har QR-koden kan öppna delningen."
          : "The same selection, expiry and revocation controls as the link. Anyone with this QR code can open the disclosure."}
      </figcaption>
    </figure>
  ) : null;
}
