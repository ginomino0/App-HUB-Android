// ============================================================
// app.js — tutta la logica dell'app "Fai Da Te Per Tutti"
// Identica alla versione originale, con l'aggiunta della
// registrazione del service worker per il funzionamento come PWA.
// ============================================================

let CATEGORIES = {};
let JOBS = {};

const ACCENTI_CATEGORIA = {
  idraulica: '#4fd1ff',
  elettricita: '#f4c430',
  falegnameria: '#c98a4b',
  muratura: '#e07a5f',
  mobili: '#9b8cf2',
  giardinaggio: '#6fbf73',
  hobby: '#ff8fb1'
};

async function loadCategories() {
  CATEGORIES = window.__CATEGORIES__;
  JOBS = window.__JOBS__;
  renderCategories();
}

function renderCategories() {
  const tabs = document.getElementById('categoriesTabs');
  if (!tabs) return;

  tabs.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button class="category-tab" data-category="${key}" style="--accent:${ACCENTI_CATEGORIA[key] || ''}">
      <span class="category-tab-icon">${cat.icon}</span>
      <span class="category-tab-label">${cat.label}</span>
    </button>
  `).join('');

  tabs.querySelectorAll('.category-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const giaAttiva = btn.classList.contains('active');
      if (giaAttiva) {
        chiudiPannelloCategorie();
      } else {
        selezionaCategoria(btn.dataset.category);
      }
    });
  });
}

function selezionaCategoria(key) {
  document.querySelectorAll('.category-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.category === key);
  });

  const container = document.getElementById('jobsListContainer');
  const title = document.getElementById('jobsListTitle');
  const list = document.getElementById('jobsList');
  const lavori = JOBS[key] || [];

  title.textContent = `Lavori di ${CATEGORIES[key]?.label || key}`;
  list.innerHTML = lavori.length
    ? `<ul class="jobs-ul">${lavori.map(l => `
        <li><button class="job-item" data-job="${encodeURIComponent(l)}">${l}</button></li>
      `).join('')}</ul>`
    : '<p class="muted">Nessun lavoro precaricato per questa categoria.</p>';

  list.querySelectorAll('.job-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const testo = decodeURIComponent(btn.dataset.job);
      const input = document.getElementById('queryInput');
      input.value = testo;
      input.dataset.category = key;
      list.querySelectorAll('.job-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('search-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  container.classList.remove('hidden');
}

function chiudiPannelloCategorie() {
  document.getElementById('jobsListContainer').classList.add('hidden');
  document.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
}

document.addEventListener('components:ready', () => {
  const closeBtn = document.getElementById('jobsPanelClose');
  if (closeBtn) closeBtn.addEventListener('click', chiudiPannelloCategorie);
});

document.addEventListener('components:ready', loadCategories);


// ------------------------------------------------------------
// api-key.js — gestione chiave API (solo browser, localStorage)
// ------------------------------------------------------------

const API_KEY_STORAGE_KEY = 'faidate_api_key';

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
}

function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

function initApiKeyUI() {
  const btn = document.getElementById('apiKeyBtn');
  const overlay = document.getElementById('apiModalOverlay');
  const input = document.getElementById('apiKeyInput');
  const status = document.getElementById('apiKeyStatus');

  if (!btn || !overlay) return;

  function refreshStatus() {
    status.textContent = getApiKey()
      ? '✅ Chiave salvata in questo browser.'
      : '⚠️ Nessuna chiave salvata.';
  }

  function refreshDisclaimer() {
    const disclaimer = document.getElementById('apiKeyDisclaimer');
    if (!disclaimer) return;
    disclaimer.classList.toggle('hidden', !!getApiKey());
  }

  refreshDisclaimer();

  btn.addEventListener('click', () => {
    input.value = getApiKey();
    overlay.classList.remove('hidden');
    refreshStatus();
  });

  document.getElementById('apiKeyClose').addEventListener('click', () => {
    overlay.classList.add('hidden');
  });

  document.getElementById('apiKeySave').addEventListener('click', () => {
    setApiKey(input.value.trim());
    refreshStatus();
    refreshDisclaimer();
  });

  document.getElementById('apiKeyClear').addEventListener('click', () => {
    clearApiKey();
    input.value = '';
    refreshStatus();
    refreshDisclaimer();
  });
}

document.addEventListener('components:ready', initApiKeyUI);


// ------------------------------------------------------------
// help-guide.js — finestra "Guida all'uso"
// ------------------------------------------------------------

function apriGuidaAiuto() {
  const overlay = document.getElementById('helpModalOverlay');
  if (overlay) overlay.classList.remove('hidden');
}

function chiudiGuidaAiuto() {
  const overlay = document.getElementById('helpModalOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function initHelpGuide() {
  const helpBtn = document.getElementById('helpBtn');
  const closeBtn = document.getElementById('helpModalClose');
  const overlay = document.getElementById('helpModalOverlay');
  const disclaimerLink = document.getElementById('disclaimerHelpLink');

  if (helpBtn) helpBtn.addEventListener('click', apriGuidaAiuto);
  if (closeBtn) closeBtn.addEventListener('click', chiudiGuidaAiuto);
  if (disclaimerLink) disclaimerLink.addEventListener('click', apriGuidaAiuto);

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) chiudiGuidaAiuto();
    });
  }
}

document.addEventListener('components:ready', initHelpGuide);


// ------------------------------------------------------------
// gemini-api.js — chiamate reali all'API Gemini
// ------------------------------------------------------------

const MODELLI_TESTO = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const MODELLI_VISIONE = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'];

function urlPerModello(modello) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`;
}

function erroreDaSovraccaricoOQuota(status, corpoErrore) {
  if (status === 429 || status === 503 || status === 404) return true;
  const testo = (corpoErrore || '').toLowerCase();
  return testo.includes('resource_exhausted') || testo.includes('quota') || testo.includes('overloaded') || testo.includes('not found');
}

async function eseguiChiamataGemini(modello, key, body) {
  const response = await fetch(`${urlPerModello(modello)}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const corpoErroreGrezzo = await response.text().catch(() => '');
    return { ok: false, status: response.status, corpoErroreGrezzo };
  }

  const data = await response.json();
  return { ok: true, status: response.status, data };
}

const ERRORE_QUOTA_ESAURITA_TUTTI = 'QUOTA_ESAURITA_TUTTI_I_MODELLI';

async function chiamaGeminiConRiservaGenerico(modelli, body) {
  const key = getApiKey();
  if (!key) {
    throw new Error('Nessuna API key impostata. Clicca su "API Key" in alto.');
  }

  let ultimoErroreDiQuota = null;

  for (let i = 0; i < modelli.length; i++) {
    const tentativo = await eseguiChiamataGemini(modelli[i], key, body);
    if (tentativo.ok) return tentativo.data;

    if (erroreDaSovraccaricoOQuota(tentativo.status, tentativo.corpoErroreGrezzo)) {
      ultimoErroreDiQuota = tentativo;
      continue;
    }

    throw new Error(`Errore dall'API (${tentativo.status}). Controlla che la chiave sia corretta. ${tentativo.corpoErroreGrezzo.slice(0, 200)}`);
  }

  const err = new Error(ERRORE_QUOTA_ESAURITA_TUTTI);
  err.dettaglio = ultimoErroreDiQuota;
  throw err;
}

function chiamaGeminiConRiserva(body) {
  return chiamaGeminiConRiservaGenerico(MODELLI_TESTO, body);
}

function chiamaGeminiVisioneConRiserva(body) {
  return chiamaGeminiConRiservaGenerico(MODELLI_VISIONE, body);
}

function contestoDettagli(dettagli) {
  if (!dettagli) return '';
  const righe = [];
  if (dettagli.materiale) righe.push(`Materiale/i che l'utente ha già (marca/modello) — se sono elencati più elementi separati da virgola, trattali come materiali distinti: ${dettagli.materiale}.`);
  if (dettagli.elettrodomestico) righe.push(`Elettrodomestico/i o oggetto/i da collegare o installare (marca/modello) — se sono elencati più elementi separati da virgola, trattali come oggetti distinti: ${dettagli.elettrodomestico}.`);
  if (righe.length === 0) return '';
  return `\nDETTAGLI FORNITI DALL'UTENTE (usali per personalizzare la guida, es. tipo di cavo, sezione, attacchi specifici; se un campo contiene più valori separati da virgola, considerali singolarmente uno per uno):\n${righe.join('\n')}\n`;
}

function costruisciPrompt(domanda, categoria, dettagli, descrizioneFoto) {
  const contestoCategoria = categoria && CATEGORIES[categoria]
    ? `La categoria scelta dall'utente è: ${CATEGORIES[categoria].label}. Considerala come contesto principale.`
    : 'L\'utente non ha scelto una categoria specifica: deducila tu dal contenuto della domanda.';

  const contestoFoto = descrizioneFoto
    ? `\nDESCRIZIONE DI UNA FOTO ALLEGATA DALL'UTENTE (analizzata separatamente, usala come contesto reale per personalizzare la guida):\n${descrizioneFoto}\n`
    : '';

  return `Sei un esperto di fai-da-te e riparazioni domestiche con 30 anni di esperienza.
${contestoCategoria}

DOMANDA DELL'UTENTE: "${domanda}"
${contestoDettagli(dettagli)}${contestoFoto}
Rispondi SOLO con un oggetto JSON valido (nessun testo prima o dopo, nessun blocco markdown \`\`\`), con esattamente questa struttura:

{
  "titolo": "string",
  "categoria": "string (una tra: idraulica, elettricita, falegnameria, muratura, mobili, giardinaggio, hobby, generico)",
  "difficolta": "Facile" | "Media" | "Difficile",
  "tempoStimato": "string, es. '30 minuti'",
  "attrezzi": ["string", "..."],
  "materiali": [ { "nome": "string", "prezzoIndicativo": "string, es. '€5' o '€3-6'" } ],
  "passaggi": [ { "titolo": "string breve", "descrizione": "string dettagliata", "terminiRicercaImmagine": "string breve in italiano o inglese, 2-5 parole, per trovare una foto di riferimento di questa azione specifica" } ],
  "avvertenzeSicurezza": ["string", "..."],
  "lavoroSconsigliato": boolean,
  "motivoSeSconsigliato": "string o stringa vuota",
  "consigli": ["string", "..."],
  "costoProfessionista": numero (solo euro, senza simbolo),
  "costoFaiDaTe": numero (solo euro, senza simbolo, somma dei materiali)
}

Regole:
- Se sono forniti dettagli su materiale già posseduto o elettrodomestico da collegare, usa quelle informazioni per personalizzare attrezzi, materiali (es. sezione cavo corretta, tipo di attacco) e passaggi, invece di restare generico.
- Se è presente una descrizione di una foto allegata, usala attivamente per personalizzare la guida (es. suggerire il trattamento giusto in base allo stato reale della parete, il colore più adatto, se una soluzione incassata o esterna è più indicata, ecc), e menziona esplicitamente cosa hai notato nella foto quando è rilevante per un passaggio.
- Dai sempre il giudizio più equilibrato e professionale possibile: né eccessivamente drastico (es. suggerire di demolire/rifare tutto quando basterebbe un intervento locale) né troppo permissivo (es. minimizzare un problema serio). Basati solo su ciò che è realmente visibile o dichiarato, senza esagerare né sottostimare.
- Usa un linguaggio semplice e comprensibile anche a chi non ha mai fatto lavori manuali: se usi un termine tecnico, spiegalo brevemente tra parentesi la prima volta che lo usi.
- Se il lavoro richiede competenze pericolose o abilitazioni professionali (es. impianto gas, lavori su quadro elettrico non protetti, strutture portanti), imposta "lavoroSconsigliato": true e spiega il motivo, ma compila comunque gli altri campi con informazioni generali e di sicurezza.
- I passaggi devono essere concreti e in ordine logico, minimo 3 passaggi.
- Le avvertenze di sicurezza sono obbligatorie, minimo 1.
- I prezzi sono stime realistiche per l'Italia.
- Il campo "terminiRicercaImmagine" deve essere una query concreta e visiva (es. "sostituzione guarnizione rubinetto cucina", non parole vaghe), utile per trovare una foto di riferimento reale su un motore di ricerca immagini.
- Non inserire mai link o URL a negozi/prodotti: non conosci prodotti realmente in vendita, qualsiasi link inventeresti sarebbe falso o rotto.
- Non aggiungere testo fuori dal JSON.`;
}

async function chiamataGeminiJson(prompt) {
  const data = await chiamaGeminiConRiserva({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      response_mime_type: 'application/json'
    }
  });

  const testoGrezzo = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!testoGrezzo) {
    throw new Error('Risposta dell\'AI vuota o in formato inatteso.');
  }
  return testoGrezzo;
}

async function chiamaAI(domanda, categoria, dettagli, immagini) {
  let descrizioneFoto = '';
  let avvisoFoto = null;

  if (immagini && immagini.length > 0) {
    const risultatoFoto = await chiamaAnalisiFoto(immagini, domanda);
    descrizioneFoto = risultatoFoto.descrizione;
    avvisoFoto = risultatoFoto.avviso;
  }

  const prompt = costruisciPrompt(domanda, categoria, dettagli, descrizioneFoto);
  const testoGrezzo = await chiamataGeminiJson(prompt);

  let guida;
  try {
    guida = JSON.parse(testoGrezzo);
  } catch (e) {
    throw new Error('Non sono riuscito a leggere la risposta dell\'AI come JSON valido. Riprova.');
  }

  const guidaArricchita = arricchisciConRisparmio(guida);
  guidaArricchita.avvisoFoto = avvisoFoto;
  return guidaArricchita;
}

async function chiamaAnalisiFoto(immagini, domanda) {
  const parti = immagini.slice(0, 4).map(img => ({
    inline_data: { mime_type: img.mimeType, data: img.base64 }
  }));

  const promptAnalisi = `Guarda attentamente la/le foto allegate. L'utente vuole fare questo lavoro: "${domanda}".
Descrivi in modo semplice e concreto ciò che vedi nella foto, in relazione a questo lavoro: materiali visibili, colori, stato attuale (usurato, nuovo, danneggiato, con muffa, con crepe, ecc.), dimensioni indicative se deducibili, e qualunque dettaglio utile per consigliare la soluzione migliore.
Se valuti la gravità di un problema (es. quanto è estesa una macchia di muffa, quanto è profonda una crepa), sii equilibrato e realistico basandoti solo su quello che vedi: non esagerare la gravità suggerendo interventi drastici se il problema appare limitato, e non minimizzare se appare esteso o serio. Dai sempre la stessa valutazione se la situazione mostrata è la stessa.
Non inventare dettagli che non vedi. Se la foto non è chiara o non è pertinente al lavoro descritto, dillo onestamente.
Rispondi in italiano, testo semplice senza markdown, massimo 150 parole.`;

  try {
    const data = await chiamaGeminiVisioneConRiserva({
      contents: [{ parts: [...parti, { text: promptAnalisi }] }],
      generationConfig: { temperature: 0.2 }
    });

    const testo = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { descrizione: testo ? testo.trim() : '', avviso: null };
  } catch (e) {
    const avviso = e.message === ERRORE_QUOTA_ESAURITA_TUTTI
      ? 'L\'analizzatore di foto ha esaurito la quota giornaliera disponibile: la guida è stata generata senza usare le foto allegate.'
      : 'Non è stato possibile analizzare le foto in questo momento: la guida è stata generata senza usare le foto allegate.';
    return { descrizione: '', avviso };
  }
}

function arricchisciConRisparmio(guida) {
  const cat = CATEGORIES[guida.categoria] || CATEGORIES['generico'] || null;
  const fallbackProfessionista = cat?.prezziMedi?.default ?? 100;

  const costoProfessionista = Number.isFinite(guida.costoProfessionista)
    ? guida.costoProfessionista
    : fallbackProfessionista;

  const costoFaiDaTe = Number.isFinite(guida.costoFaiDaTe)
    ? guida.costoFaiDaTe
    : Math.round(costoProfessionista * 0.25);

  const risparmio = Math.max(costoProfessionista - costoFaiDaTe, 0);
  const percentuale = costoProfessionista > 0
    ? Math.round((risparmio / costoProfessionista) * 100)
    : 0;

  return {
    ...guida,
    costoProfessionista,
    costoFaiDaTe,
    risparmio,
    percentualeRisparmio: percentuale
  };
}

async function chiamaTestoLibero(prompt) {
  const data = await chiamaGeminiConRiserva({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.35 }
  });

  const testo = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!testo) throw new Error('Risposta vuota dall\'AI.');
  return testo.trim();
}

async function chiamaApprofondimento(contesto, domandaFollowup, descrizioneFoto) {
  const { domanda, dettagli, guida } = contesto;

  const contestoFotoFollowup = descrizioneFoto
    ? `\nDESCRIZIONE DI UNA FOTO ALLEGATA A QUESTA RICHIESTA (analizzata separatamente, usala come contesto reale):\n${descrizioneFoto}\n`
    : '';

  const prompt = `Sei lo stesso esperto di fai-da-te che ha già scritto questa guida.

DOMANDA ORIGINALE DELL'UTENTE: "${domanda}"
${contestoDettagli(dettagli)}
GUIDA GIA' FORNITA (titolo): "${guida.titolo}"
Materiali già indicati: ${(guida.materiali || []).map(m => m.nome).join(', ') || 'nessuno'}
Passaggi già indicati: ${(guida.passaggi || []).map(p => p.titolo || p.descrizione).join(' | ') || 'nessuno'}

NUOVA RICHIESTA DELL'UTENTE: "${domandaFollowup}"
${contestoFotoFollowup}
Questa richiesta può essere: (a) un'altra domanda di approfondimento generale, oppure (b) la segnalazione di un problema o intoppo concreto incontrato durante il lavoro (es. non ha un attrezzo specifico, il muro è di un materiale particolare, ha trovato qualcosa di diverso dal previsto, ecc).

Se è un problema/intoppo concreto: proponi un adattamento pratico del procedimento, come una mini guida alternativa numerata passo-passo (1, 2, 3...) tenendo conto del problema segnalato (e di quanto visto nella foto, se presente), restando concreto e sicuro.
Se è una domanda generica di approfondimento: rispondi in modo diretto e pratico.
Sii equilibrato e professionale: non esagerare la gravità del problema né minimizzarla, e usa un linguaggio semplice comprensibile anche a chi non ha esperienza, spiegando brevemente eventuali termini tecnici.

Rispondi in italiano, massimo 200 parole, senza ripetere tutta la guida originale da capo. Rispondi solo testo semplice, senza JSON, senza markdown e senza inserire link o URL: non conosci prodotti reali in vendita, quindi non inventare link a negozi (puoi usare numeri tipo "1." "2." per elenchi).`;

  return chiamaTestoLibero(prompt);
}

async function chiamaDettaglioPasso(contesto, indicePasso) {
  const { domanda, dettagli, guida } = contesto;
  const passo = guida.passaggi?.[indicePasso];
  if (!passo) throw new Error('Passo non trovato.');

  const prompt = `Sei un esperto di fai-da-te che sta aiutando un principiante totale.

LAVORO COMPLESSIVO: "${domanda}" (guida: "${guida.titolo}")
${contestoDettagli(dettagli)}
PASSO DA APPROFONDIRE: "${passo.titolo || ''}" — ${passo.descrizione}

Spiega questo singolo passo in modo molto più dettagliato, come se lo spiegassi a chi non ha mai fatto nulla di simile in vita sua. Struttura la spiegazione in sotto-passaggi numerati piccoli e concreti (es. "1. Prendi in mano...", "2. Posiziona...", ecc), senza dare per scontato nulla: menziona come tenere in mano gli attrezzi se rilevante, in che verso girare/spingere, come capire se stai facendo bene, ed eventuali segnali di errore da notare.
Resta equilibrato e coerente con la guida originale, senza contraddirla o esagerare la difficoltà.

Rispondi in italiano, testo semplice senza markdown e senza inserire link o URL, massimo 220 parole, ma completo e ordinato (usa numeri "1." "2." "3." per i sotto-passaggi).`;

  return chiamaTestoLibero(prompt);
}

async function chiamaDomandaSpecificaPasso(contesto, indicePasso, domandaSpecifica) {
  const { domanda, guida } = contesto;
  const passo = guida.passaggi?.[indicePasso];

  const prompt = `Sei un esperto di fai-da-te. L'utente sta seguendo questa guida: "${guida.titolo}" (lavoro: "${domanda}").
${passo ? `Si trova al passo: "${passo.titolo || ''}" — ${passo.descrizione}` : ''}

L'utente ha questo dubbio specifico su un termine, oggetto o azione citato: "${domandaSpecifica}"

Rispondi in modo semplice e diretto, come spiegheresti a qualcuno senza esperienza, in italiano, massimo 80 parole, senza markdown e senza inserire link o URL.`;

  return chiamaTestoLibero(prompt);
}


// ------------------------------------------------------------
// main.js — orchestrazione ricerca/render
// ------------------------------------------------------------

let ultimaGuidaContesto = null;
let fotoAllegate = [];
let fotoApprofondimento = [];

function initSearch() {
  const btn = document.getElementById('searchBtn');
  const input = document.getElementById('queryInput');
  const toggleBtn = document.getElementById('toggleDetailsBtn');
  const detailsBox = document.getElementById('detailsBox');
  const fotoInput = document.getElementById('fotoInput');

  if (toggleBtn && detailsBox) {
    toggleBtn.addEventListener('click', () => {
      detailsBox.classList.toggle('hidden');
    });
  }

  if (fotoInput) {
    fotoInput.addEventListener('change', async (e) => {
      const nuoviFile = Array.from(e.target.files || []);
      for (const file of nuoviFile) {
        const base64 = await leggiFileComeBase64(file);
        fotoAllegate.push({ file, base64, mimeType: file.type });
      }
      renderAnteprimaFoto();
      fotoInput.value = '';
    });
  }

  if (!btn || !input) return;

  btn.addEventListener('click', async () => {
    const domanda = input.value.trim();
    if (!domanda) {
      alert('Descrivi cosa vuoi fare.');
      return;
    }
    const categoria = input.dataset.category || null;
    const dettagli = {
      materiale: document.getElementById('materialeInput')?.value.trim() || '',
      elettrodomestico: document.getElementById('elettrodomesticoInput')?.value.trim() || ''
    };
    const immagini = fotoAllegate.map(f => ({ base64: f.base64, mimeType: f.mimeType }));
    await eseguiRicerca(domanda, categoria, dettagli, immagini);
  });
}

function leggiFileComeBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAnteprimaFoto() {
  const container = document.getElementById('fotoPreviewList');
  if (!container) return;

  container.innerHTML = fotoAllegate.map((f, i) => `
    <div class="photo-preview-item">
      <img src="data:${f.mimeType};base64,${f.base64}" alt="Foto allegata">
      <button class="photo-preview-remove" data-index="${i}" title="Rimuovi">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.photo-preview-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      fotoAllegate.splice(Number(btn.dataset.index), 1);
      renderAnteprimaFoto();
    });
  });
}

function renderAnteprimaFotoApprofondimento() {
  const container = document.getElementById('fotoApprofondimentoPreviewList');
  if (!container) return;

  container.innerHTML = fotoApprofondimento.map((f, i) => `
    <div class="photo-preview-item">
      <img src="data:${f.mimeType};base64,${f.base64}" alt="Foto allegata">
      <button class="photo-preview-remove" data-index="${i}" title="Rimuovi">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.photo-preview-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      fotoApprofondimento.splice(Number(btn.dataset.index), 1);
      renderAnteprimaFotoApprofondimento();
    });
  });
}

async function eseguiRicerca(domanda, categoria, dettagli, immagini) {
  const loading = document.getElementById('loading');
  const result = document.getElementById('guide-result');

  loading.classList.remove('hidden');
  result.classList.add('hidden');
  result.innerHTML = '';

  try {
    const guida = await chiamaAI(domanda, categoria, dettagli, immagini);
    ultimaGuidaContesto = {
      domanda, categoria, dettagli, guida,
      stepDetails: {},
      stepQA: {},
      approfondimenti: [],
      historyId: null
    };
    renderGuida(guida);
  } catch (err) {
    result.innerHTML = `<div class="guide-card error-card">
      <p>❌ ${escapeHtml(err.message)}</p>
    </div>`;
    result.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function iconaCategoria(chiave) {
  return CATEGORIES[chiave]?.icon || '🔧';
}

function classeDifficolta(d) {
  const v = (d || '').toLowerCase();
  if (v.includes('facile')) return 'difficolta-facile';
  if (v.includes('difficile')) return 'difficolta-difficile';
  return 'difficolta-media';
}

const ICONE_ATTREZZI = [
  ['cacciavite', 'screwdriver'],
  ['trapano', 'screwdriver-wrench'],
  ['avvitatore', 'screwdriver-wrench'],
  ['martello', 'hammer'],
  ['mazzuolo', 'hammer'],
  ['chiave inglese', 'wrench'],
  ['chiave a brugola', 'wrench'],
  ['chiave', 'wrench'],
  ['pinza', 'wrench'],
  ['tenaglia', 'wrench'],
  ['tronchese', 'scissors'],
  ['forbici', 'scissors'],
  ['cutter', 'scissors'],
  ['taglierino', 'scissors'],
  ['sega', 'toolbox'],
  ['seghetto', 'toolbox'],
  ['livella', 'ruler-combined'],
  ['squadra', 'ruler-combined'],
  ['metro', 'ruler'],
  ['spatola', 'trowel'],
  ['cazzuola', 'trowel'],
  ['frattazzo', 'trowel'],
  ['guanti', 'mitten'],
  ['occhiali', 'glasses'],
  ['mascherina', 'head-side-mask'],
  ['casco', 'hard-hat'],
  ['scala', 'toolbox'],
  ['pennello', 'paint-roller'],
  ['rullo', 'paint-roller'],
  ['torcia', 'lightbulb'],
  ['multimetro', 'gauge'],
  ['tester', 'gauge'],
  ['saldatore', 'fire'],
  ['smerigliatrice', 'screwdriver-wrench'],
  ['carriola', 'toolbox'],
  ['secchio', 'toolbox'],
  ['nastro isolante', 'ruler'],
  ['nastro teflon', 'ruler'],
  ['etichettatore', 'tag'],
];

function iconaPerNome(nome) {
  const n = (nome || '').toLowerCase();
  for (const [parola, icona] of ICONE_ATTREZZI) {
    if (n.includes(parola)) return icona;
  }
  return 'toolbox';
}

function linkRicercaImmagini(query) {
  const q = encodeURIComponent(query);
  return `https://www.google.com/search?tbm=isch&q=${q}`;
}

function renderGuida(g) {
  const result = document.getElementById('guide-result');

  const bannerSconsigliato = g.lavoroSconsigliato ? `
    <div class="danger-box">
      <strong>⚠️ Lavoro sconsigliato al fai-da-te</strong>
      <p>${escapeHtml(g.motivoSeSconsigliato || 'Richiede competenze professionali specifiche.')}</p>
    </div>
  ` : '';

  const avvisoFotoHtml = g.avvisoFoto ? `
    <div class="photo-warning-notice no-print">📷 ${escapeHtml(g.avvisoFoto)}</div>
  ` : '';

  const attrezziHtml = (g.attrezzi || []).map(a => `
    <div class="tool-item">
      <div><i class="fa-solid fa-${iconaPerNome(a)}"></i> ${escapeHtml(a)}</div>
      <a class="image-search-link no-print" href="${linkRicercaImmagini(a)}" target="_blank" rel="noopener">Vedi immagini</a>
    </div>
  `).join('') || '<p class="muted">Nessun attrezzo specifico richiesto.</p>';

  const materialiHtml = (g.materiali || []).map(m => `
    <li>
      <div class="material-row">
        <span>${escapeHtml(m.nome)}</span>
        <span class="material-price">${escapeHtml(m.prezzoIndicativo || '')} <span class="price-note">(indicativo)</span></span>
      </div>
      <a class="image-search-link no-print" href="${linkRicercaImmagini(m.nome)}" target="_blank" rel="noopener">Vedi immagini prodotto</a>
    </li>
  `).join('') || '<li class="muted">Nessun materiale specifico richiesto.</li>';

  const passaggiHtml = (g.passaggi || []).map((p, i) => {
    const query = p.terminiRicercaImmagine || p.titolo || p.descrizione || g.titolo;
    return `
    <div class="step" data-step-index="${i}">
      <span class="step-number">Passo ${i + 1}${p.titolo ? ' · ' + escapeHtml(p.titolo) : ''}</span>
      <p class="step-description">${escapeHtml(p.descrizione || p)}</p>

      <div id="stepDetailBox-${i}" class="step-detail-box"></div>

      <div class="step-actions no-print">
        <button class="step-detail-btn" data-step="${i}">🔍 Spiegami in dettaglio questo passo</button>
      </div>

      <div class="step-mini-question no-print">
        <input type="text" id="stepQuestionInput-${i}" placeholder="Hai un dubbio su un termine o un'azione qui? Es: cos'è una scatola di derivazione?">
        <button class="step-question-btn" data-step="${i}">Chiedi</button>
      </div>
      <div id="stepQABox-${i}" class="step-qa-box"></div>

      <a class="image-search-link no-print" href="${linkRicercaImmagini(query)}" target="_blank" rel="noopener">Vedi immagini di riferimento</a>
    </div>
  `;
  }).join('');

  const avvertenzeHtml = (g.avvertenzeSicurezza || []).map(a => `<div>⚠️ ${escapeHtml(a)}</div>`).join('');

  const consigliHtml = (g.consigli || []).map(c => `<li>${escapeHtml(c)}</li>`).join('');

  result.innerHTML = `
    <div class="guide-card" id="guidaEsportabile">
      <div class="guide-header no-print">
        <h2>${escapeHtml(g.titolo || 'Guida')}</h2>
        <span class="guide-difficulty ${classeDifficolta(g.difficolta)}">${escapeHtml(g.difficolta || 'Media')}</span>
      </div>
      <h2 class="print-only">${escapeHtml(g.titolo || 'Guida')} — Difficoltà: ${escapeHtml(g.difficolta || 'Media')}</h2>
      <p class="guide-meta">⏱️ ${escapeHtml(g.tempoStimato || 'Non specificato')} · 📂 ${escapeHtml(CATEGORIES[g.categoria]?.label || g.categoria || 'Generico')}</p>

      ${bannerSconsigliato}
      ${avvisoFotoHtml}

      <div class="guide-columns">
        <div class="guide-col-left">
          <div class="guide-col-left-scroll">
            <h3>🔧 Attrezzi necessari</h3>
            <div class="tools-grid">${attrezziHtml}</div>

            <h3>📦 Materiali necessari</h3>
            <ul class="materials-list">${materialiHtml}</ul>
          </div>
        </div>

        <div class="guide-col-right">
          <h3>📋 Procedimento passo passo</h3>
          <div class="steps-scroll">${passaggiHtml}</div>
        </div>
      </div>

      <div class="guide-warnings-row">
        <div class="warnings-col">
          <h3>⚠️ Avvertenze di sicurezza</h3>
          <div class="warning-box">${avvertenzeHtml}</div>
        </div>
        ${consigliHtml ? `
        <div class="tips-col">
          <h3>💡 Consigli utili</h3>
          <ul class="tips-list">${consigliHtml}</ul>
        </div>` : ''}
      </div>

      <h3>💰 Quanto risparmi</h3>
      <div class="savings-card">
        <div class="savings-detail">
          <div><span class="savings-label">Costo professionista</span><br>€${g.costoProfessionista}</div>
          <div><span class="savings-label">Costo fai-da-te</span><br>€${g.costoFaiDaTe}</div>
        </div>
        <div class="savings-amount">Risparmio: €${g.risparmio} (${g.percentualeRisparmio}%)</div>
      </div>

      <div id="approfondimentiContainer"></div>

      <h3 class="no-print">🔎 Approfondimenti e imprevisti sul lavoro</h3>
      <p class="muted no-print">Usa questo spazio per domande di approfondimento generali, ma anche per segnalare problemi o imprevisti concreti durante il lavoro (non hai un attrezzo specifico, il muro è di un materiale particolare, hai trovato qualcosa di diverso dal previsto, ecc): l'AI ti proporrà una mini guida alternativa passo-passo adattata alla tua situazione.</p>
      <div class="followup-box no-print">
        <textarea id="followupInput" rows="2" placeholder="Scrivi qui la tua domanda di approfondimento... (Invio per inviare)"></textarea>

        <label for="fotoApprofondimentoInput" class="photo-attach-label">
          📷 Allega una o più foto (facoltativo) — es: il problema o l'imprevisto che hai trovato
        </label>
        <input type="file" id="fotoApprofondimentoInput" accept="image/*" multiple class="photo-attach-input">
        <div id="fotoApprofondimentoPreviewList" class="photo-preview-list"></div>

        <button id="followupBtn">Chiedi approfondimento</button>
      </div>

      <div class="guide-actions-row no-print">
        <button id="saveHistoryBtn" class="save-history-btn">💾 Salva in cronologia</button>
        <button id="exportPdfBtn" class="export-pdf-btn">📄 Esporta guida in PDF</button>
      </div>
    </div>
  `;
  result.classList.remove('hidden');
  setTimeout(() => {
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);

  initStepControls();

  document.getElementById('followupBtn').addEventListener('click', gestisciApprofondimento);
  document.getElementById('followupInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      gestisciApprofondimento();
    }
  });
  document.getElementById('exportPdfBtn').addEventListener('click', () => {
    window.print();
  });

  document.getElementById('saveHistoryBtn').addEventListener('click', salvaGuidaInCronologia);

  const fotoApprofondimentoInput = document.getElementById('fotoApprofondimentoInput');
  if (fotoApprofondimentoInput) {
    fotoApprofondimentoInput.addEventListener('change', async (e) => {
      const nuoviFile = Array.from(e.target.files || []);
      for (const file of nuoviFile) {
        const base64 = await leggiFileComeBase64(file);
        fotoApprofondimento.push({ file, base64, mimeType: file.type });
      }
      renderAnteprimaFotoApprofondimento();
      fotoApprofondimentoInput.value = '';
    });
  }
}

function markupItemCollassabile(etichetta, numero, contenutoHtml, aperto) {
  return `
    <div class="step-detail-item">
      <button class="step-detail-item-toggle" type="button">${etichetta} ${numero} <span class="toggle-arrow">${aperto ? '▲' : '▼'}</span></button>
      <div class="step-detail-item-content${aperto ? '' : ' hidden'}">${contenutoHtml}</div>
    </div>
  `;
}

function aggiornaBoxDettagli(indice, scrollaSuUltimo) {
  const box = document.getElementById(`stepDetailBox-${indice}`);
  if (!box) return;
  const elenco = ultimaGuidaContesto?.stepDetails?.[indice] || [];
  const itemsHtml = elenco.map((testo, i) =>
    markupItemCollassabile('Dettaglio', i + 1, escapeHtml(testo), i === elenco.length - 1)
  ).join('');

  if (elenco.length >= 2) {
    box.innerHTML = `
      <button class="step-detail-group-toggle" type="button">📂 Dettagli richiesti (${elenco.length}) <span class="toggle-arrow">▾</span></button>
      <div class="step-detail-group-content">${itemsHtml}</div>
    `;
  } else {
    box.innerHTML = itemsHtml;
  }

  collegaToggleDettagli(box);

  if (scrollaSuUltimo) {
    setTimeout(() => {
      const ultimoItem = box.querySelector('.step-detail-item:last-child');
      if (ultimoItem) ultimoItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
}

function aggiornaBoxQA(indice, scrollaSuUltimo) {
  const box = document.getElementById(`stepQABox-${indice}`);
  if (!box) return;
  const elenco = ultimaGuidaContesto?.stepQA?.[indice] || [];
  const itemsHtml = elenco.map((qa, i) => {
    const contenuto = `
      <p class="step-qa-domanda">❓ ${escapeHtml(qa.domanda)}</p>
      <p class="step-qa-risposta">${escapeHtml(qa.risposta)}</p>
      <a class="image-search-link no-print" href="${linkRicercaImmagini(qa.domanda)}" target="_blank" rel="noopener">Vedi immagini di riferimento</a>
    `;
    return markupItemCollassabile('Approfondimento', i + 1, contenuto, i === elenco.length - 1);
  }).join('');

  if (elenco.length >= 2) {
    box.innerHTML = `
      <button class="step-detail-group-toggle" type="button">📂 Approfondimenti richiesti (${elenco.length}) <span class="toggle-arrow">▾</span></button>
      <div class="step-detail-group-content">${itemsHtml}</div>
    `;
  } else {
    box.innerHTML = itemsHtml;
  }

  collegaToggleDettagli(box);

  if (scrollaSuUltimo) {
    setTimeout(() => {
      const ultimoItem = box.querySelector('.step-detail-item:last-child');
      if (ultimoItem) ultimoItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
}

function collegaToggleDettagli(box) {
  const groupToggle = box.querySelector('.step-detail-group-toggle');
  if (groupToggle) {
    groupToggle.addEventListener('click', () => {
      const content = box.querySelector('.step-detail-group-content');
      content.classList.toggle('hidden');
      groupToggle.querySelector('.toggle-arrow').textContent = content.classList.contains('hidden') ? '▾' : '▴';
    });
  }
  box.querySelectorAll('.step-detail-item-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      content.classList.toggle('hidden');
      btn.querySelector('.toggle-arrow').textContent = content.classList.contains('hidden') ? '▼' : '▲';
    });
  });
}

function inserisciApprofondimentoDOM(domanda, risposta) {
  const container = document.getElementById('approfondimentiContainer');
  if (!container) return;
  const blocco = document.createElement('div');
  blocco.className = 'approfondimento-box';
  blocco.innerHTML = `
    <p class="approfondimento-domanda">❓ ${escapeHtml(domanda)}</p>
    <p class="approfondimento-risposta">${escapeHtml(risposta)}</p>
  `;
  container.appendChild(blocco);
}

async function gestisciApprofondimento() {
  const input = document.getElementById('followupInput');
  const domandaFollowup = input.value.trim();
  if (!domandaFollowup) return;
  if (!ultimaGuidaContesto) return;

  const btn = document.getElementById('followupBtn');

  btn.disabled = true;
  btn.textContent = 'Sto pensando...';

  try {
    let descrizioneFoto = '';
    if (fotoApprofondimento.length > 0) {
      const immagini = fotoApprofondimento.map(f => ({ base64: f.base64, mimeType: f.mimeType }));
      const risultatoFoto = await chiamaAnalisiFoto(immagini, domandaFollowup);
      descrizioneFoto = risultatoFoto.descrizione;
    }

    const risposta = await chiamaApprofondimento(ultimaGuidaContesto, domandaFollowup, descrizioneFoto);
    inserisciApprofondimentoDOM(domandaFollowup, risposta);
    ultimaGuidaContesto.approfondimenti.push({ domanda: domandaFollowup, risposta });

    input.value = '';
    fotoApprofondimento = [];
    renderAnteprimaFotoApprofondimento();
  } catch (err) {
    alert('Errore nell\'approfondimento: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Chiedi approfondimento';
  }
}

document.addEventListener('components:ready', initSearch);

function initStepControls() {
  document.querySelectorAll('.step-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => gestisciDettaglioPasso(Number(btn.dataset.step), btn));
  });

  document.querySelectorAll('.step-question-btn').forEach(btn => {
    const idx = Number(btn.dataset.step);
    btn.addEventListener('click', () => gestisciDomandaSpecificaPasso(idx, btn));

    const input = document.getElementById(`stepQuestionInput-${idx}`);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        gestisciDomandaSpecificaPasso(idx, btn);
      }
    });
  });
}

async function gestisciDettaglioPasso(indice, btn) {
  if (!ultimaGuidaContesto) return;

  btn.disabled = true;
  btn.textContent = 'Sto scrivendo il dettaglio...';

  try {
    const testo = await chiamaDettaglioPasso(ultimaGuidaContesto, indice);
    if (!ultimaGuidaContesto.stepDetails[indice]) ultimaGuidaContesto.stepDetails[indice] = [];
    ultimaGuidaContesto.stepDetails[indice].push(testo);
    aggiornaBoxDettagli(indice, true);
    btn.textContent = '🔍 Chiedi un altro dettaglio su questo passo';
  } catch (err) {
    const box = document.getElementById(`stepDetailBox-${indice}`);
    box.innerHTML += `<div class="step-detail-content error-text">❌ ${escapeHtml(err.message)}</div>`;
    btn.textContent = '🔍 Spiegami in dettaglio questo passo';
  } finally {
    btn.disabled = false;
  }
}

async function gestisciDomandaSpecificaPasso(indice, btn) {
  const input = document.getElementById(`stepQuestionInput-${indice}`);
  const domanda = input.value.trim();
  if (!domanda || !ultimaGuidaContesto) return;

  const box = document.getElementById(`stepQABox-${indice}`);
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const risposta = await chiamaDomandaSpecificaPasso(ultimaGuidaContesto, indice, domanda);
    if (!ultimaGuidaContesto.stepQA[indice]) ultimaGuidaContesto.stepQA[indice] = [];
    ultimaGuidaContesto.stepQA[indice].push({ domanda, risposta });
    aggiornaBoxQA(indice, true);
    input.value = '';
  } catch (err) {
    box.innerHTML += `<p class="error-text">❌ ${escapeHtml(err.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Chiedi';
  }
}


// ------------------------------------------------------------
// history.js — cronologia in localStorage
// ------------------------------------------------------------

const CRONOLOGIA_STORAGE_KEY = 'faidate_cronologia';
const CRONOLOGIA_MAX_VOCI = 50;

function leggiCronologia() {
  try {
    const raw = localStorage.getItem(CRONOLOGIA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Errore leggendo la cronologia:', e);
    return [];
  }
}

function scriviCronologia(lista) {
  try {
    localStorage.setItem(CRONOLOGIA_STORAGE_KEY, JSON.stringify(lista));
    return true;
  } catch (e) {
    console.error('Errore salvando la cronologia:', e);
    return false;
  }
}

function salvaGuidaInCronologia() {
  if (!ultimaGuidaContesto) return;

  const btn = document.getElementById('saveHistoryBtn');
  let lista = leggiCronologia();

  const datiVoce = {
    domanda: ultimaGuidaContesto.domanda,
    categoria: ultimaGuidaContesto.categoria,
    dettagli: ultimaGuidaContesto.dettagli,
    guida: ultimaGuidaContesto.guida,
    stepDetails: ultimaGuidaContesto.stepDetails,
    stepQA: ultimaGuidaContesto.stepQA,
    approfondimenti: ultimaGuidaContesto.approfondimenti
  };

  let ok;

  if (ultimaGuidaContesto.historyId) {
    const indiceEsistente = lista.findIndex(v => v.id === ultimaGuidaContesto.historyId);
    if (indiceEsistente !== -1) {
      lista[indiceEsistente] = {
        ...lista[indiceEsistente],
        ...datiVoce,
        updatedAt: new Date().toISOString()
      };
      ok = scriviCronologia(lista);
    } else {
      ultimaGuidaContesto.historyId = null;
    }
  }

  if (!ultimaGuidaContesto.historyId) {
    const nuovoId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const voce = { id: nuovoId, createdAt: new Date().toISOString(), ...datiVoce };
    lista.unshift(voce);
    if (lista.length > CRONOLOGIA_MAX_VOCI) {
      lista = lista.slice(0, CRONOLOGIA_MAX_VOCI);
    }
    ok = scriviCronologia(lista);
    ultimaGuidaContesto.historyId = nuovoId;
  }

  if (btn) {
    btn.textContent = ok ? '✅ Salvata!' : '❌ Errore nel salvataggio';
    setTimeout(() => {
      btn.textContent = '💾 Salva in cronologia';
    }, 1800);
  }
}

function normalizzaStepDetails(stepDetails) {
  const normalizzato = {};
  Object.entries(stepDetails).forEach(([indice, valore]) => {
    normalizzato[indice] = Array.isArray(valore) ? valore : [valore];
  });
  return normalizzato;
}

function formattaDataCronologia(isoDate) {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function renderCronologiaLista() {
  const listaEl = document.getElementById('historyList');
  const emptyMsg = document.getElementById('historyEmptyMsg');
  const bulkActions = document.getElementById('historyBulkActions');
  if (!listaEl) return;

  const lista = leggiCronologia();

  if (lista.length === 0) {
    listaEl.innerHTML = '';
    emptyMsg.classList.remove('hidden');
    bulkActions.classList.add('hidden');
    return;
  }

  emptyMsg.classList.add('hidden');
  bulkActions.classList.remove('hidden');

  listaEl.innerHTML = lista.map(voce => `
    <div class="history-item" data-id="${voce.id}">
      <input type="checkbox" class="history-item-checkbox" data-id="${voce.id}">
      <div class="history-item-info">
        <div class="history-item-title">${iconaCategoria(voce.categoria)} ${escapeHtml(voce.guida?.titolo || voce.domanda)}</div>
        <div class="history-item-date">${formattaDataCronologia(voce.createdAt)}</div>
      </div>
      <div class="history-item-actions">
        <button class="history-open-btn" data-id="${voce.id}">Apri</button>
        <button class="history-delete-btn" data-id="${voce.id}" title="Elimina">🗑️</button>
      </div>
    </div>
  `).join('');

  listaEl.querySelectorAll('.history-open-btn').forEach(btn => {
    btn.addEventListener('click', () => apriVoceCronologia(btn.dataset.id));
  });
  listaEl.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Eliminare questa guida dalla cronologia?')) {
        eliminaVoceCronologia(btn.dataset.id);
      }
    });
  });
}

function eliminaVoceCronologia(id) {
  const lista = leggiCronologia().filter(v => v.id !== id);
  scriviCronologia(lista);
  renderCronologiaLista();
}

function eliminaVociSelezionate() {
  const selezionate = Array.from(document.querySelectorAll('.history-item-checkbox:checked')).map(c => c.dataset.id);
  if (selezionate.length === 0) return;
  if (!confirm(`Eliminare ${selezionate.length} guide selezionate dalla cronologia?`)) return;

  const lista = leggiCronologia().filter(v => !selezionate.includes(v.id));
  scriviCronologia(lista);
  renderCronologiaLista();
}

function apriVoceCronologia(id) {
  const voce = leggiCronologia().find(v => v.id === id);
  if (!voce) return;

  ultimaGuidaContesto = {
    domanda: voce.domanda,
    categoria: voce.categoria,
    dettagli: voce.dettagli,
    guida: voce.guida,
    stepDetails: normalizzaStepDetails(voce.stepDetails || {}),
    stepQA: voce.stepQA || {},
    approfondimenti: voce.approfondimenti || [],
    historyId: voce.id
  };

  renderGuida(voce.guida);

  Object.keys(ultimaGuidaContesto.stepDetails).forEach(indice => {
    aggiornaBoxDettagli(Number(indice));
  });

  Object.keys(ultimaGuidaContesto.stepQA).forEach(indice => {
    aggiornaBoxQA(Number(indice));
  });

  ultimaGuidaContesto.approfondimenti.forEach(({ domanda, risposta }) => {
    inserisciApprofondimentoDOM(domanda, risposta);
  });

  chiudiCronologia();
}

function apriCronologia() {
  renderCronologiaLista();
  document.getElementById('historyModalOverlay').classList.remove('hidden');
}

function chiudiCronologia() {
  document.getElementById('historyModalOverlay').classList.add('hidden');
}

function initCronologia() {
  const historyBtn = document.getElementById('historyBtn');
  const closeBtn = document.getElementById('historyModalClose');
  const overlay = document.getElementById('historyModalOverlay');
  const selectAll = document.getElementById('historySelectAll');
  const deleteSelectedBtn = document.getElementById('historyDeleteSelected');

  if (historyBtn) historyBtn.addEventListener('click', apriCronologia);
  if (closeBtn) closeBtn.addEventListener('click', chiudiCronologia);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) chiudiCronologia();
    });
  }
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      document.querySelectorAll('.history-item-checkbox').forEach(c => { c.checked = selectAll.checked; });
    });
  }
  if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', eliminaVociSelezionate);
}

document.addEventListener('components:ready', initCronologia);

document.dispatchEvent(new Event('components:ready'));

// ------------------------------------------------------------
// Registrazione service worker + rilevamento automatico
// di nuove versioni dell'app (mostra un banner "aggiornamento
// disponibile" con bottone OK, solo quando c'è davvero una
// versione nuova pubblicata su GitHub).
// ------------------------------------------------------------

function mostraBannerAggiornamento(nuovoWorker) {
  const banner = document.getElementById('updateBanner');
  const btn = document.getElementById('updateBannerBtn');
  if (!banner || !btn) return;

  banner.classList.remove('hidden');

  btn.onclick = () => {
    // Dice al nuovo service worker in attesa di attivarsi subito.
    nuovoWorker.postMessage('SKIP_WAITING');
    banner.classList.add('hidden');
  };
}

if ('serviceWorker' in navigator) {
  let ricaricamentoInCorso = false;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((registrazione) => {

      // Caso 1: c'è già un nuovo worker in attesa (l'utente aveva
      // l'app aperta quando è arrivato l'aggiornamento).
      if (registrazione.waiting && navigator.serviceWorker.controller) {
        mostraBannerAggiornamento(registrazione.waiting);
      }

      // Caso 2: un nuovo worker viene scaricato ORA (l'utente ha
      // appena riaperto l'app e c'è una versione più recente).
      registrazione.addEventListener('updatefound', () => {
        const nuovoWorker = registrazione.installing;
        if (!nuovoWorker) return;

        nuovoWorker.addEventListener('statechange', () => {
          // "installed" + un controller già attivo = questo NON è
          // la prima installazione, ma un vero aggiornamento.
          if (nuovoWorker.state === 'installed' && navigator.serviceWorker.controller) {
            mostraBannerAggiornamento(nuovoWorker);
          }
        });
      });

    }).catch(err => {
      console.log('Service worker non registrato:', err);
    });
  });

  // Quando il nuovo service worker prende il controllo (dopo aver
  // ricevuto SKIP_WAITING), ricarica la pagina UNA sola volta per
  // mostrare subito la versione aggiornata.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (ricaricamentoInCorso) return;
    ricaricamentoInCorso = true;
    window.location.reload();
  });
}
