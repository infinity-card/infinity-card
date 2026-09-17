import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import {
  ChatBubbleIcon,
  CheckIcon,
  ChevronRightIcon,
  EnvelopeClosedIcon,
  GlobeIcon,
  InstagramLogoIcon,
  LinkedInLogoIcon,
  Link2Icon,
  MobileIcon,
  PersonIcon,
  SewingPinFilledIcon,
  StarFilledIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import { MobileScroll } from "./mobile";
import { getActiveClient, loadPublishedClient, type ChannelKind } from "./clients";
import { downloadVCard, imageElementToJpegData } from "./clients/vcard";
import Builder from "./builder/Builder";
import { getCardStyleVariables } from "./builder/schema";
import "./prototype.css";

const iconByKind: Record<ChannelKind, ComponentType> = {
  whatsapp: ChatBubbleIcon,
  phone: MobileIcon,
  reviews: StarFilledIcon,
  email: EnvelopeClosedIcon,
  instagram: InstagramLogoIcon,
  linkedin: LinkedInLogoIcon,
  facebook: GlobeIcon,
  tiktok: VideoIcon,
  address: SewingPinFilledIcon,
  website: Link2Icon,
};

function ExternalAttributes({ external }: { external?: boolean }) {
  if (!external) return null;
  return <span className="visually-hidden"> (s’ouvre dans un nouvel onglet)</span>;
}

export default function Prototype() {
  const isBuilder = new URLSearchParams(window.location.search).get("builder") === "1";
  const bundledClient = useMemo(getActiveClient, []);
  const assetBase = import.meta.env.BASE_URL;
  const assetRevision = useMemo(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`, []);
  const [client, setClient] = useState(bundledClient);

  const clientAssetUrl = (path: string) => {
    const url = new URL(`${assetBase}${path}`, window.location.href);
    url.searchParams.set("v", assetRevision);
    return url.href;
  };

  useEffect(() => {
    if (isBuilder || bundledClient.isPlaceholder) return;
    let active = true;
    loadPublishedClient(bundledClient.slug, assetBase).then((freshClient) => {
      if (active && freshClient) setClient(freshClient);
    });
    return () => {
      active = false;
    };
  }, [assetBase, bundledClient.isPlaceholder, bundledClient.slug, isBuilder]);

  if (isBuilder) return <Builder />;

  const paperTextureUrl = new URL(`${assetBase}assets/infinity-card/paper-texture.webp`, window.location.href).href;
  const [contactSaved, setContactSaved] = useState(false);
  const actions = client.quickActions.flatMap((kind) => {
    const channel = client.channels[kind];
    return channel ? [{ kind, channel }] : [];
  });
  const details = client.detailItems.flatMap((kind) => {
    const channel = client.channels[kind];
    return channel?.value ? [{ kind, channel }] : [];
  });

  const handleContact = () => {
    const logo = document.querySelector<HTMLImageElement>('[data-testid="infinity-card"] .business-logo');
    downloadVCard(client, logo ? imageElementToJpegData(logo) : undefined);
    setContactSaved(true);
    window.setTimeout(() => setContactSaved(false), 2400);
  };

  return (
    <MobileScroll className={`app-screen card-theme card-theme--${client.theme}`}>
      <main
        className="card-page"
        data-testid="infinity-card"
        data-theme={client.theme}
        style={getCardStyleVariables(client.theme, client.colors, paperTextureUrl) as CSSProperties}
      >
        <section className="hero" aria-label={`Photo de ${client.name}`}>
          <img src={clientAssetUrl(client.heroImage)} alt="" draggable="false" />
        </section>

        <section className="identity" aria-labelledby="business-name">
          <img className="business-logo" src={clientAssetUrl(client.logoImage)} alt={client.logoAlt} draggable="false" />
          <div className="identity-copy">
            <p className="city-label">{client.city}</p>
            <h1 id="business-name">{client.name}</h1>
            <p>{client.description}</p>
          </div>
        </section>

        {client.isPlaceholder ? (
          <section className="slot-placeholder" aria-label="Carte non activée">
            <strong>Carte prête à être personnalisée</strong>
            <p>Cette page sera activée dès que le commerce sera ajouté dans Infinity Card.</p>
          </section>
        ) : null}

        <section className="contact-actions" aria-label="Actions rapides">
          {client.contactCard ? (
            <button className="save-contact" type="button" onClick={handleContact} aria-live="polite">
              {contactSaved ? <CheckIcon /> : <PersonIcon />}
              <span>{contactSaved ? "Contact prêt" : client.contactCard.label}</span>
            </button>
          ) : null}

          {actions.length ? (
            <div className="quick-actions" style={{ "--action-count": actions.length } as CSSProperties}>
              {actions.map(({ kind, channel }) => {
                const Icon = iconByKind[kind];
                return (
                  <a
                    className={`quick-action quick-action--${kind}`}
                    href={channel.href}
                    key={kind}
                    target={channel.external ? "_blank" : undefined}
                    rel={channel.external ? "noreferrer" : undefined}
                    aria-label={channel.label}
                  >
                    <Icon />
                    <span>{channel.label}</span>
                    <ExternalAttributes external={channel.external} />
                  </a>
                );
              })}
            </div>
          ) : null}
        </section>

        {details.length ? (
          <section className="details" aria-label="Coordonnées">
            {details.map(({ kind, channel }) => {
              const Icon = iconByKind[kind];
              return (
                <a
                  className="detail-row"
                  href={channel.href}
                  key={kind}
                  target={channel.external ? "_blank" : undefined}
                  rel={channel.external ? "noreferrer" : undefined}
                >
                  <span className={`detail-icon detail-icon--${kind}`} aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="detail-copy">
                    <span className="detail-label">{channel.label}</span>
                    <strong>{channel.value}</strong>
                  </span>
                  <ChevronRightIcon className="detail-chevron" aria-hidden="true" />
                  <ExternalAttributes external={channel.external} />
                </a>
              );
            })}
          </section>
        ) : null}

        <img
          className="corner-brand-mark"
          src={clientAssetUrl(client.logoImage)}
          alt=""
          aria-hidden="true"
          draggable="false"
        />

        <footer className="card-footer">
          <Link2Icon className="infinity-mark" aria-hidden="true" />
          <span>Infinity Card</span>
          <small>Des rencontres qui comptent</small>
        </footer>
      </main>
    </MobileScroll>
  );
}
