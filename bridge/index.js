const SESSION_COOKIE = "infinity_card_session";
const STATE_COOKIE = "infinity_card_oauth_state";
const RETURN_COOKIE = "infinity_card_oauth_return";
const SESSION_MAX_AGE = 60 * 60 * 8;
// Two uploaded images can legitimately be several megabytes together. Keep a
// generous request cap while retaining the per-file 8 MiB guard below.
const MAX_REQUEST_BYTES = 24 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const encoder = new TextEncoder();

function config(env, key) {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function json(value, status, request, env, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(request, env),
    ...extraHeaders,
  });
  return new Response(JSON.stringify(value), { status, headers });
}

function corsHeaders(request, env) {
  const allowedOrigin = config(env, "PUBLIC_APP_ORIGIN");
  const requestOrigin = request.headers.get("Origin") || "";
  const headers = {
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "vary": "Origin",
  };
  if (allowedOrigin && requestOrigin === allowedOrigin) {
    headers["access-control-allow-origin"] = allowedOrigin;
  }
  return headers;
}

function redirect(location, extraHeaders = {}) {
  const headers = new Headers({ location });
  for (const [name, value] of Object.entries(extraHeaders)) {
    if (name.toLowerCase() === "set-cookie" && Array.isArray(value)) {
      for (const item of value) headers.append("set-cookie", item);
    } else {
      headers.set(name, String(value));
    }
  }
  return new Response(null, { status: 302, headers });
}

function cookieValue(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  return parts.join("; ");
}

function randomBytes(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(bytes) {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return base64ToBytes(padded);
}

async function sessionKey(env) {
  const secret = config(env, "SESSION_SECRET");
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function sealSession(session, env) {
  const iv = randomBytes(12);
  const key = await sessionKey(env);
  const plaintext = encoder.encode(JSON.stringify(session));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv, 0);
  packed.set(ciphertext, iv.length);
  return base64UrlEncode(packed);
}

async function openSession(value, env) {
  if (!value) return null;
  try {
    const packed = base64UrlDecode(value);
    if (packed.length <= 12) return null;
    const key = await sessionKey(env);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: packed.slice(0, 12) },
      key,
      packed.slice(12),
    );
    const session = JSON.parse(new TextDecoder().decode(plaintext));
    if (!session?.token || !session?.login || Number(session.expiresAt) < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function defaultReturnUrl(env) {
  return `${config(env, "PUBLIC_APP_ORIGIN") || "https://infinity-card.github.io"}/infinity-card/?builder=1`;
}

function safeReturnUrl(value, env) {
  const fallback = defaultReturnUrl(env);
  const origin = config(env, "PUBLIC_APP_ORIGIN");
  if (!value || !origin) return fallback;
  try {
    const candidate = new URL(value);
    return candidate.origin === origin ? candidate.href : fallback;
  } catch {
    return fallback;
  }
}

function bridgePublicUrl(request, env) {
  return config(env, "BRIDGE_PUBLIC_URL") || new URL(request.url).origin;
}

function oauthCallbackUrl(request, env) {
  return `${bridgePublicUrl(request, env)}/auth/github/callback`;
}

function githubHeaders(token, jsonBody = false) {
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "Infinity-Card-Builder-Bridge",
    "x-github-api-version": "2022-11-28",
  };
  if (jsonBody) headers["content-type"] = "application/json";
  return headers;
}

async function githubFetch(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { ...githubHeaders(token, Boolean(options.body)), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `GitHub returned ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function requireBridgeConfig(env) {
  const missing = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_OWNER", "GITHUB_REPO", "SESSION_SECRET"]
    .filter((key) => !config(env, key));
  if (missing.length) throw new Error(`Bridge configuration is incomplete: ${missing.join(", ")}.`);
}

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function validSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return false;
  if (!slug.startsWith("ic-")) return true;
  const number = Number(slug.slice(3));
  return /^ic-\d{3}$/.test(slug) && number >= 1 && number <= 200;
}

const CHANNEL_KINDS = new Set([
  "whatsapp",
  "phone",
  "reviews",
  "email",
  "instagram",
  "linkedin",
  "facebook",
  "tiktok",
  "address",
  "website",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validText(value, maxLength = 2000) {
  return typeof value === "string" && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}

function validHref(value) {
  if (!validText(value, 4000)) return false;
  try {
    const protocol = new URL(value).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:" || protocol === "tel:";
  } catch {
    return false;
  }
}

function validateClientData(client, slug) {
  if (!isPlainObject(client) || client.slug !== slug || !["women", "men"].includes(client.theme)) {
    throw new Error("Client data is invalid.");
  }
  for (const key of ["name", "description", "city", "heroImage", "logoImage", "logoAlt"]) {
    if (!validText(client[key])) throw new Error(`Client field ${key} is invalid.`);
  }
  if (client.colors !== undefined) {
    if (!isPlainObject(client.colors)) throw new Error("Client colors are invalid.");
    for (const key of ["background", "primary", "accent", "softAccent", "ink"]) {
      if (typeof client.colors[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(client.colors[key])) {
        throw new Error("Client colors are invalid.");
      }
    }
  }
  if (client.contactCard !== undefined) {
    if (!isPlainObject(client.contactCard) || !validText(client.contactCard.label, 200)) {
      throw new Error("Client contact card is invalid.");
    }
    if (client.contactCard.organization !== undefined && !validText(client.contactCard.organization, 200)) {
      throw new Error("Client contact card is invalid.");
    }
  }
  if (!isPlainObject(client.channels)) throw new Error("Client channels are invalid.");
  for (const [kind, channel] of Object.entries(client.channels)) {
    if (!CHANNEL_KINDS.has(kind) || !isPlainObject(channel)) throw new Error("Client channel is invalid.");
    if (!validText(channel.label, 200) || !validText(channel.value ?? "", 2000) || !validHref(channel.href)) {
      throw new Error("Client channel is invalid.");
    }
    if (channel.external !== undefined && typeof channel.external !== "boolean") {
      throw new Error("Client channel is invalid.");
    }
  }
  for (const key of ["quickActions", "detailItems"]) {
    if (!Array.isArray(client[key]) || client[key].some((kind) => !CHANNEL_KINDS.has(kind) || !client.channels[kind])) {
      throw new Error("Client placements are invalid.");
    }
  }
}

function serializeClientModule(client) {
  const data = JSON.stringify(client, null, 2);
  return `import type { ClientCard } from "../../types";\n\nexport const client: ClientCard = ${data};\n\nexport default client;\n`;
}

function serializeClientJson(client) {
  return `${JSON.stringify(client, null, 2)}\n`;
}

function validateWriteRequest(request, env) {
  const allowedOrigin = config(env, "PUBLIC_APP_ORIGIN");
  const requestOrigin = request.headers.get("Origin") || "";
  if (!allowedOrigin || requestOrigin !== allowedOrigin) {
    return { status: 403, message: "Origin not allowed." };
  }
  const contentType = request.headers.get("Content-Type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return { status: 415, message: "Content-Type must be application/json." };
  }
  return null;
}

function utf8ToBase64(value) {
  return bytesToBase64(encoder.encode(value));
}

function isBase64(value) {
  return typeof value === "string" && value.length % 4 === 0 && /^[a-z\d+/]*={0,2}$/i.test(value);
}

function validateClientPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid client payload.");
  const client = payload.client;
  const slug = normalizeSlug(client?.slug);
  if (!client || !validSlug(slug)) throw new Error("Invalid client slug.");
  validateClientData(client, slug);
  if (!Array.isArray(payload.files) || payload.files.length < 1 || payload.files.length > 4) {
    throw new Error("A client publish must contain one to four files.");
  }

  const allowed = new Set([
    `src/clients/data/${slug}/client.ts`,
    `public/clients/${slug}.json`,
    `public/assets/clients/${slug}/hero.webp`,
    `public/assets/clients/${slug}/logo.webp`,
  ]);
  const seen = new Set();
  for (const file of payload.files) {
    if (!file || !allowed.has(file.path) || seen.has(file.path)) throw new Error("Client file path is not allowed.");
    if (file.encoding !== "utf-8" && file.encoding !== "base64") throw new Error("Unsupported file encoding.");
    if (typeof file.content !== "string") throw new Error("Client file content is invalid.");
    const size = file.encoding === "base64" ? Math.floor(file.content.length * 0.75) : encoder.encode(file.content).length;
    if (size > MAX_FILE_BYTES) throw new Error("Client file is too large.");
    if (file.encoding === "base64" && !isBase64(file.content)) throw new Error("Client image data is invalid.");
    if (file.path === `src/clients/data/${slug}/client.ts` && (file.encoding !== "utf-8" || file.content !== serializeClientModule(client))) {
      throw new Error("Client data file must match the generated client data.");
    }
    if (file.path === `public/clients/${slug}.json` && (file.encoding !== "utf-8" || file.content !== serializeClientJson(client))) {
      throw new Error("Client JSON file must match the generated client data.");
    }
    seen.add(file.path);
  }
  if (!seen.has(`src/clients/data/${slug}/client.ts`)) throw new Error("Client data file is required.");
  const files = [...payload.files];
  // Keep old Builder bundles working while guaranteeing every new commit has
  // the cache-safe JSON copy used by public card pages.
  if (!seen.has(`public/clients/${slug}.json`)) {
    files.push({ path: `public/clients/${slug}.json`, content: serializeClientJson(client), encoding: "utf-8" });
  }
  return { slug, files, commitMessage: String(payload.commitMessage || `Add Infinity Card client: ${slug}`).slice(0, 120) };
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object" || !payload.backup || !Array.isArray(payload.files) || payload.files.length !== 1) {
    throw new Error("Invalid backup payload.");
  }
  const file = payload.files[0];
  if (file.path !== "data/backups/infinity-card-backup.json" || file.encoding !== "utf-8" || typeof file.content !== "string") {
    throw new Error("Backup path or encoding is not allowed.");
  }
  if (encoder.encode(file.content).length > MAX_FILE_BYTES) throw new Error("Backup is too large.");
  if (payload.backup.totalCardSlots !== 200) throw new Error("Backup must contain all 200 card slots.");
  return { files: payload.files, commitMessage: String(payload.commitMessage || "Update Infinity Card backup").slice(0, 120) };
}

function repositoryConfig(env, kind) {
  const prefix = kind === "backup" ? "GITHUB_BACKUP_" : "GITHUB_";
  const owner = config(env, `${prefix}OWNER`);
  const repo = config(env, `${prefix}REPO`);
  const branch = config(env, `${prefix}BRANCH`) || "main";
  if (!owner || !repo) {
    if (kind === "backup") throw new Error("Backup requires a separate private GitHub repository.");
    throw new Error("GitHub repository is not configured.");
  }
  return { owner, repo, branch };
}

async function commitFiles(files, commitMessage, token, env, kind = "client") {
  const { owner, repo, branch } = repositoryConfig(env, kind);
  const writeToken = kind === "backup" ? config(env, "GITHUB_BACKUP_TOKEN") : token;
  if (!writeToken) {
    if (kind === "backup") throw new Error("Backup requires GITHUB_BACKUP_TOKEN for the private repository.");
    throw new Error("GitHub write token is not configured.");
  }
  if (kind === "backup") {
    const repository = await githubFetch(`/repos/${owner}/${repo}`, writeToken);
    if (repository.private !== true) throw new Error("Backup repository must be private.");
  }
  const ref = await githubFetch(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, writeToken);
  const parent = await githubFetch(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`, writeToken);
  const treeEntries = [];
  for (const file of files) {
    const content = file.encoding === "base64" ? file.content : utf8ToBase64(file.content);
    const blob = await githubFetch(`/repos/${owner}/${repo}/git/blobs`, writeToken, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "base64" }),
    });
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await githubFetch(`/repos/${owner}/${repo}/git/trees`, writeToken, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeEntries }),
  });
  const commit = await githubFetch(`/repos/${owner}/${repo}/git/commits`, writeToken, {
    method: "POST",
    body: JSON.stringify({ message: commitMessage, tree: tree.sha, parents: [parent.sha] }),
  });
  await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, writeToken, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return `https://github.com/${owner}/${repo}/commit/${commit.sha}`;
}

async function startGithubLogin(request, env) {
  requireBridgeConfig(env);
  const state = base64UrlEncode(randomBytes(24));
  const returnUrl = safeReturnUrl(new URL(request.url).searchParams.get("return"), env);
  const params = new URLSearchParams({
    client_id: config(env, "GITHUB_CLIENT_ID"),
    redirect_uri: oauthCallbackUrl(request, env),
    // The Infinity Card repository is public; request the narrowest OAuth scope needed.
    scope: "public_repo",
    state,
    allow_signup: "false",
  });
  return redirect(`https://github.com/login/oauth/authorize?${params.toString()}`, {
    "set-cookie": [
      cookie(STATE_COOKIE, state, { maxAge: 600, path: "/auth/github" }),
      cookie(RETURN_COOKIE, encodeURIComponent(returnUrl), { maxAge: 600, path: "/auth/github" }),
    ],
  });
}

async function finishGithubLogin(request, env) {
  requireBridgeConfig(env);
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const stateCookie = cookieValue(request, STATE_COOKIE);
  if (!state || !code || !stateCookie || state !== stateCookie) return new Response("OAuth state is invalid.", { status: 400 });

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config(env, "GITHUB_CLIENT_ID"),
      client_secret: config(env, "GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: oauthCallbackUrl(request, env),
    }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token) return new Response("GitHub login failed.", { status: 502 });

  const user = await githubFetch("/user", tokenBody.access_token);
  const allowedUser = (config(env, "GITHUB_ALLOWED_USER") || config(env, "GITHUB_OWNER")).toLowerCase();
  if (String(user.login || "").toLowerCase() !== allowedUser) return new Response("This GitHub account is not allowed.", { status: 403 });

  const session = await sealSession({
    token: tokenBody.access_token,
    login: user.login,
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
  }, env);
  const returnCookie = cookieValue(request, RETURN_COOKIE);
  const returnUrl = safeReturnUrl(returnCookie ? decodeURIComponent(returnCookie) : "", env);
  return redirect(returnUrl, {
    "set-cookie": [
      cookie(SESSION_COOKIE, session, { maxAge: SESSION_MAX_AGE, httpOnly: true, path: "/", sameSite: "None" }),
      cookie(STATE_COOKIE, "", { maxAge: 0, path: "/auth/github" }),
      cookie(RETURN_COOKIE, "", { maxAge: 0, path: "/auth/github" }),
    ],
  });
}

async function requireSession(request, env) {
  const session = await openSession(cookieValue(request, SESSION_COOKIE), env);
  if (!session) return null;
  return session;
}

function loginUrl(request, env) {
  const url = new URL(`${bridgePublicUrl(request, env)}/auth/github/start`);
  url.searchParams.set("return", safeReturnUrl(new URL(request.url).searchParams.get("return"), env));
  return url.href;
}

async function handleWrite(request, env, kind) {
  const requestError = validateWriteRequest(request, env);
  if (requestError) return json({ ok: false, message: requestError.message }, requestError.status, request, env);
  const session = await requireSession(request, env);
  if (!session) return json({ ok: false, code: "AUTH_REQUIRED", message: "Connecte ton compte GitHub avant de publier.", authUrl: loginUrl(request, env) }, 401, request, env);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_REQUEST_BYTES) return json({ ok: false, message: "Payload trop volumineux." }, 413, request, env);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, message: "Payload JSON invalide." }, 400, request, env);
  }
  try {
    const validated = kind === "client" ? validateClientPayload(payload) : validateBackupPayload(payload);
    const url = await commitFiles(validated.files, validated.commitMessage, session.token, env, kind);
    return json({ ok: true, url, message: kind === "client" ? "Client publié sur GitHub." : "Backup sauvegardé sur GitHub." }, 200, request, env);
  } catch (error) {
    const status = Number(error?.status) === 409 ? 409 : 400;
    return json({ ok: false, message: error instanceof Error ? error.message : "GitHub publish failed." }, status, request, env);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "infinity-card-github-bridge" }, 200, request, env);
    if (url.pathname === "/auth/github/start" && request.method === "GET") {
      try { return await startGithubLogin(request, env); } catch (error) { return new Response(error instanceof Error ? error.message : "Bridge is not configured.", { status: 503 }); }
    }
    if (url.pathname === "/auth/github/callback" && request.method === "GET") {
      try { return await finishGithubLogin(request, env); } catch (error) { return new Response(error instanceof Error ? error.message : "GitHub login failed.", { status: 502 }); }
    }
    if (url.pathname === "/me" && request.method === "GET") {
      const session = await requireSession(request, env);
      return json({ ok: Boolean(session), login: session?.login }, 200, request, env);
    }
    if (url.pathname === "/clients" && request.method === "POST") return handleWrite(request, env, "client");
    if (url.pathname === "/backup" && request.method === "POST") return handleWrite(request, env, "backup");
    return json({ ok: false, message: "Not found." }, 404, request, env);
  },
};

export {
  normalizeSlug,
  validSlug,
  validateBackupPayload,
  validateClientPayload,
  validateWriteRequest,
  serializeClientModule,
  commitFiles,
};
