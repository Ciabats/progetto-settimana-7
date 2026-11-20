//funzione per inteercettare tag html con ID
const getElemento = (id) => document.getElementById(id);

//funzione che crea 
function creaTag(tag, opzioni = {}, ...figli) {
    const elemento = document.createElement(tag);
    const { className, text, attribute, dataset } = opzioni;
    if (className) elemento.className = className;
    if (text !== undefined) elemento.textContent = text;
    if (attribute) Object.entries(attribute).forEach(([nome, valore]) => elemento.setAttribute(nome, valore));
    if (dataset) Object.assign(elemento.dataset, dataset);
    elemento.append(...figli.filter(Boolean));
    return elemento;
}
const paragrafo = (testo) => creaTag("p", {
    className: "empty col-12",
    text: testo
});
const scheda = (contenuto) => creaTag("div", { className: "col" }, contenuto);

export function mostraSpinner(contenitore) {
    contenitore.replaceChildren(creaTag("div", { className: "spinner-wrap col-12" },
        creaTag("div",
            {
                className: "spinner",
                attribute: {
                    role: "status",
                    "aria-label": "Caricamento"
                }
            })
    ));
}
export function mostraErrore(testo) {
    const avviso = getElemento("alert");
    avviso.textContent = testo;
    avviso.hidden = false;
}
export function nascondiErrore() {
    const avviso = getElemento("alert");
    avviso.textContent = "";
    avviso.hidden = true;
}
function schedaSquadra(squadra, pulsante) {
    const logo = squadra.logo
        ? creaTag("img", { attribute: { src: squadra.logo, alt: `Logo ${squadra.nome}`, loading: "lazy" } })
        : creaTag("div", { className: "logo-placeholder", text: "🏟", attribute: { "aria-hidden": "true" } });

    return creaTag("article", {
        className: "card card-squadra h-100 text-center shadow-sm",
        attribute: {
            tabindex: "0",
            "aria-label": `Dettagli ${squadra.nome}`
        },
        dataset:
        {
            id: squadra.id,
            action: "dettaglio"
        },
    },
        logo,
        creaTag("h3", {
            text: squadra.nome
        }),
        creaTag("p", {
            className: "meta",
            text: squadra.lega
        }),
        creaTag("p", {
            className: "meta",
            text: squadra.paese
        }), pulsante);
}
const button = (testo, azione, id, className) => creaTag("button", {
    className,
    text: testo,
    attribute: { type: "button" },
    dataset: { action: azione, id },
});

export function renderRisultati(squadre, idPreferiti, testoVuoto) {
    const elenco = getElemento("risultati");

    if (!squadre.length) return elenco.replaceChildren(paragrafo(testoVuoto));
    elenco.replaceChildren(...squadre.map((squadra) => {
        const preferita = idPreferiti.has(squadra.id);
        const bottone = button(preferita ? "✓ Già nei preferiti" : "★ Aggiungi ai preferiti",
            "aggiungi", squadra.id, "btn btn-warning btn-fav");
        bottone.disabled = preferita;
        return scheda(schedaSquadra(squadra, bottone));
    }));
}
export function renderPreferiti(preferiti) {
    const elenco = getElemento("preferiti");
    if (!preferiti.length) return elenco.replaceChildren(paragrafo(
        "Non hai ancora salvato nessuna squadra. Cercane una qui sopra e aggiungila ai preferiti."
    ));
    elenco.replaceChildren(...preferiti.map((squadra) => scheda(schedaSquadra(
        squadra, button("🗑 Rimuovi", "rimuovi", squadra.id, "btn btn-outline-danger btn-remove")
    ))));
}
function listaEventi(eventi, testoVuoto = "Nessun evento in programma") {
    if (!eventi.length)
        return creaTag("p", {
            className: "event-empty",
            text: testoVuoto
        });
    return creaTag("ul", { className: "events" }, ...eventi.map((evento) => {
        const punteggio = evento.punteggio();
        return creaTag("li", {}, creaTag("button", {
            className: "event",
            attribute: {
                type: "button"
            },
            dataset: {
                action: "evento",
                eventId: evento.id
            },

        }, creaTag("span", {
            lassName: "event-date",
            text: evento.dataFormattata
        }),
            creaTag("span", {
                className: "event-teams",
                text: `${evento.casa} vs ${evento.trasferta}`
            }),
            punteggio && creaTag("span", {
                className: "badge rounded-pill text-bg-success", text: punteggio,
            })));
    }));
}
export function renderDettaglio(squadra, prossimi, risultati) {
    const sezione = getElemento("dettagli-section");
    sezione.replaceChildren(creaTag("h2", { text: squadra.nome }),
        creaTag("h3", { text: "Prossimi eventi" }), listaEventi(prossimi),
        creaTag("h3", { text: "Ultimi risultati" }),
        listaEventi(risultati, "Nessun risultato disponibile"));
    sezione.hidden = false;
}
export function renderAppuntamenti(eventi) {
    const sezione = getElemento("sez-appuntamenti"), elenco = getElemento("appuntamenti");
    elenco.replaceChildren(...(eventi.length ? [listaEventi(eventi)] : []));
    sezione.hidden = !eventi.length;
}
export function apriModale(evento) {
    const righe = [
        ["Data", evento.dataFormattata], ["Ora", evento.extra.ora],
        ["Competizione", evento.extra.lega], ["Stadio", evento.extra.stadio],
        ["Risultato", evento.punteggio()],
    ].filter(([, valore]) => valore);
    const dettagli = creaTag("dl");
    righe.forEach(([etichetta, valore]) => dettagli.append(
        creaTag("dt", { text: etichetta }), creaTag("dd", { text: valore })
    ));
    getElemento("modale-contenuto").replaceChildren(
        creaTag("h2", { text: `${evento.casa} vs ${evento.trasferta}` }), dettagli
    );
    getElemento("modale").showModal();
}