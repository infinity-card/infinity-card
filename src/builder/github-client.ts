import type { ClientCard } from "../clients/types";
import type { CardSlotStatus } from "../cards/inventory";
import type { BuilderDraft } from "./schema";
import { normalizeSlug, toClientCard } from "./schema";

export type GithubFile =
  | { path: string; content: string; encoding: "utf-8" }
  | { path: string; content: string; encoding: "base64" };

export type GithubPublishPayload = {
  client: ClientCard;
  files: GithubFile[];
  commitMessage: string;
};

export type GithubBridgeResponse = {
  ok: boolean;
  url?: string;
  message?: string;
};

export type GithubBackupSnapshot = {
  version: 1;
  generatedAt: string;
  totalCardSlots: number;
  lastSelectedSlot?: string;
  slots: Record<string, {
    status: CardSlotStatus;
    previousStatus?: Exclude<CardSlotStatus, "sold">;
    clientName?: string;
    updatedAt?: string;
  }>;
  drafts: Record<string, BuilderDraft>;
};

function serializeClientModule(client: ClientCard) {
  const data = JSON.stringify(client, null, 2);
  return `import type { ClientCard } from "../../types";\n\nexport const client: ClientCard = ${data};\n\nexport default client;\n`;
}

function dataUrlToBase64(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  return dataUrl.slice(comma + 1);
}

export function buildGithubPublishPayload(draft: BuilderDraft): GithubPublishPayload {
  const client = toClientCard(draft);
  const slug = normalizeSlug(client.slug) || "client";
  const files: GithubFile[] = [
    {
      path: `src/clients/data/${slug}/client.ts`,
      content: serializeClientModule(client),
      encoding: "utf-8",
    },
  ];

  if (draft.heroImageData) {
    const content = dataUrlToBase64(draft.heroImageData);
    if (content) files.push({ path: `public/assets/clients/${slug}/hero.webp`, content, encoding: "base64" });
  }

  if (draft.logoImageData) {
    const content = dataUrlToBase64(draft.logoImageData);
    if (content) files.push({ path: `public/assets/clients/${slug}/logo.webp`, content, encoding: "base64" });
  }

  return {
    client,
    files,
    commitMessage: `Add Infinity Card client: ${client.name || slug}`,
  };
}

function bridgeUrl() {
  return (import.meta.env.VITE_GITHUB_BRIDGE_URL as string | undefined)?.replace(/\/$/, "");
}

export function githubBridgeConfigured() {
  return Boolean(bridgeUrl());
}

export async function publishClientToGithub(draft: BuilderDraft): Promise<GithubBridgeResponse> {
  const endpoint = bridgeUrl();
  if (!endpoint) {
    return {
      ok: false,
      message: "GitHub bridge mazal ma mربوطش. Save le draft ou exporte le fichier pour l’instant.",
    };
  }

  const response = await fetch(`${endpoint}/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(buildGithubPublishPayload(draft)),
  });

  const body = (await response.json().catch(() => ({}))) as GithubBridgeResponse;
  if (!response.ok) {
    throw new Error(body.message || "Impossible de publier ce client pour le moment.");
  }
  return body;
}

export function buildGithubBackupPayload(snapshot: GithubBackupSnapshot) {
  const content = JSON.stringify(snapshot, null, 2);
  return {
    backup: snapshot,
    files: [{
      path: "data/backups/infinity-card-backup.json",
      content,
      encoding: "utf-8" as const,
    }],
    commitMessage: `Update Infinity Card backup · ${snapshot.generatedAt.slice(0, 10)}`,
  };
}

export async function backupInventoryToGithub(snapshot: GithubBackupSnapshot): Promise<GithubBridgeResponse> {
  const endpoint = bridgeUrl();
  if (!endpoint) {
    return {
      ok: false,
      message: "GitHub bridge mazal ma mربوطش. Le backup local غادي يتنزل دابا.",
    };
  }

  const response = await fetch(`${endpoint}/backup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(buildGithubBackupPayload(snapshot)),
  });

  const body = (await response.json().catch(() => ({}))) as GithubBridgeResponse;
  if (!response.ok) {
    throw new Error(body.message || "Impossible de sauvegarder le backup dans GitHub.");
  }
  return body;
}
