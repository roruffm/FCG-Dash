const clone = value => JSON.parse(JSON.stringify(value));
const number = value => new Intl.NumberFormat("de-DE").format(Number(value) || 0);
const decimal = value => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: Number(value) % 1 ? 1 : 0 }).format(Number(value) || 0);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
const numeric = value => Number.isFinite(Number(String(value).replace(",", "."))) ? Number(String(value).replace(",", ".")) : 0;
const roleRank = { general: 0, staff: 1, leadership: 2 };
const roleNames = { general: "Allgemeiner Bereich", staff: "Mitarbeiterteam", leadership: "Leitungsteam" };
const dashboardViews = {
  overview: { label:"Gesamtüberblick", title:"Was bewegt die FCG?", description:"Die wichtigsten Entwicklungen im", minRole:"general" },
  worship: { label:"Gottesdienste & Reichweite", title:"Gottesdienste & Reichweite", description:"Besuche vor Ort und online im", minRole:"general" },
  community: { label:"Gemeinschaft & Wachstum", title:"Gemeinschaft & Wachstum", description:"Der Weg vom ersten Kontakt zum Mitmachen im", minRole:"leadership" },
  teams: { label:"Mitarbeit & Veranstaltungen", title:"Mitarbeit & Veranstaltungen", description:"Dienstbedarf, Kurse und nächste Schritte im", minRole:"staff" },
  content: { label:"Inhalte & Themen", title:"Inhalte & Themen", description:"Was Menschen in Predigten und Impulsen beschäftigt im", minRole:"general" }
};

const emptyData = () => ({
  label: "gewählten Zeitraum", dataDate: "–",
  kpis: { attendance: 0, attendanceDelta: 0, contacts: 0, contactsDelta: 0, groups: 0, groupsDelta: 0, services: 0, urgent: 0 },
  journey: { contacts: 0, nextSteps: 0, groups: 0, teams: 0 }, attendance: [], teams: [], topics: [], events: []
});

let session = null;
let currentData = emptyData();
let workingData = null;
let deferredInstallPrompt = null;
const state = { period: "90", view: "overview", teamsSorted: false, chartType: "line" };
try { state.view = localStorage.getItem("fcg-dashboard-view") || "overview"; } catch (_) {}
try { state.chartType = localStorage.getItem("fcg-chart-type") || "line"; } catch (_) {}
if (!["line","area","bar"].includes(state.chartType)) state.chartType = "line";

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3400);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  let payload = null;
  try { payload = await response.json(); } catch (_) {}
  if (response.status === 401 && path !== "/api/login") {
    showLogin("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
    throw new Error("Sitzung abgelaufen");
  }
  if (!response.ok) throw new Error(payload?.error || "Die Anfrage konnte nicht ausgeführt werden.");
  return payload;
}

function showLogin(message = "") {
  session = null;
  document.getElementById("appShell").hidden = true;
  document.getElementById("loginScreen").hidden = false;
  document.getElementById("loginError").textContent = message;
  document.getElementById("passwordInput").value = "";
  setTimeout(() => document.getElementById("passwordInput").focus(), 30);
}

function showApp(role) {
  session = { role };
  document.getElementById("loginScreen").hidden = true;
  document.getElementById("appShell").hidden = false;
  document.getElementById("appShell").dataset.role = role;
  document.getElementById("sidebarRole").textContent = roleNames[role];
  document.getElementById("roleEyebrow").textContent = roleNames[role];
  document.getElementById("topRole").textContent = roleNames[role];
  applyPermissions();
}

function applyPermissions() {
  const rank = roleRank[session?.role] ?? -1;
  const canEdit = rank >= roleRank.staff;
  document.getElementById("editButton").hidden = !canEdit;
  document.getElementById("importButton").hidden = !canEdit;
  document.getElementById("excelInput").disabled = !canEdit;
  document.querySelectorAll("[data-editor-scope]").forEach(section => {
    section.hidden = session.role === "staff" && section.dataset.editorScope !== "staff";
  });
  const available = Object.entries(dashboardViews).filter(([,view])=>rank >= roleRank[view.minRole]);
  const select = document.getElementById("dashboardSelect");
  select.innerHTML = available.map(([key,view])=>`<option value="${key}">${view.label}</option>`).join("");
  if (!available.some(([key])=>key===state.view)) state.view = "overview";
  select.value = state.view;
  applyDashboardView(state.view, false);
}

function applyDashboardView(view, remember = true) {
  const definition = dashboardViews[view] || dashboardViews.overview;
  const rank = roleRank[session?.role] ?? -1;
  if (rank < roleRank[definition.minRole]) view = "overview";
  state.view = view;
  const selected = dashboardViews[view];
  document.getElementById("appShell").dataset.dashboardView = view;
  document.getElementById("dashboardSelect").value = view;
  document.getElementById("dashboardTitle").textContent = selected.title;
  document.getElementById("viewEyebrow").textContent = selected.label;
  document.getElementById("dashboardDescription").textContent = selected.description;
  document.querySelectorAll("[data-role-min], [data-dashboard]").forEach(element => {
    const roleAllowed = !element.dataset.roleMin || rank >= roleRank[element.dataset.roleMin];
    const viewAllowed = !element.dataset.dashboard || view === "overview" || element.dataset.dashboard === view;
    element.hidden = !(roleAllowed && viewAllowed);
  });
  document.querySelectorAll("[data-dashboard-target]").forEach(link=>link.classList.toggle("active",link.dataset.dashboardTarget===view));
  if (remember) { try { localStorage.setItem("fcg-dashboard-view",view); } catch (_) {} }
}

function mergeScopes(payload) {
  const result = emptyData();
  const publicData = payload.data.public || {};
  const staffData = payload.data.staff || {};
  const leadershipData = payload.data.leadership || {};
  result.label = publicData.label || result.label;
  result.dataDate = publicData.dataDate || result.dataDate;
  Object.assign(result.kpis, publicData.kpis || {}, staffData.kpis || {}, leadershipData.kpis || {});
  result.attendance = Array.isArray(publicData.attendance) ? publicData.attendance : [];
  result.topics = Array.isArray(publicData.topics) ? publicData.topics : [];
  result.teams = Array.isArray(staffData.teams) ? staffData.teams : [];
  result.events = Array.isArray(staffData.events) ? staffData.events : [];
  result.journey = { ...result.journey, ...(leadershipData.journey || {}) };
  return result;
}

async function loadPeriod(period = state.period) {
  document.getElementById("appShell").classList.add("loading-overlay");
  try {
    const payload = await api(`/api/data?period=${encodeURIComponent(period)}`);
    state.period = period;
    currentData = mergeScopes(payload);
    document.getElementById("periodSelect").value = period;
    document.getElementById("saveStatus").textContent = payload.updatedAt
      ? `Gemeinsam gespeichert: ${new Date(payload.updatedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`
      : "Gemeinsamer Datenstand geladen";
    render();
  } catch (error) {
    if (session) showToast(error.message);
  } finally {
    document.getElementById("appShell").classList.remove("loading-overlay");
  }
}

function makeSparkline(values, color) {
  const clean = values.length > 1 ? values : [0, values[0] || 0];
  const w = 230, h = 28, min = Math.min(...clean), max = Math.max(...clean), range = max - min || 1;
  const points = clean.map((value, index) => `${index*w/(clean.length-1)},${h-3-((value-min)/range)*(h-7)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="M0 ${h-1} H${w}" stroke="#d8e3e4"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>`;
}

function seriesFromDelta(current, delta) {
  const start = Number(delta) === -100 ? current : current / (1 + Number(delta || 0) / 100);
  return Array.from({ length: 7 }, (_, index) => start + (current-start) * index/6);
}

function chartPath(values, width, height, pad, min, max) {
  return values.map((value,index) => {
    const x = pad + index*(width-pad*2)/(values.length-1), y = height-pad-((value-min)/(max-min||1))*(height-pad*2);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function renderAttendanceChart(data) {
  const svg = document.getElementById("lineChart"), width = 740, height = 280, pad = 36;
  const onsite = data.attendance.map(row => numeric(row.onsite)), online = data.attendance.map(row => numeric(row.online));
  if (onsite.length < 2) {
    svg.innerHTML = '<text x="370" y="140" text-anchor="middle" fill="#557276" font-size="15">Noch nicht genügend Verlaufsdaten</text>';
    return;
  }
  const all = [...onsite,...online], min = state.chartType === "line" ? Math.floor(Math.min(...all)/100)*100 : 0, max = Math.max(min+100,Math.ceil(Math.max(...all)/100)*100);
  const grid = Array.from({length:5},(_,index) => { const y=pad+index*(height-pad*2)/4,val=Math.round(max-index*(max-min)/4); return `<line x1="${pad}" y1="${y}" x2="${width-pad}" y2="${y}" stroke="#d8e3e4"/><text x="4" y="${y+4}" fill="#557276" font-size="11">${val}</text>`; }).join("");
  const labels = data.attendance.map(row=>escapeHtml(row.label)), skip = Math.max(1,Math.ceil(labels.length/12));
  const labelX = index => state.chartType === "bar" ? pad+(index+.5)*(width-pad*2)/labels.length : pad+index*(width-pad*2)/(labels.length-1);
  const xLabels = labels.map((label,index)=>index%skip===0?`<text x="${labelX(index)}" y="${height-8}" text-anchor="middle" fill="#557276" font-size="10">${label}</text>`:"").join("");
  const onsitePath = chartPath(onsite,width,height,pad,min,max), onlinePath = chartPath(online,width,height,pad,min,max);
  let series;
  if (state.chartType === "area") {
    const baseline = height-pad, firstX = pad, lastX = width-pad;
    series = `<path d="${onsitePath} L${lastX},${baseline} L${firstX},${baseline} Z" fill="#006269" fill-opacity=".19"/><path d="${onlinePath} L${lastX},${baseline} L${firstX},${baseline} Z" fill="#72a4a8" fill-opacity=".28"/><path d="${onsitePath}" fill="none" stroke="#006269" stroke-width="4" stroke-linejoin="round"/><path d="${onlinePath}" fill="none" stroke="#72a4a8" stroke-width="3" stroke-linejoin="round"/>`;
    svg.setAttribute("aria-label","Flächendiagramm zu Gottesdienstbesuchen vor Ort und online");
  } else if (state.chartType === "bar") {
    const groupWidth = (width-pad*2)/onsite.length, barWidth = Math.max(5,Math.min(18,groupWidth*.28)), baseline = height-pad;
    series = onsite.map((value,index)=>{
      const center = pad+groupWidth*(index+.5), onsiteY = baseline-((value-min)/(max-min||1))*(height-pad*2), onlineY = baseline-((online[index]-min)/(max-min||1))*(height-pad*2);
      return `<g><title>${labels[index]}: Vor Ort ${number(value)}, Online ${number(online[index])}</title><rect x="${(center-barWidth-2).toFixed(1)}" y="${onsiteY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0,baseline-onsiteY).toFixed(1)}" rx="3" fill="#006269"/><rect x="${(center+2).toFixed(1)}" y="${onlineY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0,baseline-onlineY).toFixed(1)}" rx="3" fill="#72a4a8"/></g>`;
    }).join("");
    svg.setAttribute("aria-label","Balkendiagramm zu Gottesdienstbesuchen vor Ort und online");
  } else {
    series = `<path d="${onsitePath}" fill="none" stroke="#006269" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="${onlinePath}" fill="none" stroke="#72a4a8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg.setAttribute("aria-label","Liniendiagramm zu Gottesdienstbesuchen vor Ort und online");
  }
  svg.innerHTML = `${grid}${xLabels}${series}`;
}

function renderInsights(data) {
  const needs = [...data.teams].sort((a,b)=>numeric(a.fill)-numeric(b.fill))[0];
  const event = data.events[0];
  const attendanceText = data.kpis.attendanceDelta >= 0 ? "über" : "unter";
  const items = [
    ["Reichweite",`Die Gottesdienstbesuche liegen ${decimal(Math.abs(data.kpis.attendanceDelta))} % ${attendanceText} dem Vergleichszeitraum.`],
    ["Dienstteams",needs?`${escapeHtml(needs.name)} hat mit ${decimal(needs.fill)} % die niedrigste Besetzungsquote.`:"Noch keine Dienstteams eingetragen."],
    ["Veranstaltungen",event?`${escapeHtml(event.name)}: ${number(event.count)} Anmeldungen, Status „${escapeHtml(event.status)}“.`:"Noch keine Veranstaltungen eingetragen."]
  ];
  document.getElementById("insightGrid").innerHTML = items.map(([title,text])=>`<div class="insight"><strong>${title}</strong><p>${text}</p></div>`).join("");
}

function renderJourney(data) {
  const rows = [["Neue Kontakte",data.journey.contacts],["NEXT STEPS",data.journey.nextSteps],["Connectgruppe",data.journey.groups],["Dienstteam",data.journey.teams]];
  const max = Math.max(1,numeric(rows[0][1]));
  document.getElementById("journey").innerHTML = rows.map(([label,value])=>`<div class="journey-row"><span>${label}</span><div class="journey-bar"><i style="width:${Math.min(100,Math.max(4,numeric(value)/max*100))}%"></i></div><strong>${number(value)}</strong></div>`).join("");
  document.getElementById("journeyRate").textContent = `${Math.round(numeric(data.journey.groups)/max*100)} %`;
}

function renderTeams(data) {
  let teams = [...data.teams];
  if (state.teamsSorted) teams.sort((a,b)=>numeric(a.fill)-numeric(b.fill));
  document.getElementById("teamList").innerHTML = teams.length ? teams.map(team=>{ const fill=Math.max(0,Math.min(100,numeric(team.fill))),critical=fill<80,color=critical?"#c84f43":fill<90?"#72a4a8":"#006269"; return `<div class="team-row"><div class="team-label"><strong>${escapeHtml(team.name)}</strong><span>${number(team.open)} offen</span></div><div class="progress"><i style="width:${fill}%;--bar-color:${color}"></i></div><span class="team-status ${critical?"critical":""}">${decimal(fill)} %</span></div>`; }).join("") : '<p class="panel-intro">Noch keine Dienstteams eingetragen.</p>';
}

function renderTopics(data) {
  document.getElementById("topicList").innerHTML = data.topics.length ? data.topics.map(topic=>`<div class="topic"><span>${number(topic.views)} Aufrufe</span><strong>${escapeHtml(topic.name)}</strong><b>${numeric(topic.delta)>=0?"+":""}${decimal(topic.delta)} %</b></div>`).join("") : '<p class="panel-intro">Noch keine Themen eingetragen.</p>';
}

function eventKind(status) {
  const value = String(status).toLowerCase();
  if (value.includes("voll") || value.includes("wart")) return "watch";
  if (value.includes("frei") || value.includes("offen")) return "open";
  return "good";
}

function renderEvents(data) {
  document.getElementById("eventRows").innerHTML = data.events.length ? data.events.map(event=>`<div class="table-row" role="row"><strong>${escapeHtml(event.name)}</strong><span>${number(event.count)}</span><span class="table-status ${eventKind(event.status)}">${escapeHtml(event.status)}</span></div>`).join("") : '<div class="table-row"><span>Noch keine Veranstaltungen eingetragen.</span></div>';
}

function render() {
  const data = currentData;
  document.getElementById("periodLabel").textContent = data.label;
  document.getElementById("attendanceValue").textContent = number(data.kpis.attendance);
  document.getElementById("attendanceDelta").textContent = `${data.kpis.attendanceDelta>=0?"+":""}${decimal(data.kpis.attendanceDelta)} %`;
  document.getElementById("contactsValue").textContent = number(data.kpis.contacts);
  document.getElementById("contactsDelta").textContent = `${data.kpis.contactsDelta>=0?"+":""}${decimal(data.kpis.contactsDelta)} %`;
  document.getElementById("groupsValue").textContent = number(data.kpis.groups);
  document.getElementById("groupsDelta").textContent = `${data.kpis.groupsDelta>=0?"+":""}${number(data.kpis.groupsDelta)} Gruppen`;
  document.getElementById("servicesValue").textContent = number(data.kpis.services);
  document.getElementById("servicesDelta").textContent = `${number(data.kpis.urgent)} dringend`;
  document.getElementById("attendanceSpark").innerHTML = makeSparkline(data.attendance.map(row=>numeric(row.onsite)),"#006269");
  document.getElementById("contactsSpark").innerHTML = makeSparkline(seriesFromDelta(data.kpis.contacts,data.kpis.contactsDelta),"#00444b");
  document.getElementById("groupsSpark").innerHTML = makeSparkline(seriesFromDelta(data.kpis.groups,data.kpis.groupsDelta),"#72a4a8");
  document.getElementById("servicesSpark").innerHTML = makeSparkline(seriesFromDelta(data.kpis.services,0),"#c84f43");
  const avg = data.attendance.length ? Math.round(data.attendance.reduce((sum,row)=>sum+numeric(row.onsite),0)/data.attendance.length) : 0;
  const onlineAvg = data.attendance.length ? data.attendance.reduce((sum,row)=>sum+numeric(row.online),0)/data.attendance.length : 0;
  document.getElementById("avgAttendance").textContent = `Ø ${number(avg)}`;
  document.getElementById("onlineShare").textContent = `${avg?Math.round(onlineAvg/avg*100):0} %`;
  document.getElementById("chartTypeSelect").value = state.chartType;
  renderAttendanceChart(data); renderTopics(data);
  if (roleRank[session.role] >= roleRank.staff) { renderInsights(data); renderTeams(data); renderEvents(data); }
  if (session.role === "leadership") renderJourney(data);
}

const metricFields = {
  leadership: [
    ["Berichtsbezeichnung","label","text"],["Datenstand","dataDate","text"],
    ["Gottesdienstbesuche","kpis.attendance","number"],["Veränderung Besuche (%)","kpis.attendanceDelta","number"],
    ["Neue Kontakte","kpis.contacts","number"],["Veränderung Kontakte (%)","kpis.contactsDelta","number"],
    ["Aktive Connectgruppen","kpis.groups","number"],["Neue Connectgruppen","kpis.groupsDelta","number"],
    ["Offene Dienste","kpis.services","number"],["Dringende Dienste","kpis.urgent","number"],
    ["NEXT STEPS","journey.nextSteps","number"],["Connectgruppen-Zuordnungen","journey.groups","number"],["Dienstteam-Zuordnungen","journey.teams","number"]
  ],
  staff: [["Offene Dienste","kpis.services","number"],["Dringende Dienste","kpis.urgent","number"]]
};
const editorColumns = {
  attendance:[{key:"label",label:"Bezeichnung",type:"text"},{key:"onsite",label:"Vor Ort",type:"number"},{key:"online",label:"Online",type:"number"}],
  teams:[{key:"name",label:"Team",type:"text"},{key:"fill",label:"Besetzung (%)",type:"number"},{key:"open",label:"Offen",type:"number"}],
  topics:[{key:"name",label:"Thema",type:"text"},{key:"views",label:"Aufrufe",type:"number"},{key:"delta",label:"Veränderung (%)",type:"number"}],
  events:[{key:"name",label:"Name",type:"text"},{key:"count",label:"Anmeldungen",type:"number"},{key:"status",label:"Status",type:"text"}]
};

function getPath(object,path){ return path.split(".").reduce((value,key)=>value?.[key],object); }
function setPath(object,path,value){ const keys=path.split("."),final=keys.pop(),target=keys.reduce((value,key)=>value[key],object); target[final]=value; }
function editorRow(section,item,index,columns) {
  const inputs = columns.map(column=>`<input ${column.type==="number"?`type="number" step="any" ${column.key==="delta"?"":'min="0"'}`:'type="text"'} value="${escapeHtml(item[column.key])}" data-section="${section}" data-index="${index}" data-field="${column.key}" aria-label="${escapeHtml(column.label)}">`).join("");
  return `<div class="editor-row">${inputs}<button class="remove-row" type="button" data-remove="${section}" data-index="${index}" aria-label="Zeile entfernen">×</button></div>`;
}
function renderEditorSection(section) {
  const columns = editorColumns[section];
  const header = `<div class="editor-row headers">${columns.map(column=>`<span>${column.label}</span>`).join("")}<span></span></div>`;
  document.getElementById(`${section}Editor`).innerHTML = header + workingData[section].map((item,index)=>editorRow(section,item,index,columns)).join("");
}
function openEditor() {
  workingData = clone(currentData);
  document.getElementById("editPeriodNote").textContent = `Bearbeitet wird: ${document.querySelector("#periodSelect option:checked").textContent}`;
  document.getElementById("metricInputs").innerHTML = metricFields[session.role].map(([label,path,type])=>`<div class="field"><label>${label}<input type="${type}" ${type==="number"?`step="any" ${path.includes("Delta")?"":'min="0"'}`:""} value="${escapeHtml(getPath(workingData,path))}" data-metric="${path}"></label></div>`).join("");
  const sections = session.role === "leadership" ? ["attendance","teams","topics","events"] : ["teams","events"];
  sections.forEach(renderEditorSection);
  document.getElementById("editDialog").showModal();
}

function splitScopes(data, role) {
  const scopes = {};
  if (role === "leadership") {
    scopes.public = { label:data.label, dataDate:data.dataDate, kpis:{attendance:data.kpis.attendance,attendanceDelta:data.kpis.attendanceDelta}, attendance:data.attendance, topics:data.topics };
    scopes.leadership = { kpis:{contacts:data.kpis.contacts,contactsDelta:data.kpis.contactsDelta,groups:data.kpis.groups,groupsDelta:data.kpis.groupsDelta}, journey:{...data.journey,contacts:data.kpis.contacts} };
  }
  if (role === "leadership" || role === "staff") scopes.staff = { kpis:{services:data.kpis.services,urgent:data.kpis.urgent}, teams:data.teams, events:data.events };
  return scopes;
}

async function saveWorkingData(message = "Änderungen gemeinsam gespeichert") {
  const button = document.querySelector('#editForm button[type="submit"]');
  button.disabled = true; button.textContent = "Wird gespeichert …";
  try {
    await api("/api/data", { method:"PUT", body:JSON.stringify({ period:state.period, scopes:splitScopes(workingData,session.role) }) });
    document.getElementById("editDialog").close();
    await loadPeriod();
    showToast(message);
  } finally {
    button.disabled = false; button.textContent = "Änderungen speichern";
  }
}

document.getElementById("editDialog").addEventListener("input",event=>{
  if (event.target.dataset.metric) setPath(workingData,event.target.dataset.metric,event.target.type==="number"?numeric(event.target.value):event.target.value);
  else if (event.target.dataset.section) { const {section,index,field}=event.target.dataset; workingData[section][Number(index)][field]=event.target.type==="number"?numeric(event.target.value):event.target.value; }
});
document.getElementById("editDialog").addEventListener("click",event=>{ const remove=event.target.dataset.remove; if(remove){workingData[remove].splice(Number(event.target.dataset.index),1);renderEditorSection(remove);} });
document.querySelectorAll(".add-row").forEach(button=>button.addEventListener("click",()=>{ const section=button.dataset.section; if(session.role==="staff"&&!['teams','events'].includes(section))return; const blank={attendance:{label:"",onsite:0,online:0},teams:{name:"",fill:0,open:0},topics:{name:"",views:0,delta:0},events:{name:"",count:0,status:"Im Plan"}}[section]; workingData[section].push(blank);renderEditorSection(section); }));
document.getElementById("editForm").addEventListener("submit",async event=>{ event.preventDefault(); try{await saveWorkingData();}catch(error){showToast(error.message);} });
document.querySelectorAll("[data-close-dialog]").forEach(button=>button.addEventListener("click",()=>document.getElementById("editDialog").close()));

function readUint16(view,offset){return view.getUint16(offset,true);}
function readUint32(view,offset){return view.getUint32(offset,true);}
async function unzipXlsx(buffer) {
  const bytes=new Uint8Array(buffer),view=new DataView(buffer); let eocd=-1;
  for(let index=bytes.length-22;index>=Math.max(0,bytes.length-65558);index--){if(readUint32(view,index)===0x06054b50){eocd=index;break;}}
  if(eocd<0) throw new Error("Die Datei ist keine gültige XLSX-Datei.");
  const entriesCount=readUint16(view,eocd+10),directoryOffset=readUint32(view,eocd+16),decoder=new TextDecoder(),entries=new Map(); let pointer=directoryOffset;
  for(let index=0;index<entriesCount;index++){
    if(readUint32(view,pointer)!==0x02014b50) throw new Error("Das Excel-Archiv ist beschädigt.");
    const method=readUint16(view,pointer+10),compressedSize=readUint32(view,pointer+20),nameLength=readUint16(view,pointer+28),extraLength=readUint16(view,pointer+30),commentLength=readUint16(view,pointer+32),localOffset=readUint32(view,pointer+42);
    const name=decoder.decode(bytes.slice(pointer+46,pointer+46+nameLength)),localNameLength=readUint16(view,localOffset+26),localExtraLength=readUint16(view,localOffset+28),start=localOffset+30+localNameLength+localExtraLength,compressed=bytes.slice(start,start+compressedSize); let content;
    if(method===0) content=compressed;
    else if(method===8){ if(typeof DecompressionStream==="undefined") throw new Error("Dieser Browser kann Excel-Dateien nicht entpacken."); content=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); }
    else throw new Error(`Nicht unterstützte Excel-Komprimierung (${method}).`);
    entries.set(name,content); pointer+=46+nameLength+extraLength+commentLength;
  }
  return entries;
}
function xml(entries,path){const bytes=entries.get(path);return bytes?new DOMParser().parseFromString(new TextDecoder().decode(bytes),"application/xml"):null;}
function elements(document,name){return [...document.getElementsByTagNameNS("*",name)];}
function columnIndex(reference){const letters=String(reference).match(/[A-Z]+/)?.[0]||"A";return [...letters].reduce((value,char)=>value*26+char.charCodeAt(0)-64,0)-1;}
function sheetRows(document,sharedStrings) {
  const rows=[]; elements(document,"c").forEach(cell=>{const reference=cell.getAttribute("r")||"A1",rowIndex=(Number(reference.match(/\d+/)?.[0])||1)-1,colIndex=columnIndex(reference),type=cell.getAttribute("t");let value="";if(type==="inlineStr")value=elements(cell,"t").map(node=>node.textContent||"").join("");else{const raw=elements(cell,"v")[0]?.textContent??"";if(type==="s")value=sharedStrings[Number(raw)]??"";else if(type==="str")value=raw;else value=raw!==""&&!Number.isNaN(Number(raw))?Number(raw):raw;}rows[rowIndex]??=[];rows[rowIndex][colIndex]=value;}); return rows;
}
async function parseWorkbook(file) {
  const entries=await unzipXlsx(await file.arrayBuffer()),sharedDoc=xml(entries,"xl/sharedStrings.xml"),shared=sharedDoc?elements(sharedDoc,"si").map(item=>elements(item,"t").map(node=>node.textContent||"").join("")):[],workbookDoc=xml(entries,"xl/workbook.xml"),relsDoc=xml(entries,"xl/_rels/workbook.xml.rels");
  if(!workbookDoc||!relsDoc) throw new Error("Die Excel-Arbeitsmappe ist unvollständig.");
  const relations=new Map(elements(relsDoc,"Relationship").map(rel=>[rel.getAttribute("Id"),rel.getAttribute("Target")])),sheets={};
  for(const sheet of elements(workbookDoc,"sheet")){const relationshipId=sheet.getAttribute("r:id")||sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id"),name=sheet.getAttribute("name"),target=relations.get(relationshipId);if(!target)continue;const normalized=target.startsWith("/")?target.slice(1):`xl/${target.replace(/^\.\.\//,"")}`,document=xml(entries,normalized);if(document)sheets[name]=sheetRows(document,shared);} return sheets;
}
function dataRows(sheet){return (sheet||[]).slice(4).filter(row=>row&&row.some(value=>value!==undefined&&value!==""));}
function guessPeriod(value){const label=String(value||"").toLowerCase();if(label.includes("30")||label.includes("monat"))return"30";if(label.includes("jahr")||label.includes("365"))return"365";return"90";}
async function importSheets(sheets) {
  const keyValues=Object.fromEntries(dataRows(sheets.Kennzahlen).map(row=>[String(row[0]||"").trim(),row[1]]));
  if(!Object.keys(keyValues).length) throw new Error('Das Tabellenblatt "Kennzahlen" wurde nicht gefunden oder ist leer.');
  const target=guessPeriod(keyValues["Berichtszeitraum"]); if(target!==state.period) await loadPeriod(target);
  workingData=clone(currentData);
  if(session.role==="leadership"){
    workingData.label=String(keyValues["Berichtszeitraum"]||workingData.label);workingData.dataDate=String(keyValues["Datenstand"]||workingData.dataDate);
    workingData.kpis.attendance=numeric(keyValues["Gottesdienstbesuche"]);workingData.kpis.attendanceDelta=numeric(keyValues["Veränderung Gottesdienstbesuche (%)"]);workingData.kpis.contacts=numeric(keyValues["Neue Kontakte"]);workingData.kpis.contactsDelta=numeric(keyValues["Veränderung neue Kontakte (%)"]);workingData.kpis.groups=numeric(keyValues["Aktive Connectgruppen"]);workingData.kpis.groupsDelta=numeric(keyValues["Veränderung Connectgruppen (Anzahl)"]);
    workingData.journey={contacts:workingData.kpis.contacts,nextSteps:numeric(keyValues["NEXT STEPS"]),groups:numeric(keyValues["Neue Connectgruppen-Zuordnungen"]),teams:numeric(keyValues["Neue Dienstteam-Zuordnungen"])};
    const attendance=dataRows(sheets.Verlauf).map(row=>({label:String(row[0]||""),onsite:numeric(row[1]),online:numeric(row[2])})).filter(row=>row.label),topics=dataRows(sheets.Themen).map(row=>({name:String(row[0]||""),views:numeric(row[1]),delta:numeric(row[2])})).filter(row=>row.name);if(attendance.length)workingData.attendance=attendance;if(topics.length)workingData.topics=topics;
  }
  workingData.kpis.services=numeric(keyValues["Offene Dienste"]);workingData.kpis.urgent=numeric(keyValues["Dringende Dienste"]);
  const teams=dataRows(sheets.Dienstteams).map(row=>({name:String(row[0]||""),fill:numeric(row[1]),open:numeric(row[2])})).filter(row=>row.name),events=dataRows(sheets.Veranstaltungen).map(row=>({name:String(row[0]||""),count:numeric(row[1]),status:String(row[2]||"Im Plan")})).filter(row=>row.name);if(teams.length)workingData.teams=teams;if(events.length)workingData.events=events;
  await api("/api/data",{method:"PUT",body:JSON.stringify({period:target,scopes:splitScopes(workingData,session.role)})});await loadPeriod(target);
}

document.getElementById("loginForm").addEventListener("submit",async event=>{
  event.preventDefault(); const submit=event.submitter,password=document.getElementById("passwordInput").value; submit.disabled=true;submit.textContent="Wird geprüft …";document.getElementById("loginError").textContent="";
  try{const result=await api("/api/login",{method:"POST",body:JSON.stringify({password})});showApp(result.role);await loadPeriod();}
  catch(error){document.getElementById("loginError").textContent=error.message;}
  finally{submit.disabled=false;submit.textContent="Sicher anmelden";}
});
document.getElementById("togglePassword").addEventListener("click",event=>{const input=document.getElementById("passwordInput"),visible=input.type==="text";input.type=visible?"password":"text";event.target.textContent=visible?"Anzeigen":"Verbergen";});
document.getElementById("logoutButton").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST",body:"{}"});}catch(_){}showLogin();});
document.getElementById("editButton").addEventListener("click",openEditor);
document.getElementById("dashboardSelect").addEventListener("change",event=>applyDashboardView(event.target.value));
document.getElementById("chartTypeSelect").addEventListener("change",event=>{state.chartType=event.target.value;try{localStorage.setItem("fcg-chart-type",state.chartType);}catch(_){}renderAttendanceChart(currentData);});
document.getElementById("periodSelect").addEventListener("change",event=>loadPeriod(event.target.value));
document.getElementById("sortTeams").addEventListener("click",event=>{state.teamsSorted=!state.teamsSorted;event.target.textContent=state.teamsSorted?"Standardsortierung":"Nach Bedarf sortieren";renderTeams(currentData);});
document.getElementById("printButton").addEventListener("click",()=>window.print());
document.querySelectorAll("[data-dashboard-target]").forEach(link=>link.addEventListener("click",event=>{event.preventDefault();applyDashboardView(link.dataset.dashboardTarget);window.scrollTo({top:0,behavior:"smooth"});}));
document.getElementById("importButton").addEventListener("click",()=>document.getElementById("excelInput").click());
document.getElementById("excelInput").addEventListener("change",async event=>{const file=event.target.files?.[0];if(!file)return;const button=document.getElementById("importButton"),oldText=button.textContent;button.disabled=true;button.textContent="Wird importiert …";try{await importSheets(await parseWorkbook(file));showToast("Excel-Daten gemeinsam gespeichert");}catch(error){showToast(error.message);}finally{button.disabled=false;button.textContent=oldText;event.target.value="";}});
document.getElementById("backupButton").addEventListener("click",async()=>{try{const datasets={};for(const period of ["30","90","365"]){const payload=await api(`/api/data?period=${period}`);datasets[period]=mergeScopes(payload);}const blob=new Blob([JSON.stringify({app:"FCG Leitungsdashboard",version:5.1,exportedAt:new Date().toISOString(),datasets},null,2)],{type:"application/json"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`FCG_Dashboard_Sicherung_${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);showToast("Datensicherung heruntergeladen");}catch(error){showToast(error.message);}});
document.getElementById("resetButton").addEventListener("click",()=>document.getElementById("resetDialog").showModal());
document.getElementById("confirmReset").addEventListener("click",async()=>{try{await api("/api/reset",{method:"POST",body:"{}"});await loadPeriod();showToast("Startwerte wiederhergestellt");}catch(error){showToast(error.message);}});

const installButton=document.getElementById("installButton"),isInstalled=()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
function updateInstallButton(){if(isInstalled()){installButton.textContent="App ist installiert";installButton.classList.add("installed");}}
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;installButton.textContent="App installieren";});
window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;updateInstallButton();showToast("FCG Dashboard wurde installiert");});
installButton.addEventListener("click",async()=>{if(isInstalled()){showToast("Die App ist bereits installiert");return;}if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;return;}showToast('Im Browsermenü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.');});
if("serviceWorker" in navigator&&location.protocol!=="file:")window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));

async function start(){updateInstallButton();try{const result=await api("/api/session");showApp(result.role);await loadPeriod();}catch(_){showLogin();}}
start();
