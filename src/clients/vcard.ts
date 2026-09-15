import type { ClientCard } from "./types";

function escapeVCard(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldPhotoLine(prefix: string, base64: string) {
  const line = `${prefix}${base64}`;
  const chunks = [line.slice(0, 75)];
  for (let index = 75; index < line.length; index += 74) {
    chunks.push(` ${line.slice(index, index + 74)}`);
  }
  return chunks.join("\r\n");
}

/** Convert an already-loaded card image into a compact JPEG for the contact avatar. */
export function imageElementToJpegData(image: HTMLImageElement) {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return undefined;

  try {
    const maxSize = 480;
    const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  } catch {
    // A failed image conversion should never prevent the contact file from being created.
    return undefined;
  }
}

export function downloadVCard(client: ClientCard, photoData?: string) {
  const phone = [client.channels.phone?.value, client.channels.whatsapp?.value].find(
    (value) => value && /\d{5,}/.test(value),
  );
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(client.name)}`,
    `N:${escapeVCard(client.name)};;;;`,
    `ORG:${escapeVCard(client.contactCard?.organization ?? client.name)}`,
    phone ? `TEL;TYPE=CELL:${escapeVCard(phone)}` : null,
    client.channels.email?.value ? `EMAIL:${escapeVCard(client.channels.email.value)}` : null,
    client.channels.address?.value ? `ADR;TYPE=WORK:;;${escapeVCard(client.channels.address.value)};;;;` : null,
    client.channels.website?.href ? `URL:${escapeVCard(client.channels.website.href)}` : null,
    "END:VCARD",
  ].filter((line): line is string => Boolean(line));

  if (photoData) {
    lines.splice(lines.length - 1, 0, foldPhotoLine("PHOTO;ENCODING=b;TYPE=JPEG:", photoData));
  }

  const blob = new Blob([lines.join("\r\n")], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const download = document.createElement("a");
  download.href = url;
  download.download = `${client.slug || "infinity-card-contact"}.vcf`;
  document.body.appendChild(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
