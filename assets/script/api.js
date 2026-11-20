const URL_BASE_API = "https://www.thesportsdb.com/api/v1/json/123/";
const FORMATO_DATA = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
});
async function recuperaDatiJson(endpoint, parametri = {}, segnaleAnnullamento) {
    const url = new URL(endpoint, URL_BASE_API);
    for (const [nomeParametro, valoreParametro] of Object.entries(parametri)) {
        url.searchParams.set(nomeParametro, valoreParametro);
    }
    const risposta = await fetch(url, { signal: segnaleAnnullamento });
    if (!risposta.ok) {
        throw new Error(`Errore HTTP ${risposta.status}`);
    }
    const dati = await risposta.json();
    return dati;
}
export class Squadra {
    constructor(_id, _nome, _logo, _lega, _paese, _sport) {
        this.id = _id;
        this.nome = _nome;
        this.logo = _logo;
        this.lega = _lega;
        this.paese = _paese;
        this.sport = _sport;
    }
    static fromApi(datiSquadra) {
        const id = datiSquadra.idTeam;
        const nome = datiSquadra.strTeam;
        const logo = datiSquadra.strBadge || "";
        const lega = datiSquadra.strLeague || "";
        const paese = datiSquadra.strCountry || "";
        const sport = datiSquadra.strSport || "";
        return new Squadra(id, nome, logo, lega, paese, sport);
    }
    static fromJSON(datiSquadra) {
        return new Squadra(
            datiSquadra.id,
            datiSquadra.nome,
            datiSquadra.logo,
            datiSquadra.lega,
            datiSquadra.paese,
            datiSquadra.sport
        );
    }
}
class Evento {
    constructor(_id, _data, _squadraCasa, _squadraOspite, _punteggioCasa, _punteggioOspite, _dettagli) {
        this.id = _id;
        this.data = new Date(data);
        this.casa = _squadraCasa;
        this.trasferta = _squadraOspite;
        this.punteggioCasa = _punteggioCasa;
        this.punteggioTrasferta = _punteggioOspite;
        this.extra = _dettagli;
    }
    static fromApi(datiEvento) {
        const dettagli = {
            ora: datiEvento.strTime || "",
            lega: datiEvento.strLeague || "",
            stadio: datiEvento.strVenue || "",
        };
        return new Evento(
            datiEvento.idEvent,
            datiEvento.dateEvent,
            datiEvento.strHomeTeam,
            datiEvento.strAwayTeam,
            datiEvento.intHomeScore,
            datiEvento.intAwayScore,
            dettagli
        );
    }
    get dataFormattata() {
        if (Number.isNaN(this.data.getTime())) {
            return "—";
        }
        return FORMATO_DATA.format(this.data);
    }
    punteggio() {
        const punteggioCasaMancante =
            this.punteggioCasa === null || this.punteggioCasa === undefined || this.punteggioCasa === "";
        const punteggioOspiteMancante =
            this.punteggioTrasferta === null || this.punteggioTrasferta === undefined || this.punteggioTrasferta === "";
        if (punteggioCasaMancante || punteggioOspiteMancante) {
            return null;
        }
        return `${this.punteggioCasa} - ${this.punteggioTrasferta}`;
    }
}
export async function cercaSquadre(query, segnaleAnnullamento) {
    const dati = await recuperaDatiJson(
        "searchteams.php",
        { t: query },
        segnaleAnnullamento
    );
    if (!dati.teams) {
        return [];
    }
    return dati.teams.map((datiSquadra) => Squadra.fromApi(datiSquadra));
}
export async function prossimiEventi(idSquadra, segnaleAnnullamento) {
    const dati = await recuperaDatiJson(
        "eventsnext.php",
        { id: idSquadra },
        segnaleAnnullamento
    );
    if (!dati.events) {
        return [];
    }
    return dati.events.map((datiEvento) => Evento.fromApi(datiEvento));
}
export async function ultimiRisultati(idSquadra, segnaleAnnullamento) {
    const dati = await recuperaDatiJson(
        "eventslast.php",
        { id: idSquadra },
        segnaleAnnullamento
    );
    if (!dati.results) {
        return [];
    }
    return dati.results.map((datiEvento) => Evento.fromApi(datiEvento));
}