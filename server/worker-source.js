const PERIODS = new Set(["30", "90", "365"]);
const SCOPES = ["public", "staff", "leadership"];
const ROLES = ["general", "staff", "leadership"];
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const PASSWORD_MIN_LENGTH = 12;
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS = "https://token.actions.githubusercontent.com/.well-known/jwks";
const GITHUB_OIDC_AUDIENCE = "fcg-dashboard-password-sync";
const GITHUB_REPOSITORY = "roruffm/FCG-Dash";
const GITHUB_REPOSITORY_ID = "1365119446";
const GITHUB_OWNER_ID = "270083419";
const GITHUB_WORKFLOW_REF = "roruffm/FCG-Dash/.github/workflows/update-dashboard-passwords.yml@refs/heads/main";
const encoder = new TextEncoder();
let githubJwksCache = { expiresAt: 0, keys: [] };

const seedData = {
  "30": {
    public: { label:"letzten Monat",dataDate:"10. September 2026",kpis:{attendance:1286,attendanceDelta:6.1},attendance:[{label:"So 1",onsite:398,online:121},{label:"So 2",onsite:427,online:118},{label:"So 3",onsite:451,online:139},{label:"So 4",onsite:443,online:126}],topics:[{name:"Angst & Vertrauen",views:438,delta:18},{name:"Beziehungen",views:361,delta:12},{name:"Gebet",views:304,delta:9},{name:"Beruf & Berufung",views:247,delta:7}] },
    staff: { kpis:{services:18,urgent:6},teams:[{name:"Königskinder",fill:72,open:7},{name:"Begrüßung",fill:91,open:2},{name:"Worship",fill:96,open:1},{name:"Technik",fill:84,open:3},{name:"Gastronomie",fill:78,open:5}],events:[{name:"ALPHA-Kurs",count:34,status:"Fast voll"},{name:"NEXT STEPS",count:22,status:"Plätze frei"},{name:"Taufkurs",count:11,status:"Im Plan"}] },
    leadership: { kpis:{contacts:29,contactsDelta:11.5,groups:31,groupsDelta:2},journey:{contacts:29,nextSteps:18,groups:10,teams:5} }
  },
  "90": {
    public: { label:"laufenden Quartal",dataDate:"10. September 2026",kpis:{attendance:3842,attendanceDelta:8.4},attendance:[401,418,395,436,452,439,467,444,475,461,489,443].map((onsite,index)=>({label:`W${index+1}`,onsite,online:[109,117,112,124,128,133,142,136,151,144,159,126][index]})),topics:[{name:"Angst & Vertrauen",views:1124,delta:18},{name:"Beziehungen",views:943,delta:12},{name:"Gebet",views:817,delta:9},{name:"Beruf & Berufung",views:688,delta:7}] },
    staff: { kpis:{services:18,urgent:6},teams:[{name:"Königskinder",fill:72,open:7},{name:"Begrüßung",fill:91,open:2},{name:"Worship",fill:96,open:1},{name:"Technik",fill:84,open:3},{name:"Gastronomie",fill:78,open:5}],events:[{name:"ALPHA-Kurs",count:34,status:"Fast voll"},{name:"NEXT STEPS",count:22,status:"Plätze frei"},{name:"Taufkurs",count:11,status:"Im Plan"}] },
    leadership: { kpis:{contacts:84,contactsDelta:12,groups:31,groupsDelta:2},journey:{contacts:84,nextSteps:51,groups:29,teams:16} }
  },
  "365": {
    public: { label:"Jahr 2026",dataDate:"10. September 2026",kpis:{attendance:14876,attendanceDelta:10.7},attendance:[388,401,416,409,427,438,446,452,459,471,466,482].map((onsite,index)=>({label:["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][index],onsite,online:[101,108,111,117,122,126,131,139,142,148,151,156][index]})),topics:[{name:"Angst & Vertrauen",views:3982,delta:21},{name:"Beziehungen",views:3541,delta:15},{name:"Gebet",views:3108,delta:11},{name:"Beruf & Berufung",views:2442,delta:8}] },
    staff: { kpis:{services:24,urgent:8},teams:[{name:"Königskinder",fill:69,open:9},{name:"Begrüßung",fill:89,open:3},{name:"Worship",fill:96,open:1},{name:"Technik",fill:81,open:4},{name:"Gastronomie",fill:74,open:7}],events:[{name:"ALPHA-Kurs",count:89,status:"Gut besucht"},{name:"NEXT STEPS",count:74,status:"Gut besucht"},{name:"Taufkurse",count:38,status:"Im Plan"}] },
    leadership: { kpis:{contacts:297,contactsDelta:18.3,groups:31,groupsDelta:5},journey:{contacts:297,nextSteps:174,groups:102,teams:61} }
  }
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...securityHeaders(), ...headers } });
}

function securityHeaders() {
  return {
    "x-content-type-options":"nosniff",
    "x-frame-options":"DENY",
    "referrer-policy":"no-referrer",
    "permissions-policy":"camera=(), microphone=(), geolocation=()",
    "content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  };
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

function parseBase64Url(value) {
  const normalized = value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, character=>character.charCodeAt(0));
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function constantTimeEqual(left, right) {
  const length = Math.max(left.length, right.length); let result = left.length ^ right.length;
  for (let index=0; index<length; index++) result |= (left[index] || 0) ^ (right[index] || 0);
  return result === 0;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(value)));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(parseBase64Url(value)));
}

async function githubSigningKeys() {
  if (githubJwksCache.expiresAt > Date.now() && githubJwksCache.keys.length) return githubJwksCache.keys;
  const response = await fetch(GITHUB_OIDC_JWKS, { headers: { accept:"application/json" } });
  if (!response.ok) throw new Error("GITHUB_JWKS_UNAVAILABLE");
  const payload = await response.json();
  if (!Array.isArray(payload.keys) || !payload.keys.length) throw new Error("GITHUB_JWKS_INVALID");
  githubJwksCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys: payload.keys };
  return payload.keys;
}

async function verifyGitHubOidc(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("INVALID_GITHUB_TOKEN");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const claims = decodeJwtPart(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("INVALID_GITHUB_TOKEN");
  const jwk = (await githubSigningKeys()).find(candidate=>candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) throw new Error("UNKNOWN_GITHUB_KEY");
  const key = await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid = await crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,parseBase64Url(encodedSignature),encoder.encode(`${encodedHeader}.${encodedPayload}`));
  if (!valid) throw new Error("INVALID_GITHUB_SIGNATURE");

  const now = Math.floor(Date.now()/1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const trusted = claims.iss === GITHUB_OIDC_ISSUER
    && audiences.includes(GITHUB_OIDC_AUDIENCE)
    && Number(claims.nbf) <= now + 30
    && Number(claims.exp) >= now - 30
    && claims.repository === GITHUB_REPOSITORY
    && String(claims.repository_id) === GITHUB_REPOSITORY_ID
    && String(claims.repository_owner_id) === GITHUB_OWNER_ID
    && claims.ref === "refs/heads/main"
    && claims.environment === "production"
    && claims.event_name === "workflow_dispatch"
    && claims.workflow_ref === GITHUB_WORKFLOW_REF
    && typeof claims.jti === "string"
    && claims.jti.length >= 16;
  if (!trusted) throw new Error("UNTRUSTED_GITHUB_WORKFLOW");
  return claims;
}

async function makeSession(role, secret) {
  const payload = base64Url(encoder.encode(JSON.stringify({role,exp:Math.floor(Date.now()/1000)+SESSION_SECONDS})));
  return `${payload}.${base64Url(await hmac(payload,secret))}`;
}

async function readSession(request, env) {
  if (!env.FCG_SESSION_SECRET) return null;
  const cookies = request.headers.get("cookie") || "";
  const value = cookies.split(";").map(part=>part.trim()).find(part=>part.startsWith("fcg_session="))?.slice(12);
  if (!value) return null;
  const [payload,signature,...extra] = value.split(".");
  if (!payload || !signature || extra.length) return null;
  try {
    if (!constantTimeEqual(parseBase64Url(signature),await hmac(payload,env.FCG_SESSION_SECRET))) return null;
    const decoded = JSON.parse(new TextDecoder().decode(parseBase64Url(payload)));
    if (!ROLES.includes(decoded.role) || decoded.exp < Math.floor(Date.now()/1000)) return null;
    return decoded;
  } catch (_) { return null; }
}

function requireOrigin(request) {
  const origin = request.headers.get("origin");
  return origin && origin === new URL(request.url).origin;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 250000) throw new Error("PAYLOAD_TOO_LARGE");
  return text ? JSON.parse(text) : {};
}

function clientKey(request) {
  return `${request.headers.get("cf-connecting-ip") || "unknown"}|${(request.headers.get("user-agent") || "").slice(0,120)}`;
}

async function loginLimit(db, request) {
  const keyHash = base64Url(await sha256(clientKey(request))), now = Date.now();
  const row = await db.prepare("SELECT attempts, window_started FROM login_attempts WHERE key_hash = ?").bind(keyHash).first();
  const blocked = row && now - Number(row.window_started) < LOGIN_WINDOW_MS && Number(row.attempts) >= MAX_LOGIN_ATTEMPTS;
  return { keyHash, now, row, blocked };
}

async function recordFailure(db, limit) {
  if (!limit.row || limit.now - Number(limit.row.window_started) >= LOGIN_WINDOW_MS) {
    await db.prepare("INSERT INTO login_attempts (key_hash, window_started, attempts) VALUES (?, ?, 1) ON CONFLICT(key_hash) DO UPDATE SET window_started = excluded.window_started, attempts = 1").bind(limit.keyHash,limit.now).run();
  } else {
    await db.prepare("UPDATE login_attempts SET attempts = attempts + 1 WHERE key_hash = ?").bind(limit.keyHash).run();
  }
}

async function authenticatePassword(password, env) {
  const configured = await env.DB.prepare("SELECT role, password_hash FROM auth_passwords WHERE role IN ('leadership', 'staff', 'general')").all();
  if ((configured.results || []).length) {
    if (!env.FCG_PASSWORD_PEPPER) throw new Error("PASSWORD_PEPPER_MISSING");
    const supplied = await hmac(password,env.FCG_PASSWORD_PEPPER);
    let role = null;
    for (const candidate of configured.results || []) {
      let digest;
      try { digest=parseBase64Url(candidate.password_hash); } catch (_) { digest=new Uint8Array(); }
      if (ROLES.includes(candidate.role) && constantTimeEqual(supplied,digest)) role=candidate.role;
    }
    return role;
  }

  const supplied = await sha256(password);
  const candidates = [
    ["leadership",env.FCG_LEADERSHIP_PASSWORD],
    ["staff",env.FCG_STAFF_PASSWORD],
    ["general",env.FCG_GENERAL_PASSWORD]
  ];
  let role = null;
  for (const [candidateRole,secret] of candidates) {
    const digest = await sha256(secret || crypto.randomUUID());
    if (constantTimeEqual(supplied,digest) && secret) role = candidateRole;
  }
  return role;
}

async function syncPasswordsFromGitHub(request, env) {
  if (!env.FCG_PASSWORD_PEPPER) return json({error:"Die Passwort-Synchronisierung ist noch nicht eingerichtet."},503);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({error:"GitHub-Nachweis fehlt."},401);

  let claims;
  try { claims=await verifyGitHubOidc(authorization.slice(7)); }
  catch (error) { console.error("github_oidc_rejected",error);return json({error:"GitHub-Workflow wurde nicht autorisiert."},403); }

  const replay = await env.DB.prepare("SELECT jti FROM password_sync_events WHERE jti = ?").bind(claims.jti).first();
  if (replay) return json({error:"Dieser GitHub-Nachweis wurde bereits verwendet."},409);

  let body;
  try { body=await readJson(request); } catch (_) { return json({error:"Die Passwortdaten konnten nicht gelesen werden."},400); }
  const passwords = {
    leadership: typeof body.leadership === "string" ? body.leadership : "",
    staff: typeof body.staff === "string" ? body.staff : "",
    general: typeof body.general === "string" ? body.general : ""
  };
  if (Object.values(passwords).some(password=>password.length < PASSWORD_MIN_LENGTH || password.length > 256)) return json({error:`Jedes Passwort muss ${PASSWORD_MIN_LENGTH} bis 256 Zeichen lang sein.`},400);
  if (new Set(Object.values(passwords)).size !== ROLES.length) return json({error:"Für jeden Bereich muss ein anderes Passwort verwendet werden."},400);

  const now = new Date().toISOString();
  const statements = [];
  for (const role of ROLES) {
    const passwordHash = base64Url(await hmac(passwords[role],env.FCG_PASSWORD_PEPPER));
    statements.push(env.DB.prepare("INSERT INTO auth_passwords (role, password_hash, updated_at) VALUES (?, ?, ?) ON CONFLICT(role) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at").bind(role,passwordHash,now));
  }
  statements.push(env.DB.prepare("INSERT INTO password_sync_events (jti, expires_at) VALUES (?, ?)").bind(claims.jti,Number(claims.exp)));
  statements.push(env.DB.prepare("DELETE FROM password_sync_events WHERE expires_at < ?").bind(Math.floor(Date.now()/1000)-3600));
  await env.DB.batch(statements);
  return json({ok:true,updatedAt:now});
}

async function seedPeriod(db, period, overwrite = false) {
  const now = new Date().toISOString();
  const sql = overwrite
    ? "INSERT INTO dashboard_data (period, scope, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(period, scope) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    : "INSERT OR IGNORE INTO dashboard_data (period, scope, payload, updated_at) VALUES (?, ?, ?, ?)";
  await db.batch(SCOPES.map(scope=>db.prepare(sql).bind(period,scope,JSON.stringify(seedData[period][scope]),now)));
}

function visibleScopes(role) {
  if (role === "leadership") return SCOPES;
  if (role === "staff") return ["public","staff"];
  return ["public"];
}

function finite(value, min = 0, max = 100000000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min,Math.min(max,parsed)) : 0;
}
function text(value, max = 120) { return String(value ?? "").trim().slice(0,max); }
function rows(value, mapper) { return Array.isArray(value) ? value.slice(0,60).map(mapper).filter(Boolean) : []; }

function sanitizeScope(scope, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_DATA");
  if (scope === "public") return {
    label:text(value.label,80),dataDate:text(value.dataDate,80),
    kpis:{attendance:finite(value.kpis?.attendance),attendanceDelta:finite(value.kpis?.attendanceDelta,-100,1000)},
    attendance:rows(value.attendance,row=>{const label=text(row?.label,40);return label?{label,onsite:finite(row.onsite),online:finite(row.online)}:null;}),
    topics:rows(value.topics,row=>{const name=text(row?.name,100);return name?{name,views:finite(row.views),delta:finite(row.delta,-100,1000)}:null;})
  };
  if (scope === "staff") return {
    kpis:{services:finite(value.kpis?.services),urgent:finite(value.kpis?.urgent)},
    teams:rows(value.teams,row=>{const name=text(row?.name,100);return name?{name,fill:finite(row.fill,0,100),open:finite(row.open)}:null;}),
    events:rows(value.events,row=>{const name=text(row?.name,100);return name?{name,count:finite(row.count),status:text(row.status,60)}:null;})
  };
  return {
    kpis:{contacts:finite(value.kpis?.contacts),contactsDelta:finite(value.kpis?.contactsDelta,-100,1000),groups:finite(value.kpis?.groups),groupsDelta:finite(value.kpis?.groupsDelta,-10000,10000)},
    journey:{contacts:finite(value.journey?.contacts),nextSteps:finite(value.journey?.nextSteps),groups:finite(value.journey?.groups),teams:finite(value.journey?.teams)}
  };
}

async function handleApi(request, env, pathname) {
  if (!env.DB) return json({error:"Die gemeinsame Datenbank ist derzeit nicht verfügbar."},503);
  if (pathname === "/api/admin/sync-passwords" && request.method === "POST") return syncPasswordsFromGitHub(request,env);
  if (["POST","PUT","PATCH","DELETE"].includes(request.method) && !requireOrigin(request)) return json({error:"Ungültige Anfrage."},403);

  if (pathname === "/api/login" && request.method === "POST") {
    if (!env.FCG_SESSION_SECRET) return json({error:"Die Anmeldung ist noch nicht eingerichtet."},503);
    const limit = await loginLimit(env.DB,request);
    if (limit.blocked) return json({error:"Zu viele Versuche. Bitte in 15 Minuten erneut probieren."},429,{"retry-after":"900"});
    let body; try { body=await readJson(request); } catch (_) { return json({error:"Ungültige Anfrage."},400); }
    const password = typeof body.password === "string" ? body.password.slice(0,256) : "";
    let role;
    try { role=await authenticatePassword(password,env); }
    catch (error) { console.error("password_auth_unavailable",error);return json({error:"Die Anmeldung ist vorübergehend nicht verfügbar."},503); }
    if (!role) { await recordFailure(env.DB,limit); return json({error:"Das Passwort ist nicht korrekt."},401); }
    await env.DB.prepare("DELETE FROM login_attempts WHERE key_hash = ?").bind(limit.keyHash).run();
    const token = await makeSession(role,env.FCG_SESSION_SECRET);
    return json({role},200,{"set-cookie":`fcg_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`});
  }

  if (pathname === "/api/logout" && request.method === "POST") return json({ok:true},200,{"set-cookie":"fcg_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"});
  const session = await readSession(request,env);
  if (!session) return json({error:"Bitte zuerst anmelden."},401);
  if (pathname === "/api/session" && request.method === "GET") return json({role:session.role});

  if (pathname === "/api/data" && request.method === "GET") {
    const period = new URL(request.url).searchParams.get("period") || "90";
    if (!PERIODS.has(period)) return json({error:"Unbekannter Zeitraum."},400);
    await seedPeriod(env.DB,period);
    const allowed = visibleScopes(session.role);
    const result = await env.DB.prepare(`SELECT scope, payload, updated_at FROM dashboard_data WHERE period = ? AND scope IN (${allowed.map(()=>"?").join(",")})`).bind(period,...allowed).all();
    const data = {}, dates = [];
    for (const row of result.results || []) { data[row.scope]=JSON.parse(row.payload);dates.push(row.updated_at); }
    return json({role:session.role,period,data,updatedAt:dates.sort().at(-1)||null});
  }

  if (pathname === "/api/data" && request.method === "PUT") {
    let body; try { body=await readJson(request); } catch (_) { return json({error:"Die Daten konnten nicht gelesen werden."},400); }
    if (!PERIODS.has(body.period) || !body.scopes || typeof body.scopes !== "object") return json({error:"Ungültiger Zeitraum oder Datenbereich."},400);
    const requested = Object.keys(body.scopes);
    const writable = session.role === "leadership" ? SCOPES : session.role === "staff" ? ["staff"] : [];
    if (!requested.length || requested.some(scope=>!writable.includes(scope))) return json({error:"Für diesen Datenbereich besteht kein Schreibrecht."},403);
    const now = new Date().toISOString(), statements = [];
    try {
      for (const scope of requested) statements.push(env.DB.prepare("INSERT INTO dashboard_data (period, scope, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(period, scope) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at").bind(body.period,scope,JSON.stringify(sanitizeScope(scope,body.scopes[scope])),now));
    } catch (_) { return json({error:"Mindestens ein Datenfeld ist ungültig."},400); }
    await env.DB.batch(statements);
    return json({ok:true,updatedAt:now});
  }

  if (pathname === "/api/reset" && request.method === "POST") {
    if (session.role !== "leadership") return json({error:"Nur das Leitungsteam darf alle Startwerte wiederherstellen."},403);
    for (const period of PERIODS) await seedPeriod(env.DB,period,true);
    return json({ok:true});
  }

  return json({error:"Nicht gefunden."},404);
}

function serveAsset(pathname) {
  const asset = ASSETS[pathname];
  if (!asset) return new Response("Not found",{status:404,headers:securityHeaders()});
  const bytes = Uint8Array.from(atob(asset.body),character=>character.charCodeAt(0));
  const headers = {"content-type":asset.contentType,...securityHeaders()};
  if (pathname === "/" || pathname === "/index.html") headers["cache-control"] = "no-store";
  else if (pathname === "/service-worker.js") { headers["cache-control"]="no-cache";headers["service-worker-allowed"]="/"; }
  else headers["cache-control"] = "public, max-age=300";
  if (pathname.endsWith(".xlsx")) headers["content-disposition"]='attachment; filename="FCG_Dashboard_Datenvorlage.xlsx"';
  return new Response(bytes,{headers});
}

export default {
  async fetch(request, env) {
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname.startsWith("/api/")) return await handleApi(request,env,pathname);
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed",{status:405,headers:{allow:"GET, HEAD",...securityHeaders()}});
      if (pathname === "/FCG_Dashboard_Datenvorlage.xlsx") {
        const session = await readSession(request,env);
        if (!session || session.role === "general") return json({error:"Für diese Vorlage besteht kein Zugriff."},403);
      }
      return serveAsset(pathname);
    } catch (error) {
      console.error("request_failed",error);
      return json({error:"Die App ist vorübergehend nicht verfügbar."},500);
    }
  }
};
