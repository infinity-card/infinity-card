import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import QRCode from "qrcode";
import {
  ArchiveIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  EyeOpenIcon,
  ImageIcon,
  Link2Icon,
  LockClosedIcon,
  PlusIcon,
  RocketIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { clients } from "../clients";
import {
  CARD_SLOTS,
  TOTAL_CARD_SLOTS,
  getCardSlot,
  isCardSlotSlug,
  type CardSlotStatus,
} from "../cards/inventory";
import { downloadVCard, imageElementToJpegData } from "../clients/vcard";
import type { CardTheme, ChannelKind } from "../clients/types";
import { MobileScroll } from "../mobile";
import {
  CHANNEL_DEFINITIONS,
  cloneDraft,
  createBlankDraft,
  getImageSource,
  normalizeSlug,
  type BuilderChannel,
  type BuilderDraft,
  toClientCard,
  validateDraft,
} from "./schema";
import {
  buildGithubPublishPayload,
  backupInventoryToGithub,
  githubBridgeConfigured,
  publishClientToGithub,
} from "./github-client";
import type { GithubBackupSnapshot } from "./github-client";
import "./builder.css";

const DRAFT_STORAGE_KEY = "infinity-card:builder-drafts:v1";
const INVENTORY_STORAGE_KEY = "infinity-card:card-inventory:v1";
const DEFAULT_CARD_SLOT = "ic-001";
const CARD_BATCH_SIZE = 10;
const NEW_CLIENT_KEY = "__new__";

type StoredSlotState = {
  status: Exclude<CardSlotStatus, "available">;
  previousStatus?: Exclude<CardSlotStatus, "sold">;
  clientName?: string;
  updatedAt?: string;
};

type StoredInventory = Record<string, StoredSlotState>;

const SLOT_STATUS_LABELS: Record<CardSlotStatus, string> = {
  available: "Disponible",
  reserved: "En préparation",
  published: "Publié",
  sold: "Vendue",
};

function readStoredInventory(): StoredInventory {
  try {
    const raw = window.localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<StoredSlotState>>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, state]) => state?.status === "reserved" || state?.status === "published" || state?.status === "sold"),
    ) as StoredInventory;
  } catch {
    return {};
  }
}

function getSlotStatus(slug: string, inventory: StoredInventory, drafts: Record<string, BuilderDraft>): CardSlotStatus {
  if (inventory[slug]?.status) return inventory[slug].status;
  if (clients[slug]) return "published";
  if (drafts[slug]?.name?.trim()) return "reserved";
  return "available";
}

function getDraftForSelection(draft: BuilderDraft, selectedSlug: string) {
  const slot = getCardSlot(selectedSlug);
  return slot ? { ...draft, slug: slot.slug } : draft;
}

function getPublicCardUrl(slug: string) {
  const configuredBase = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  const base = configuredBase
    ? new URL(configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`, window.location.href)
    : new URL(import.meta.env.BASE_URL, window.location.href);
  base.search = "";
  base.hash = "";
  base.searchParams.set("client", slug);
  return base.href;
}

function downloadFile(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function buildQrSvg(slug: string) {
  return QRCode.toString(getPublicCardUrl(slug), {
    type: "svg",
    width: 220,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#142522", light: "#ffffff" },
  });
}

async function downloadQrSheet(slots: typeof CARD_SLOTS, filename: string) {
  const cards = await Promise.all(
    slots.map(async (slot) => {
      const svg = await buildQrSvg(slot.slug);
      return `<article class="qr-card"><div class="qr-id">${slot.id}</div>${svg}<div class="qr-url">${getPublicCardUrl(slot.slug)}</div></article>`;
    }),
  );
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Infinity Card · QR</title>
<style>body{margin:0;padding:18mm;background:#fff;color:#142522;font-family:Arial,sans-serif}.sheet{display:grid;grid-template-columns:repeat(4,1fr);gap:10mm}.qr-card{break-inside:avoid;display:grid;justify-items:center;gap:4px;padding:5mm;border:1px solid #d8d2c8;border-radius:8px;text-align:center}.qr-card svg{display:block;width:100%;height:auto}.qr-id{font-weight:700;font-size:15px;letter-spacing:.08em}.qr-url{overflow:hidden;width:100%;color:#77736d;font-size:7px;text-overflow:ellipsis;white-space:nowrap}@media print{body{padding:0}.qr-card{border-color:#bbb}}</style></head>
<body><main class="sheet">${cards.join("")}</main></body></html>`;
  downloadFile(html, filename, "text/html;charset=utf-8");
}

function readStoredDrafts() {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, BuilderDraft>) : {};
  } catch {
    return {};
  }
}

function readImageAsWebp(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire cette image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Cette image ne peut pas être ouverte."));
      image.onload = () => {
        const maxSize = 1800;
        const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Impossible de préparer cette image."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", 0.86));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function makeChannel(kind: ChannelKind): BuilderChannel {
  const definition = CHANNEL_DEFINITIONS.find((item) => item.kind === kind);
  return {
    label: definition?.label ?? kind,
    value: "",
    href: "",
    external: definition?.external,
  };
}

function DraftField({
  label,
  value,
  placeholder,
  onChange,
  multiline = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="builder-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          rows={3}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function ImageUpload({
  label,
  image,
  imageData,
  onImage,
}: {
  label: string;
  image: string;
  imageData?: string;
  onImage: (source: string) => void;
}) {
  const source = getImageSource(image, imageData);

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      onImage(await readImageAsWebp(file));
    } catch {
      // The builder keeps the previous image when a file cannot be decoded.
    }
    event.target.value = "";
  };

  return (
    <label className="builder-image-upload">
      <span className="builder-image-preview">
        <img src={source} alt="" draggable="false" />
        <span className="builder-image-overlay">
          <UploadIcon />
          <small>Changer</small>
        </span>
      </span>
      <span className="builder-image-label">
        <strong>{label}</strong>
        <small>JPG, PNG ou WEBP</small>
      </span>
      <input type="file" accept="image/*" onChange={handleChange} />
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="builder-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="builder-toggle-track" aria-hidden="true">
        <span />
      </span>
      <span>{label}</span>
    </label>
  );
}

function CardQrPanel({ slug, status }: { slug: string; status: CardSlotStatus }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [qrError, setQrError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const url = getPublicCardUrl(slug);
  const slot = getCardSlot(slug);
  const publicUrlConfigured = Boolean((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim());

  useEffect(() => {
    let active = true;
    setQrDataUrl(undefined);
    setQrError(undefined);
    QRCode.toDataURL(url, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#142522", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrError("Impossible de générer le QR pour le moment.");
      });
    return () => {
      active = false;
    };
  }, [url]);

  if (!slot) return null;

  const downloadPng = () => {
    if (qrDataUrl) downloadDataUrl(qrDataUrl, `${slot.id.toLowerCase()}-qr.png`);
  };

  const downloadSvg = async () => {
    try {
      const svg = await buildQrSvg(slug);
      downloadFile(svg, `${slot.id.toLowerCase()}-qr.svg`, "image/svg+xml;charset=utf-8");
    } catch {
      setQrError("Impossible de préparer le fichier SVG.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setQrError("Copie automatique indisponible. Sélectionne le lien manuellement.");
    }
  };

  return (
    <section className="builder-qr-card" aria-label={`QR Code ${slot.id}`}>
      <div className="builder-qr-copy">
        <div>
          <span className="builder-section-kicker">QR DE LA CARTE</span>
          <strong>{slot.id}</strong>
          <small><span className={`builder-status-dot builder-status-dot--${status}`} />{SLOT_STATUS_LABELS[status]}</small>
        </div>
        <span className={`builder-qr-badge ${publicUrlConfigured ? "" : "builder-qr-badge--local"}`}>
          {publicUrlConfigured ? "Prêt à imprimer" : "Aperçu local"}
        </span>
      </div>
      <div className="builder-qr-preview">
        {qrDataUrl ? <img src={qrDataUrl} alt={`QR Code ${slot.id}`} /> : <span className="builder-qr-loading">Génération…</span>}
      </div>
      <div className="builder-qr-link"><Link2Icon /><span>{url}</span></div>
      {!publicUrlConfigured ? <p className="builder-qr-warning">Configure l’URL GitHub Pages avant d’imprimer ce QR.</p> : null}
      {qrError ? <p className="builder-qr-error" role="status">{qrError}</p> : null}
      <div className="builder-qr-actions">
        <button type="button" className="builder-button builder-button--quiet" onClick={downloadPng} disabled={!qrDataUrl}>PNG</button>
        <button type="button" className="builder-button builder-button--quiet" onClick={downloadSvg}>SVG</button>
        <button type="button" className="builder-button builder-button--quiet" onClick={copyLink}>{copied ? "Copié" : "Copier le lien"}</button>
      </div>
    </section>
  );
}

function InventorySlotCard({
  slot,
  status,
  clientName,
  onEdit,
  onToggleSold,
}: {
  slot: (typeof CARD_SLOTS)[number];
  status: CardSlotStatus;
  clientName?: string;
  onEdit: (slug: string) => void;
  onToggleSold: (slug: string) => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [qrError, setQrError] = useState(false);
  const url = getPublicCardUrl(slot.slug);

  useEffect(() => {
    let active = true;
    setQrDataUrl(undefined);
    setQrError(false);
    QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#142522", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrError(true);
      });
    return () => {
      active = false;
    };
  }, [url]);

  const downloadPng = () => {
    if (qrDataUrl) downloadDataUrl(qrDataUrl, `${slot.id.toLowerCase()}-qr.png`);
  };

  const downloadSvg = async () => {
    try {
      const svg = await buildQrSvg(slot.slug);
      downloadFile(svg, `${slot.id.toLowerCase()}-qr.svg`, "image/svg+xml;charset=utf-8");
    } catch {
      setQrError(true);
    }
  };

  return (
    <article className="builder-inventory-slot">
      <div className="builder-inventory-slot-head">
        <div>
          <strong>{slot.id}</strong>
          <small><span className={`builder-status-dot builder-status-dot--${status}`} />{SLOT_STATUS_LABELS[status]}</small>
        </div>
        <span className="builder-inventory-slot-name">{clientName || "Disponible"}</span>
      </div>
      <div className="builder-inventory-slot-qr">
        {qrDataUrl ? <img src={qrDataUrl} alt={`QR Code ${slot.id}`} /> : <span>{qrError ? "QR indisponible" : "Génération…"}</span>}
      </div>
      <div className="builder-inventory-slot-actions">
        <button type="button" className="builder-button builder-button--quiet" onClick={() => onEdit(slot.slug)}>Modifier</button>
        <button type="button" className="builder-button builder-button--quiet" onClick={downloadPng} disabled={!qrDataUrl}>PNG</button>
        <button type="button" className="builder-button builder-button--quiet" onClick={downloadSvg}>SVG</button>
        <button type="button" className={`builder-button builder-inventory-slot-sale ${status === "sold" ? "is-sold" : ""}`} onClick={() => onToggleSold(slot.slug)}>
          {status === "sold" ? "Annuler vente" : "Marquer vendue"}
        </button>
      </div>
    </article>
  );
}

function InventoryView({
  batchIndex,
  onBatchChange,
  slotStates,
  storedDrafts,
  onEdit,
  onToggleSold,
  onDownloadBatch,
  downloading,
  onBackup,
  backupBusy,
  notice,
}: {
  batchIndex: number;
  onBatchChange: (index: number) => void;
  slotStates: StoredInventory;
  storedDrafts: Record<string, BuilderDraft>;
  onEdit: (slug: string) => void;
  onToggleSold: (slug: string) => void;
  onDownloadBatch: (slots: typeof CARD_SLOTS, batchIndex: number) => void;
  downloading: boolean;
  onBackup: () => void;
  backupBusy: boolean;
  notice: { tone: "success" | "error" | "info"; text: string } | null;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CardSlotStatus | "all">("all");
  const normalizedQuery = query.trim().toLowerCase();
  const matchingSlots = useMemo(() => CARD_SLOTS.filter((slot) => {
    const status = getSlotStatus(slot.slug, slotStates, storedDrafts);
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    const clientName = slotStates[slot.slug]?.clientName || storedDrafts[slot.slug]?.name || "";
    return `${slot.id} ${slot.slug} ${clientName}`.toLowerCase().includes(normalizedQuery);
  }), [normalizedQuery, slotStates, statusFilter, storedDrafts]);
  const totalBatches = Math.max(1, Math.ceil(matchingSlots.length / CARD_BATCH_SIZE));
  const safeBatchIndex = Math.min(batchIndex, totalBatches - 1);
  const batchSlots = matchingSlots.slice(safeBatchIndex * CARD_BATCH_SIZE, (safeBatchIndex + 1) * CARD_BATCH_SIZE);
  const firstNumber = batchSlots[0] ? CARD_SLOTS.indexOf(batchSlots[0]) + 1 : 0;
  const lastNumber = batchSlots[batchSlots.length - 1] ? CARD_SLOTS.indexOf(batchSlots[batchSlots.length - 1]) + 1 : 0;
  const publicUrlConfigured = Boolean((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim());

  useEffect(() => {
    onBatchChange(0);
  }, [normalizedQuery, onBatchChange, statusFilter]);

  return (
    <section className="builder-inventory-view" aria-label="Inventaire des cartes">
      <div className="builder-inventory-head">
        <div>
          <span className="builder-section-kicker">STOCK & QR</span>
          <h2>Inventaire des {TOTAL_CARD_SLOTS} cartes</h2>
          <p>Travaille par lots de 10. Chaque carte garde son identifiant et son QR, même après personnalisation.</p>
        </div>
        <div className="builder-inventory-stats" aria-label="Résumé de l'inventaire">
          <span><strong>{CARD_SLOTS.filter((slot) => getSlotStatus(slot.slug, slotStates, storedDrafts) === "available").length}</strong> libres</span>
          <span><strong>{CARD_SLOTS.filter((slot) => getSlotStatus(slot.slug, slotStates, storedDrafts) === "reserved").length}</strong> en préparation</span>
          <span><strong>{CARD_SLOTS.filter((slot) => getSlotStatus(slot.slug, slotStates, storedDrafts) === "published").length}</strong> publiées</span>
          <span><strong>{CARD_SLOTS.filter((slot) => getSlotStatus(slot.slug, slotStates, storedDrafts) === "sold").length}</strong> vendues</span>
        </div>
      </div>

      {!publicUrlConfigured ? <p className="builder-inventory-warning">Les QR affichés sont en aperçu local. Renseigne l’URL GitHub Pages avant d’imprimer le lot.</p> : null}

      <div className="builder-inventory-filters" aria-label="Recherche et filtres">
        <label className="builder-inventory-search">
          <span>Rechercher</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="IC-001 ou nom du client" aria-label="Rechercher une carte" />
        </label>
        <label className="builder-inventory-filter">
          <span>État</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CardSlotStatus | "all")} aria-label="Filtrer par état">
            <option value="all">Toutes les cartes</option>
            <option value="available">{SLOT_STATUS_LABELS.available}</option>
            <option value="reserved">{SLOT_STATUS_LABELS.reserved}</option>
            <option value="published">{SLOT_STATUS_LABELS.published}</option>
            <option value="sold">{SLOT_STATUS_LABELS.sold}</option>
          </select>
        </label>
        <span className="builder-inventory-results">{matchingSlots.length} résultat{matchingSlots.length === 1 ? "" : "s"}</span>
      </div>

      <div className="builder-inventory-toolbar">
        <div className="builder-inventory-pagination">
          <button type="button" className="builder-button builder-button--quiet" onClick={() => onBatchChange(Math.max(0, safeBatchIndex - 1))} disabled={safeBatchIndex === 0}>← Lot précédent</button>
          <strong>Lot {safeBatchIndex + 1} / {totalBatches}<small>{batchSlots.length ? `IC-${String(firstNumber).padStart(3, "0")} à IC-${String(lastNumber).padStart(3, "0")}` : "Aucune carte"}</small></strong>
          <button type="button" className="builder-button builder-button--quiet" onClick={() => onBatchChange(Math.min(totalBatches - 1, safeBatchIndex + 1))} disabled={safeBatchIndex === totalBatches - 1}>Lot suivant →</button>
        </div>
        <div className="builder-inventory-toolbar-actions">
          <button type="button" className="builder-inventory-backup" onClick={onBackup} disabled={backupBusy}>
            {backupBusy ? "Sauvegarde…" : "Backup"}
          </button>
          <button type="button" className="builder-inventory-download" onClick={() => onDownloadBatch(batchSlots, safeBatchIndex)} disabled={downloading || batchSlots.length === 0}>
            {downloading ? "Préparation…" : "Télécharger ce lot (10 QR)"}
          </button>
        </div>
      </div>

      {notice ? <div className={`builder-notice builder-notice--${notice.tone}`} role="status">{notice.tone === "success" ? <CheckCircledIcon /> : <ImageIcon />}{notice.text}</div> : null}

      {batchSlots.length ? <div className="builder-inventory-grid">
        {batchSlots.map((slot) => {
          const status = getSlotStatus(slot.slug, slotStates, storedDrafts);
          const clientName = slotStates[slot.slug]?.clientName || storedDrafts[slot.slug]?.name;
          return <InventorySlotCard key={slot.slug} slot={slot} status={status} clientName={clientName} onEdit={onEdit} onToggleSold={onToggleSold} />;
        })}
      </div> : <div className="builder-inventory-empty">Aucune carte ne correspond à ta recherche.</div>}
    </section>
  );
}

function ChannelEditor({
  kind,
  channel,
  quick,
  detail,
  onToggle,
  onChange,
  onPlacement,
}: {
  kind: ChannelKind;
  channel?: BuilderChannel;
  quick: boolean;
  detail: boolean;
  onToggle: (enabled: boolean) => void;
  onChange: (patch: Partial<BuilderChannel>) => void;
  onPlacement: (placement: "quick" | "detail", enabled: boolean) => void;
}) {
  const definition = CHANNEL_DEFINITIONS.find((item) => item.kind === kind);
  if (!definition) return null;

  return (
    <div className={`builder-channel ${channel ? "is-enabled" : ""}`}>
      <div className="builder-channel-head">
        <span className={`builder-channel-dot builder-channel-dot--${kind}`} aria-hidden="true" />
        <div>
          <strong>{definition.label}</strong>
          <small>{channel ? "Actif sur la carte" : "Masqué pour ce client"}</small>
        </div>
        <Toggle checked={Boolean(channel)} onChange={onToggle} label={channel ? "On" : "Off"} />
      </div>
      {channel ? (
        <div className="builder-channel-body">
          <div className="builder-channel-inputs">
            <label className="builder-field">
              <span>Texte affiché</span>
              <input
                value={channel.value}
                placeholder={definition.placeholder}
                onChange={(event) => onChange({ value: event.target.value })}
              />
            </label>
            <label className="builder-field">
              <span>Lien d’action</span>
              <input
                value={channel.href}
                placeholder={kind === "phone" ? "tel:+212..." : "https://..."}
                onChange={(event) => onChange({ href: event.target.value })}
              />
            </label>
          </div>
          <div className="builder-placement-row">
            <span>Afficher dans</span>
            <label>
              <input type="checkbox" checked={quick} onChange={(event) => onPlacement("quick", event.target.checked)} />
              Actions rapides
            </label>
            <label>
              <input type="checkbox" checked={detail} onChange={(event) => onPlacement("detail", event.target.checked)} />
              Coordonnées
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LivePreview({ draft }: { draft: BuilderDraft }) {
  const client = toClientCard(draft);
  const [contactSaved, setContactSaved] = useState(false);
  const actions = client.quickActions.flatMap((kind) => (client.channels[kind] ? [{ kind, channel: client.channels[kind]! }] : []));
  const details = client.detailItems.flatMap((kind) =>
    client.channels[kind]?.value ? [{ kind, channel: client.channels[kind]! }] : [],
  );

  const handleContact = () => {
    const logo = document.querySelector<HTMLImageElement>('.builder-live-card .business-logo');
    downloadVCard(client, logo ? imageElementToJpegData(logo) : undefined);
    setContactSaved(true);
    window.setTimeout(() => setContactSaved(false), 2400);
  };

  return (
    <div className="builder-live-preview">
      <div className="builder-preview-head">
        <span>Preview live</span>
        <span className="builder-preview-status"><CheckCircledIcon /> En direct</span>
      </div>
      <article className={`builder-live-card card-theme card-theme--${client.theme}`} data-theme={client.theme}>
        <main className="card-page">
          <section className="hero" aria-label={`Photo de ${client.name || "votre client"}`}>
            <img src={getImageSource(client.heroImage, draft.heroImageData)} alt="" draggable="false" />
          </section>
          <section className="identity" aria-label="Identité du client">
            <img className="business-logo" src={getImageSource(client.logoImage, draft.logoImageData)} alt="" draggable="false" />
            <div className="identity-copy">
              <p className="city-label">{client.city || "VILLE"}</p>
              <h1>{client.name || "Nom du commerce"}</h1>
              <p>{client.description || "Description du commerce"}</p>
            </div>
          </section>
          <section className="contact-actions" aria-label="Actions rapides">
            {client.contactCard ? (
              <button className="save-contact" type="button" onClick={handleContact} aria-live="polite">
                <span>{contactSaved ? "Contact prêt" : client.contactCard.label}</span>
              </button>
            ) : null}
            {actions.length ? (
              <div className="quick-actions" style={{ "--action-count": actions.length } as CSSProperties}>
                {actions.map(({ kind, channel }) => <span className={`quick-action quick-action--${kind}`} key={kind}><span>{channel.label}</span></span>)}
              </div>
            ) : null}
          </section>
          {details.length ? (
            <section className="details" aria-label="Coordonnées">
              {details.map(({ kind, channel }) => (
                <div className="detail-row" key={kind}>
                  <span className={`detail-icon detail-icon--${kind}`} />
                  <span className="detail-copy"><span className="detail-label">{channel.label}</span><strong>{channel.value}</strong></span>
                  <ChevronRightIcon className="detail-chevron" />
                </div>
              ))}
            </section>
          ) : null}
          <footer className="card-footer"><Link2Icon className="infinity-mark" /><span>Infinity Card</span><small>Des rencontres qui comptent</small></footer>
        </main>
      </article>
      <p className="builder-preview-note"><EyeOpenIcon /> Voilà ce que le client verra après publication.</p>
    </div>
  );
}

export default function Builder() {
  const [storedDrafts, setStoredDrafts] = useState<Record<string, BuilderDraft>>(() => readStoredDrafts());
  const [slotStates, setSlotStates] = useState<StoredInventory>(() => readStoredInventory());
  const [selectedSlug, setSelectedSlug] = useState(DEFAULT_CARD_SLOT);
  const [draft, setDraft] = useState<BuilderDraft>(() => {
    const saved = readStoredDrafts();
    return saved[DEFAULT_CARD_SLOT] ?? createBlankDraft("women", DEFAULT_CARD_SLOT);
  });
  const [mobileView, setMobileView] = useState<"edit" | "preview" | "inventory">("edit");
  const [inventoryBatch, setInventoryBatch] = useState(0);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrPackBusy, setQrPackBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  const allClients = useMemo(() => ({ ...clients, ...storedDrafts }), [storedDrafts]);
  const exampleClientEntries = Object.values(allClients).filter((client) => !isCardSlotSlug(client.slug));
  const activeSlot = getCardSlot(selectedSlug);
  const activeSlotStatus = activeSlot ? getSlotStatus(activeSlot.slug, slotStates, storedDrafts) : null;
  const availableSlots = CARD_SLOTS.filter((slot) => getSlotStatus(slot.slug, slotStates, storedDrafts) === "available").length;
  const reservedSlots = CARD_SLOTS.filter((slot) => getSlotStatus(slot.slug, slotStates, storedDrafts) === "reserved").length;
  const publishedSlots = CARD_SLOTS.filter((slot) => getSlotStatus(slot.slug, slotStates, storedDrafts) === "published").length;
  const soldSlots = CARD_SLOTS.filter((slot) => getSlotStatus(slot.slug, slotStates, storedDrafts) === "sold").length;

  useEffect(() => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(storedDrafts));
  }, [storedDrafts]);

  useEffect(() => {
    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(slotStates));
  }, [slotStates]);

  const updateDraft = (patch: Partial<BuilderDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const updateChannel = (kind: ChannelKind, patch: Partial<BuilderChannel>) => {
    setDraft((current) => ({
      ...current,
      channels: {
        ...current.channels,
        [kind]: { ...(current.channels[kind] ?? makeChannel(kind)), ...patch },
      },
    }));
  };

  const toggleChannel = (kind: ChannelKind, enabled: boolean) => {
    setDraft((current) => {
      if (!enabled) {
        const channels = { ...current.channels };
        delete channels[kind];
        return {
          ...current,
          channels,
          quickActions: current.quickActions.filter((item) => item !== kind),
          detailItems: current.detailItems.filter((item) => item !== kind),
        };
      }
      return { ...current, channels: { ...current.channels, [kind]: current.channels[kind] ?? makeChannel(kind) } };
    });
  };

  const setPlacement = (kind: ChannelKind, placement: "quick" | "detail", enabled: boolean) => {
    setDraft((current) => {
      const list = placement === "quick" ? current.quickActions : current.detailItems;
      const next = enabled ? [...list.filter((item) => item !== kind), kind] : list.filter((item) => item !== kind);
      return placement === "quick" ? { ...current, quickActions: next } : { ...current, detailItems: next };
    });
  };

  const selectClient = (value: string) => {
    setSelectedSlug(value);
    setNotice(null);
    const slot = getCardSlot(value);
    if (slot) {
      const saved = storedDrafts[slot.slug];
      setDraft(saved ? cloneDraft(saved) : createBlankDraft(draft.theme, slot.slug));
      setMobileView("edit");
      return;
    }
    if (value === NEW_CLIENT_KEY) {
      setDraft(createBlankDraft(draft.theme));
      return;
    }
    const client = allClients[value];
    if (client) setDraft(cloneDraft(client));
    setMobileView("edit");
  };

  const handleTheme = (theme: CardTheme) => {
    const defaults = createBlankDraft(theme);
    setDraft((current) => ({
      ...current,
      theme,
      heroImage: current.heroImageData ? current.heroImage : defaults.heroImage,
      logoImage: current.logoImageData ? current.logoImage : defaults.logoImage,
      logoAlt: defaults.logoAlt,
    }));
  };

  const saveDraft = () => {
    const slot = getCardSlot(selectedSlug);
    const slotStatusBeforeSave = slot ? getSlotStatus(slot.slug, slotStates, storedDrafts) : null;
    const savedDraft = getDraftForSelection(draft, selectedSlug);
    const slug = normalizeSlug(savedDraft.slug);
    const errors = validateDraft(savedDraft);
    if (errors.length) {
      setNotice({ tone: "error", text: errors[0] });
      return;
    }
    const saved = { ...savedDraft, slug };
    setStoredDrafts((current) => ({ ...current, [slug]: saved }));
    setSelectedSlug(slug);
    setDraft(saved);
    if (slot) {
      setSlotStates((current) => ({
        ...current,
        [slot.slug]: {
          ...current[slot.slug],
          status: slotStatusBeforeSave === "sold" ? "sold" : "reserved",
          previousStatus: slotStatusBeforeSave === "sold" ? current[slot.slug]?.previousStatus : undefined,
          clientName: saved.name,
          updatedAt: new Date().toISOString(),
        },
      }));
    }
    setNotice({ tone: "success", text: "Draft محفوظ فهاد التليفون." });
  };

  const exportPayload = () => {
    const exportDraft = getDraftForSelection(draft, selectedSlug);
    const errors = validateDraft(exportDraft);
    if (errors.length) {
      setNotice({ tone: "error", text: errors[0] });
      return;
    }
    const payload = buildGithubPublishPayload(exportDraft);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${payload.client.slug}-github-payload.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice({ tone: "info", text: "Export جاهز للتنزيل." });
  };

  const publish = async () => {
    const publishDraft = getDraftForSelection(draft, selectedSlug);
    const slot = getCardSlot(selectedSlug);
    const slotStatusBeforePublish = slot ? getSlotStatus(slot.slug, slotStates, storedDrafts) : null;
    const errors = validateDraft(publishDraft);
    if (errors.length) {
      setNotice({ tone: "error", text: errors[0] });
      return;
    }
    if (!githubBridgeConfigured()) {
      setNotice({ tone: "info", text: "GitHub bridge mazal ma mربوطش. Save le draft دابا، والـpublish غادي يتفعل منين نربطو الحساب." });
      return;
    }
    setBusy(true);
    try {
      const response = await publishClientToGithub(publishDraft);
      if (slot) {
        setSlotStates((current) => ({
          ...current,
          [slot.slug]: {
            ...current[slot.slug],
            status: slotStatusBeforePublish === "sold" ? "sold" : "published",
            previousStatus: slotStatusBeforePublish === "sold" ? current[slot.slug]?.previousStatus : undefined,
            clientName: publishDraft.name,
            updatedAt: new Date().toISOString(),
          },
        }));
      }
      setNotice({ tone: "success", text: response.message ?? "Client نشر بنجاح." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "وقع مشكل فالنشر." });
    } finally {
      setBusy(false);
    }
  };

  const activeChannelKinds = CHANNEL_DEFINITIONS.map((item) => item.kind).filter((kind) => draft.channels[kind]);
  const displaySlug = normalizeSlug(draft.slug) || "client-slug";

  const handleDownloadQrBatch = async (batchSlots: typeof CARD_SLOTS, batchIndex: number) => {
    const firstNumber = batchSlots[0] ? CARD_SLOTS.indexOf(batchSlots[0]) + 1 : batchIndex * CARD_BATCH_SIZE + 1;
    const lastNumber = batchSlots[batchSlots.length - 1] ? CARD_SLOTS.indexOf(batchSlots[batchSlots.length - 1]) + 1 : firstNumber;
    setQrPackBusy(true);
    try {
      await downloadQrSheet(
        batchSlots,
        `infinity-card-qr-${String(firstNumber).padStart(3, "0")}-${String(lastNumber).padStart(3, "0")}.html`,
      );
      setNotice({ tone: "success", text: `Le lot ${batchIndex + 1} (${batchSlots.length} QR) est prêt à imprimer.` });
    } catch {
      setNotice({ tone: "error", text: "Impossible de préparer ce lot de QR pour le moment." });
    } finally {
      setQrPackBusy(false);
    }
  };

  const handleEditSlot = (slug: string) => {
    selectClient(slug);
    setMobileView("edit");
  };

  const handleToggleSold = (slug: string) => {
    const currentStatus = getSlotStatus(slug, slotStates, storedDrafts);
    if (currentStatus === "sold") {
      const draftForSlot = storedDrafts[slug];
      const savedState = slotStates[slug];
      const nextStatus: Exclude<CardSlotStatus, "sold"> = savedState?.previousStatus
        ?? (draftForSlot?.name?.trim() ? "reserved" : clients[slug] ? "published" : "available");
      setSlotStates((current) => {
        if (nextStatus === "available") {
          const next = { ...current };
          delete next[slug];
          return next;
        }
        return {
          ...current,
          [slug]: {
            ...current[slug],
            status: nextStatus,
            previousStatus: undefined,
            clientName: current[slug]?.clientName || draftForSlot?.name,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      setNotice({ tone: "info", text: `${slug.toUpperCase()} رجعات للحالة السابقة.` });
      return;
    }

    setSlotStates((current) => ({
      ...current,
      [slug]: {
        ...current[slug],
        status: "sold",
        previousStatus: currentStatus === "available" ? "available" : currentStatus,
        clientName: current[slug]?.clientName || storedDrafts[slug]?.name,
        updatedAt: new Date().toISOString(),
      },
    }));
    setNotice({ tone: "success", text: `${slug.toUpperCase()} تعلمات كمباعة.` });
  };

  const handleBackup = async () => {
    const generatedAt = new Date().toISOString();
    const slots = Object.fromEntries(
      CARD_SLOTS.map((slot) => {
        const state = slotStates[slot.slug];
        return [slot.slug, {
          status: getSlotStatus(slot.slug, slotStates, storedDrafts),
          previousStatus: state?.status === "sold" ? state.previousStatus : undefined,
          clientName: state?.clientName || storedDrafts[slot.slug]?.name || undefined,
          updatedAt: state?.updatedAt,
        }];
      }),
    );
    const snapshot: GithubBackupSnapshot = {
      version: 1,
      generatedAt,
      totalCardSlots: TOTAL_CARD_SLOTS,
      lastSelectedSlot: getCardSlot(selectedSlug)?.slug,
      slots,
      drafts: { ...clients, ...storedDrafts } as Record<string, BuilderDraft>,
    };

    setBackupBusy(true);
    try {
      const response = await backupInventoryToGithub(snapshot);
      if (!response.ok) {
        downloadFile(JSON.stringify(snapshot, null, 2), `infinity-card-backup-${generatedAt.slice(0, 10)}.json`, "application/json;charset=utf-8");
        setNotice({ tone: "info", text: "Backup local téléchargé. ربط GitHub bridge باش يتحفظ أوتوماتيكياً فـGitHub." });
      } else {
        setNotice({ tone: "success", text: response.message ?? "Backup محفوظ فـGitHub بنجاح." });
      }
    } catch (error) {
      downloadFile(JSON.stringify(snapshot, null, 2), `infinity-card-backup-${generatedAt.slice(0, 10)}.json`, "application/json;charset=utf-8");
      setNotice({ tone: "error", text: `${error instanceof Error ? error.message : "وقع مشكل فحفظ الـbackup."} Une copie locale a été téléchargée.` });
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <MobileScroll className="builder-page">
      <div className="builder-shell">
        <header className="builder-topbar">
          <div className="builder-brand"><span className="builder-brand-mark">∞</span><span>Infinity Card</span></div>
          <div className="builder-secure"><LockClosedIcon /> Builder privé</div>
        </header>

        <section className="builder-hero">
          <div>
            <span className="builder-eyebrow">STUDIO DE CRÉATION</span>
            <h1>Une carte prête<br /><em>à être partagée.</em></h1>
            <p>Crée une page client en quelques minutes, depuis ton téléphone.</p>
          </div>
          <div className="builder-hero-orbit" aria-hidden="true"><span>∞</span></div>
        </section>

        <div className="builder-mobile-tabs" role="tablist" aria-label="Mode Builder">
          <button type="button" className={mobileView === "edit" ? "is-active" : ""} onClick={() => setMobileView("edit")}><PlusIcon /> Modifier</button>
          <button type="button" className={mobileView === "preview" ? "is-active" : ""} onClick={() => setMobileView("preview")}><EyeOpenIcon /> Aperçu</button>
          <button type="button" className={mobileView === "inventory" ? "is-active" : ""} onClick={() => setMobileView("inventory")}><ArchiveIcon /> Inventaire</button>
        </div>

        <div className={`builder-layout builder-layout--${mobileView}`}>
          {mobileView === "inventory" ? (
            <InventoryView
              batchIndex={inventoryBatch}
              onBatchChange={setInventoryBatch}
              slotStates={slotStates}
              storedDrafts={storedDrafts}
              onEdit={handleEditSlot}
              onToggleSold={handleToggleSold}
              onDownloadBatch={handleDownloadQrBatch}
              downloading={qrPackBusy}
              onBackup={handleBackup}
              backupBusy={backupBusy}
              notice={notice}
            />
          ) : <>
          <section className="builder-editor" aria-label="Éditeur de client">
            <section className="builder-inventory-summary" aria-label="Inventaire des cartes">
              <div>
                <span className="builder-section-kicker">INVENTAIRE</span>
                <strong>{TOTAL_CARD_SLOTS} cartes prêtes</strong>
                <small>{availableSlots} disponibles · {reservedSlots} en préparation · {publishedSlots} publiées · {soldSlots} vendues</small>
              </div>
              <button type="button" className="builder-inventory-download" onClick={() => setMobileView("inventory")}>
                Ouvrir l’inventaire
              </button>
            </section>

            <div className="builder-client-switcher">
              <div><span className="builder-section-kicker">CLIENTS</span><strong>Ton espace de travail</strong></div>
              <label className="builder-select-wrap">
                <span className="visually-hidden">Choisir un client</span>
                <select value={selectedSlug} onChange={(event) => selectClient(event.target.value)}>
                  <optgroup label="Cartes à vendre">
                    {CARD_SLOTS.map((slot) => {
                      const status = getSlotStatus(slot.slug, slotStates, storedDrafts);
                      const savedName = slotStates[slot.slug]?.clientName || storedDrafts[slot.slug]?.name;
                      return <option value={slot.slug} key={slot.slug}>{slot.id} · {savedName || SLOT_STATUS_LABELS[status]}</option>;
                    })}
                  </optgroup>
                  <optgroup label="Exemples & brouillons">
                    {exampleClientEntries.map((client) => <option value={client.slug} key={client.slug}>{client.name || client.slug}</option>)}
                  </optgroup>
                  <option value={NEW_CLIENT_KEY}>＋ Nouveau client</option>
                </select>
                <ChevronRightIcon />
              </label>
            </div>

            <div className="builder-progress"><span className="is-done">01 <small>Identité</small></span><i /><span className={draft.name ? "is-done" : ""}>02 <small>Coordonnées</small></span><i /><span className={activeChannelKinds.length ? "is-done" : ""}>03 <small>Publication</small></span></div>

            <fieldset className="builder-card">
              <legend><span>01</span> Identité du commerce</legend>
              <p className="builder-helper">Le minimum pour donner une vraie présence à la carte.</p>
              <div className="builder-theme-picker">
                <button type="button" className={draft.theme === "women" ? "is-selected theme-women" : "theme-women"} onClick={() => handleTheme("women")}><span className="theme-swatch" /><span><strong>Élégance</strong><small>Template femmes</small></span>{draft.theme === "women" ? <CheckCircledIcon /> : null}</button>
                <button type="button" className={draft.theme === "men" ? "is-selected theme-men" : "theme-men"} onClick={() => handleTheme("men")}><span className="theme-swatch" /><span><strong>Signature</strong><small>Template hommes</small></span>{draft.theme === "men" ? <CheckCircledIcon /> : null}</button>
              </div>
              <div className="builder-form-grid">
                <DraftField label="Nom du commerce" value={draft.name} placeholder="Ex. Maison Lina" onChange={(value) => updateDraft({ name: value })} />
                <DraftField label="Ville" value={draft.city} placeholder="Rabat" onChange={(value) => updateDraft({ city: value })} />
                <div className="builder-field builder-field--full"><DraftField label="Description courte" value={draft.description} placeholder="Ex. Caftans · Accessoires · Mode féminine" onChange={(value) => updateDraft({ description: value })} multiline /></div>
                <DraftField label="Identifiant du lien" value={draft.slug} placeholder="maison-lina" readOnly={Boolean(activeSlot)} onChange={(value) => updateDraft({ slug: value })} />
              </div>
              <div className="builder-link-preview"><Link2Icon /><span>Ton lien sera</span><strong>{getPublicCardUrl(displaySlug)}</strong></div>
              {activeSlot && activeSlotStatus ? <CardQrPanel slug={activeSlot.slug} status={activeSlotStatus} /> : null}
              <div className="builder-image-grid">
                <ImageUpload label="Photo principale" image={draft.heroImage} imageData={draft.heroImageData} onImage={(heroImageData) => updateDraft({ heroImageData })} />
                <ImageUpload label="Logo du commerce" image={draft.logoImage} imageData={draft.logoImageData} onImage={(logoImageData) => updateDraft({ logoImageData })} />
              </div>
            </fieldset>

            <fieldset className="builder-card">
              <legend><span>02</span> Coordonnées & réseaux</legend>
              <p className="builder-helper">Active uniquement ce que ton client utilise. Rien de vide ne sera affiché.</p>
              <div className="builder-channel-list">
                {CHANNEL_DEFINITIONS.map((definition) => <ChannelEditor key={definition.kind} kind={definition.kind} channel={draft.channels[definition.kind]} quick={draft.quickActions.includes(definition.kind)} detail={draft.detailItems.includes(definition.kind)} onToggle={(enabled) => toggleChannel(definition.kind, enabled)} onChange={(patch) => updateChannel(definition.kind, patch)} onPlacement={(placement, enabled) => setPlacement(definition.kind, placement, enabled)} />)}
              </div>
              <div className="builder-contact-option"><Toggle checked={Boolean(draft.contactCard)} onChange={(enabled) => updateDraft({ contactCard: enabled ? { label: "Ajouter aux contacts", organization: draft.name } : undefined })} label="Bouton Ajouter aux contacts" /></div>
            </fieldset>

            <fieldset className="builder-card builder-card--publish">
              <legend><span>03</span> Prêt à publier</legend>
              <div className="builder-publish-copy"><div className="builder-publish-icon"><RocketIcon /></div><div><strong>Une fois publié, le lien reste stable.</strong><p>Le client garde le même lien NFC même si tu modifies ses informations plus tard.</p></div></div>
              <div className="builder-actions"><button type="button" className="builder-button builder-button--quiet" onClick={saveDraft}>Sauvegarder draft</button><button type="button" className="builder-button builder-button--primary" onClick={publish} disabled={busy}>{busy ? "Publication…" : "Publier sur GitHub"}<RocketIcon /></button></div>
              <button type="button" className="builder-export" onClick={exportPayload}>Exporter le payload GitHub pour test local</button>
              {notice ? <div className={`builder-notice builder-notice--${notice.tone}`} role="status">{notice.tone === "success" ? <CheckCircledIcon /> : <ImageIcon />}{notice.text}</div> : null}
            </fieldset>
          </section>

          <aside className="builder-preview-column"><LivePreview draft={draft} /></aside>
          </>}
        </div>

        <footer className="builder-footer"><span>∞ Infinity Card Studio</span><span>Une page. Un lien. Une rencontre.</span></footer>
      </div>
    </MobileScroll>
  );
}
