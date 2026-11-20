import {
    Squadra,
    cercaSquadre,
    prossimiEventi,
    ultimiRisultati
}
    from "./api.js";

import {
    mostraSpinner,
    mostraErrore,
    nascondiErrore,
    renderRisultati,
    renderPreferiti,
    renderDettaglio,
    renderAppuntamenti,
    apriModale,
}
    from "./ui.js";

const getElemento = (id) => document.getElementById(id);
const CHIAVE_PREFERITI = "sportshub:preferiti";
const stato = {
    risultati: [],
    filtroSport: "all",
    preferiti: [],
    eventi: new Map(),
    ricerca: null,
    dettaglio: null,
    ultimaRicerca: "",
    versioneAppuntamenti: 0,
};

// Raggruppa le ricerche ravvicinate.
function debounce(funzione, attesa) {
    let timer;
    const ritardata = (...argomenti) => {
        clearTimeout(timer);
        timer = setTimeout(() => funzione(...argomenti), attesa);
    };
    ritardata.cancel = () => clearTimeout(timer);
    return ritardata;
}

const registraEventi = (eventi) =>
    eventi.forEach((evento) =>
        stato.eventi.set(evento.id, evento));

const idPreferiti = () =>
    new Set(stato.preferiti.map((squadra) =>
        squadra.id));

const caricaPreferiti = () => {
    try {
        const dati = JSON.parse(localStorage.getItem(CHIAVE_PREFERITI) || "[]");
        return Array.isArray(dati) ? dati.map(Squadra.fromJSON) : [];
    } catch { return []; }
};
const salvaPreferiti = () => {
    try { localStorage.setItem(CHIAVE_PREFERITI, JSON.stringify(stato.preferiti)); }
    catch { mostraErrore("Impossibile salvare i preferiti"); }
};

function aggiornaRisultati() {
    const squadre = stato.filtroSport === "all" ? stato.risultati
        : stato.risultati.filter((squadra) => squadra.sport === stato.filtroSport);
    renderRisultati(squadre, idPreferiti(), stato.ultimaRicerca
        ? "Nessuna squadra trovata" : "Inizia cercando una squadra qui sopra");
}

// Annulla la richiesta precedente per non mostrare risposte fuori ordine.
async function cercaSquadreTesto(testo) {
    const query = testo.trim();
    stato.ricerca?.abort();
    if (!query) {
        stato.ultimaRicerca = "";
        stato.risultati = [];
        nascondiErrore();
        return aggiornaRisultati();
    }

    const controller = stato.ricerca = new AbortController();
    stato.ultimaRicerca = query;
    nascondiErrore();
    mostraSpinner(getElemento("risultati"));
    try {
        stato.risultati = await cercaSquadre(query, controller.signal);
        aggiornaRisultati();
    } catch (errore) {
        if (errore.name === "AbortError")
            return;
        stato.risultati = [];
        aggiornaRisultati();
        mostraErrore(`Errore durante la ricerca: ${errore.message}`);
    }
}
const cercaRitardata = debounce(cercaSquadreTesto, 400);

async function mostraDettaglio(teamId) {
    const squadra = [...stato.risultati, ...stato.preferiti].find((item) => item.id === teamId);
    if (!squadra) return;
    stato.dettaglio?.abort();
    const controller = stato.dettaglio = new AbortController();
    const sezione = getElemento("dettagli-section");
    sezione.hidden = false;
    mostraSpinner(sezione);
    nascondiErrore();
    try {
        const [prossimi, risultati] = await Promise.all([
            prossimiEventi(squadra.id, controller.signal),
            ultimiRisultati(squadra.id, controller.signal),
        ]);
        registraEventi([...prossimi, ...risultati]);
        renderDettaglio(squadra, prossimi, risultati);

    } catch (errore) {
        if (errore.name === "AbortError") return;
        sezione.hidden = true;
        mostraErrore(`Impossibile caricare gli eventi di ${squadra.nome}: ${errore.message}`);
    }
}

// Deduplica e ordina gli appuntamenti dei preferiti.
async function aggiornaAppuntamenti() {
    const versione = ++stato.versioneAppuntamenti;
    if (!stato.preferiti.length) return renderAppuntamenti([]);
    const risposte = await Promise.allSettled(
        stato.preferiti.map((squadra) => prossimiEventi(squadra.id))
    );
    if (versione !== stato.versioneAppuntamenti) return;
    const eventi = new Map();
    risposte.forEach(({ status, value }) => {
        if (status === "fulfilled") value.forEach((evento) => eventi.set(evento.id, evento));
    });
    const ordinati = [...eventi.values()].sort((a, b) => a.data - b.data);
    registraEventi(ordinati);
    renderAppuntamenti(ordinati);
}

function aggiornaPreferiti(teamId, aggiungi) {
    if (aggiungi) {
        if (idPreferiti().has(teamId)) return;
        const squadra = stato.risultati.find((item) => item.id === teamId);
        if (!squadra) return;
        stato.preferiti.push(squadra);
    } else stato.preferiti = stato.preferiti.filter((squadra) => squadra.id !== teamId);
    salvaPreferiti();
    renderPreferiti(stato.preferiti);
    aggiornaRisultati();
    aggiornaAppuntamenti();
}

function gestisciClick(evento) {
    const target = evento.target.closest("[data-action]");
    if (!target) return;
    const { action, id, eventId } = target.dataset;
    if (action === "aggiungi" || action === "rimuovi") {
        evento.stopPropagation();
        aggiornaPreferiti(id, action === "aggiungi");
    } else if (action === "dettaglio") mostraDettaglio(id);
    else if (action === "evento") {
        const dettaglio = stato.eventi.get(eventId);
        if (dettaglio) apriModale(dettaglio);
    }
}

function gestisciTastiera(evento) {
    if (!["Enter", " "].includes(evento.key)) return;
    const scheda = evento.target;
    if (!scheda.matches?.(".card[data-action='dettaglio']")) return;
    evento.preventDefault();
    mostraDettaglio(scheda.dataset.id);
}

function inizializzaApp() {
    const modulo = getElemento("form-ricerca"), campo = getElemento("q"), filtri = getElemento("filtri");
    campo.addEventListener("input", () => cercaRitardata(campo.value));
    modulo.addEventListener("submit", (evento) => {
        evento.preventDefault();
        cercaRitardata.cancel();
        cercaSquadreTesto(campo.value);
    });
    filtri.addEventListener("click", (evento) => {
        const pulsante = evento.target.closest("button[data-sport]");
        if (!pulsante) return;
        stato.filtroSport = pulsante.dataset.sport;
        filtri.querySelectorAll("button").forEach((altro) =>
            altro.setAttribute("aria-pressed", String(altro === pulsante))
        );
        aggiornaRisultati();
    });
    ["risultati", "preferiti", "dettagli-section", "appuntamenti"].forEach((id) => {
        const contenitore = getElemento(id);
        contenitore.addEventListener("click", gestisciClick);
        contenitore.addEventListener("keydown", gestisciTastiera);
    });
    const modale = getElemento("modale");
    modale.addEventListener("click", (evento) => {
        if (evento.target === modale) modale.close();
    });
    stato.preferiti = caricaPreferiti();
    renderPreferiti(stato.preferiti);
    aggiornaRisultati();
    aggiornaAppuntamenti();
}

inizializzaApp();