// SportsHub — Week Project Settimana VII
//
// Devi fare 4 cose per la Versione Base:
// 1. Definire le classi Squadra ed Evento (mappano i dati di TheSportsDB)
// 2. Funzione async cercaSquadre(query) che chiama /searchteams.php
// 3. Funzione async caricaDettagli(idTeam) che chiama in parallelo
//    eventsnext.php + eventslast.php usando Promise.all
// 4. Render dinamico: card squadre, lista prossimi eventi, lista risultati
//
// Endpoint base: https://www.thesportsdb.com/api/v1/json/3/
// Il `3` nell'URL è la chiave API pubblica di test di TheSportsDB: gratis, non serve registrarsi.
//
// Per le versioni Intermedia/Avanzata: localStorage preferiti, debounce, Promise.all multi.


// === Classi ===

import { Squadra, cercaSquadre, prossimiEventi, ultimiRisultati } from "./api.js";
import {
    mostraSpinner,
    mostraErrore,
    nascondiErrore,
    renderRisultati,
    renderPreferiti,
    renderDettaglio,
    renderAppuntamenti,
    apriModale,
} from "./ui.js";

const CHIAVE_PREFERITI = "sportshub:preferiti";
const MSG_INIZIO = "Inizia cercando una squadra qui sopra";
const MSG_NESSUNA = "Nessuna squadra trovata";

const stato = {
    risultati: [],
    filtro: "all",
    preferiti: [],
    eventi: new Map(), // idEvent -> Evento, per aprire la modale
    controllerRicerca: null,
    controllerDettaglio: null,
    ultimaQuery: "",
    tokenAppuntamenti: 0,
};

// ---------- utilità ----------
function debounce(fn, ms) {
    let timer;
    const wrapped = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
}

const isAbort = (err) => err?.name === "AbortError";

function registraEventi(eventi) {
    for (const e of eventi) stato.eventi.set(e.id, e);
}

// ---------- preferiti (localStorage) ----------
function caricaPreferiti() {
    try {
        const raw = localStorage.getItem(CHIAVE_PREFERITI);
        const lista = raw ? JSON.parse(raw) : [];
        return Array.isArray(lista) ? lista.map(Squadra.fromJSON) : [];
    } catch {
        return [];
    }
}

function salvaPreferiti() {
    try {
        localStorage.setItem(CHIAVE_PREFERITI, JSON.stringify(stato.preferiti));
    } catch {
        mostraErrore("Impossibile salvare i preferiti in questo browser.");
    }
}

const idsPreferiti = () => new Set(stato.preferiti.map((s) => s.id));

// ---------- render ----------
function squadreFiltrate() {
    if (stato.filtro === "all") return stato.risultati;
    return stato.risultati.filter((s) => s.sport === stato.filtro);
}

function aggiornaRisultati() {
    const messaggio = stato.ultimaQuery ? MSG_NESSUNA : MSG_INIZIO;
    renderRisultati(squadreFiltrate(), idsPreferiti(), messaggio);
}

// ---------- ricerca ----------
async function cerca(query) {
    const q = query.trim();
    stato.controllerRicerca?.abort();

    if (!q) {
        stato.ultimaQuery = "";
        stato.risultati = [];
        nascondiErrore();
        aggiornaRisultati();
        return;
    }

    const controller = new AbortController();
    stato.controllerRicerca = controller;
    stato.ultimaQuery = q;
    nascondiErrore();
    mostraSpinner(document.getElementById("risultati"));

    try {
        stato.risultati = await cercaSquadre(q, controller.signal);
        aggiornaRisultati();
    } catch (err) {
        if (isAbort(err)) return;
        stato.risultati = [];
        aggiornaRisultati();
        mostraErrore(`Errore durante la ricerca: ${err.message}`);
    }
}

const cercaDebounced = debounce(cerca, 400);

// ---------- dettaglio ----------
async function mostraDettaglio(id) {
    const squadra =
        stato.risultati.find((s) => s.id === id) ?? stato.preferiti.find((s) => s.id === id);
    if (!squadra) return;

    stato.controllerDettaglio?.abort();
    const controller = new AbortController();
    stato.controllerDettaglio = controller;

    const box = document.getElementById("dettagli-section");
    box.hidden = false;
    mostraSpinner(box);
    nascondiErrore();

    try {
        const [prossimi, ultimi] = await Promise.all([
            prossimiEventi(squadra.id, controller.signal),
            ultimiRisultati(squadra.id, controller.signal),
        ]);
        registraEventi(prossimi);
        registraEventi(ultimi);
        renderDettaglio(squadra, prossimi, ultimi);
        box.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
        if (isAbort(err)) return;
        box.hidden = true;
        mostraErrore(`Impossibile caricare gli eventi di ${squadra.nome}: ${err.message}`);
    }
}

// ---------- appuntamenti dei preferiti ----------
async function aggiornaAppuntamenti() {
    const token = ++stato.tokenAppuntamenti;
    if (stato.preferiti.length === 0) {
        renderAppuntamenti([]);
        return;
    }

    const esiti = await Promise.allSettled(stato.preferiti.map((s) => prossimiEventi(s.id)));
    if (token !== stato.tokenAppuntamenti) return; // risposta superata da una più recente

    const unici = new Map();
    for (const esito of esiti) {
        if (esito.status !== "fulfilled") continue;
        for (const evento of esito.value) unici.set(evento.id, evento);
    }
    const eventi = [...unici.values()].sort((a, b) => a.data - b.data);
    registraEventi(eventi);
    renderAppuntamenti(eventi);
}

// ---------- azioni preferiti ----------
function aggiungiPreferito(id) {
    if (idsPreferiti().has(id)) return;
    const squadra = stato.risultati.find((s) => s.id === id);
    if (!squadra) return;
    stato.preferiti.push(squadra);
    salvaPreferiti();
    renderPreferiti(stato.preferiti);
    aggiornaRisultati();
    aggiornaAppuntamenti();
}

function rimuoviPreferito(id) {
    stato.preferiti = stato.preferiti.filter((s) => s.id !== id);
    salvaPreferiti();
    renderPreferiti(stato.preferiti);
    aggiornaRisultati();
    aggiornaAppuntamenti();
}

// ---------- gestione click (event delegation) ----------
function gestisciClick(evt) {
    const target = evt.target.closest("[data-action]");
    if (!target) return;
    const { action } = target.dataset;

    if (action === "aggiungi") {
        evt.stopPropagation();
        aggiungiPreferito(target.dataset.id);
    } else if (action === "rimuovi") {
        evt.stopPropagation();
        rimuoviPreferito(target.dataset.id);
    } else if (action === "dettaglio") {
        mostraDettaglio(target.dataset.id);
    } else if (action === "evento") {
        const evento = stato.eventi.get(target.dataset.eventId);
        if (evento) apriModale(evento);
    }
}

function gestisciTastiera(evt) {
    if (evt.key !== "Enter" && evt.key !== " ") return;
    const card = evt.target;
    if (!card.matches?.(".card[data-action='dettaglio']")) return;
    evt.preventDefault();
    mostraDettaglio(card.dataset.id);
}

// ---------- init ----------
function init() {
    const form = document.getElementById("form-ricerca");
    const input = document.getElementById("q");
    const filtri = document.getElementById("filtri");

    input.addEventListener("input", () => cercaDebounced(input.value));
    form.addEventListener("submit", (evt) => {
        evt.preventDefault();
        cercaDebounced.cancel();
        cerca(input.value);
    });

    filtri.addEventListener("click", (evt) => {
        const btn = evt.target.closest("button[data-sport]");
        if (!btn) return;
        stato.filtro = btn.dataset.sport;
        for (const b of filtri.querySelectorAll("button")) {
            b.setAttribute("aria-pressed", String(b === btn));
        }
        aggiornaRisultati();
    });

    for (const id of ["risultati", "preferiti", "dettagli-section", "appuntamenti"]) {
        const contenitore = document.getElementById(id);
        contenitore.addEventListener("click", gestisciClick);
        contenitore.addEventListener("keydown", gestisciTastiera);
    }

    // chiudi la modale cliccando sullo sfondo
    const modale = document.getElementById("modale");
    modale.addEventListener("click", (evt) => {
        if (evt.target === modale) modale.close();
    });

    stato.preferiti = caricaPreferiti();
    renderPreferiti(stato.preferiti);
    aggiornaRisultati();
    aggiornaAppuntamenti();
}

init();


// === API ===
// Accesso a TheSportsDB e modelli dati
const BASE = "https://www.thesportsdb.com/api/v1/json/123/";

async function getJson(endpoint, params = {}, signal) {
    const url = new URL(endpoint, BASE);
    for (const [chiave, valore] of Object.entries(params)) {
        url.searchParams.set(chiave, valore);
    }
    const res = await fetch(url, { signal });
    if (!res.ok) {
        throw new Error(`Errore HTTP ${res.status}`);
    }
    return res.json();
}

const formatoData = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
});

class Squadra {
    constructor(id, nome, logo, lega, paese, sport) {
        this.id = id;
        this.nome = nome;
        this.logo = logo;
        this.lega = lega;
        this.paese = paese;
        this.sport = sport;
    }

    static fromApi(t) {
        return new Squadra(t.idTeam, t.strTeam, t.strBadge || "", t.strLeague || "", t.strCountry || "", t.strSport || "");
    }

    static fromJSON(o) {
        return new Squadra(o.id, o.nome, o.logo, o.lega, o.paese, o.sport);
    }
}

class Evento {
    constructor(id, data, casa, trasferta, punteggioCasa, punteggioTrasferta, extra = {}) {
        this.id = id;
        this.data = new Date(data);
        this.casa = casa;
        this.trasferta = trasferta;
        this.punteggioCasa = punteggioCasa;
        this.punteggioTrasferta = punteggioTrasferta;
        this.extra = extra;
    }

    static fromApi(e) {
        return new Evento(
            e.idEvent,
            e.dateEvent,
            e.strHomeTeam,
            e.strAwayTeam,
            e.intHomeScore,
            e.intAwayScore,
            { ora: e.strTime || "", lega: e.strLeague || "", stadio: e.strVenue || "" }
        );
    }

    get dataFormattata() {
        return Number.isNaN(this.data.getTime()) ? "—" : formatoData.format(this.data);
    }

    punteggio() {
        const vuoto = (v) => v === null || v === undefined || v === "";
        if (vuoto(this.punteggioCasa) || vuoto(this.punteggioTrasferta)) return null;
        return `${this.punteggioCasa} - ${this.punteggioTrasferta}`;
    }
}

async function cercaSquadre(q, signal) {
    const json = await getJson("searchteams.php", { t: q }, signal);
    return (json.teams ?? []).map(Squadra.fromApi);
}

async function prossimiEventi(id, signal) {
    const json = await getJson("eventsnext.php", { id }, signal);
    return (json.events ?? []).map(Evento.fromApi);
}

async function ultimiRisultati(id, signal) {
    const json = await getJson("eventslast.php", { id }, signal);
    return (json.results ?? []).map(Evento.fromApi);
}

// === Stato ===

// Rendering del DOM (solo createElement / textContent, niente innerHTML)

const $ = (id) => document.getElementById(id);

function el(tag, { className, text, attrs, dataset } = {}, ...children) {
    const nodo = document.createElement(tag);
    if (className) nodo.className = className;
    if (text !== undefined) nodo.textContent = text;
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) nodo.setAttribute(k, v);
    }
    if (dataset) Object.assign(nodo.dataset, dataset);
    nodo.append(...children.filter(Boolean));
    return nodo;
}

const vuoto = (testo) => el("p", { className: "empty col-12", text: testo });

// Ogni card viene avvolta in una colonna Bootstrap (.col) della griglia .row
const colonna = (contenuto) => el("div", { className: "col" }, contenuto);

export function mostraSpinner(contenitore) {
    contenitore.replaceChildren(
        el("div", { className: "spinner-wrap col-12" }, el("div", { className: "spinner", attrs: { role: "status", "aria-label": "Caricamento" } }))
    );
}

export function mostraErrore(messaggio) {
    const box = $("alert");
    box.textContent = messaggio;
    box.hidden = false;
}

export function nascondiErrore() {
    const box = $("alert");
    box.textContent = "";
    box.hidden = true;
}

function logo(squadra) {
    if (squadra.logo) {
        return el("img", { attrs: { src: squadra.logo, alt: `Logo ${squadra.nome}`, loading: "lazy" } });
    }
    return el("div", { className: "logo-placeholder", text: "🏟", attrs: { "aria-hidden": "true" } });
}

function cardSquadra(squadra, pulsante) {
    return el(
        "article",
        {
            className: "card card-squadra h-100 text-center shadow-sm",
            attrs: { tabindex: "0", "aria-label": `Dettagli ${squadra.nome}` },
            dataset: { id: squadra.id, action: "dettaglio" },
        },
        logo(squadra),
        el("h3", { text: squadra.nome }),
        el("p", { className: "meta", text: squadra.lega }),
        el("p", { className: "meta", text: squadra.paese }),
        pulsante
    );
}

export function renderRisultati(squadre, idsPreferiti, messaggioVuoto) {
    const box = $("risultati");
    if (squadre.length === 0) {
        box.replaceChildren(vuoto(messaggioVuoto));
        return;
    }
    box.replaceChildren(
        ...squadre.map((s) => {
            const giaPreferita = idsPreferiti.has(s.id);
            const btn = el("button", {
                className: "btn btn-warning btn-fav",
                text: giaPreferita ? "✓ Già nei preferiti" : "★ Aggiungi ai preferiti",
                attrs: { type: "button" },
                dataset: { action: "aggiungi", id: s.id },
            });
            btn.disabled = giaPreferita;
            return colonna(cardSquadra(s, btn));
        })
    );
}

export function renderPreferiti(preferiti) {
    const box = $("preferiti");
    if (preferiti.length === 0) {
        box.replaceChildren(
            vuoto("Non hai ancora salvato nessuna squadra. Cercane una qui sopra e aggiungila ai preferiti.")
        );
        return;
    }
    box.replaceChildren(
        ...preferiti.map((s) =>
            colonna(
                cardSquadra(
                    s,
                    el("button", {
                        className: "btn btn-outline-danger btn-remove",
                        text: "🗑 Rimuovi",
                        attrs: { type: "button" },
                        dataset: { action: "rimuovi", id: s.id },
                    })
                )
            )
        )
    );
}

function rigaEvento(evento) {
    const punteggio = evento.punteggio();
    return el(
        "li",
        {},
        el(
            "button",
            {
                className: "event",
                attrs: { type: "button" },
                dataset: { action: "evento", eventId: evento.id },
            },
            el("span", { className: "event-date", text: evento.dataFormattata }),
            el("span", { className: "event-teams", text: `${evento.casa} vs ${evento.trasferta}` }),
            punteggio ? el("span", { className: "badge rounded-pill text-bg-success", text: punteggio }) : null
        )
    );
}

function listaEventi(eventi, messaggioVuoto = "Nessun evento in programma") {
    if (eventi.length === 0) return el("p", { className: "event-empty", text: messaggioVuoto });
    return el("ul", { className: "events" }, ...eventi.map(rigaEvento));
}

export function renderDettaglio(squadra, prossimi, ultimi) {
    const box = $("dettagli-section");
    box.replaceChildren(
        el("h2", { text: squadra.nome }),
        el("h3", { text: "Prossimi eventi" }),
        listaEventi(prossimi),
        el("h3", { text: "Ultimi risultati" }),
        listaEventi(ultimi, "Nessun risultato disponibile")
    );
    box.hidden = false;
}

export function renderAppuntamenti(eventi) {
    const sezione = $("sez-appuntamenti");
    if (eventi.length === 0) {
        sezione.hidden = true;
        $("appuntamenti").replaceChildren();
        return;
    }
    $("appuntamenti").replaceChildren(listaEventi(eventi));
    sezione.hidden = false;
}

export function apriModale(evento) {
    const righe = [
        ["Data", evento.dataFormattata],
        ["Ora", evento.extra.ora],
        ["Competizione", evento.extra.lega],
        ["Stadio", evento.extra.stadio],
        ["Risultato", evento.punteggio()],
    ].filter(([, valore]) => valore);

    const dl = el("dl");
    for (const [etichetta, valore] of righe) {
        dl.append(el("dt", { text: etichetta }), el("dd", { text: valore }));
    }

    $("modale-contenuto").replaceChildren(
        el("h2", { text: `${evento.casa} vs ${evento.trasferta}` }),
        dl
    );
    $("modale").showModal();
}



// === Render ===



// === Eventi ===
