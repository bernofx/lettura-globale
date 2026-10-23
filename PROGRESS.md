# PROGRESS — Lettura Globale

**Aggiornato:** 23 ottobre 2026

**Fase:** prototipo cloud funzionale pubblico

**Target:** Cloudflare Workers + D1 + R2, distribuito automaticamente da GitHub

## Completato

- [x] Scritture granulari compatibili con le viste ridotte per ruolo: gli ordini inviati da terapisti e supervisori preservano nel documento completo sequenze, bambini ed eventi non visibili, evitando il ciclo `400 invalid_state_change` senza perdere la coda locale.
- [x] Controlli della sessione compattati: il QR è un indicatore nella barra superiore e apre il pannello solo su richiesta; il volume di voce e suoni è regolabile da 0 a 100; `Termina` richiede due secondi ed è disponibile anche mentre un telefono controlla l'avanzamento.
- [x] Su mobile le attività standard con due risposte mostrano le immagini una sotto l’altra per massimizzarne l’area; `IL / LA` conserva la propria disposizione dedicata. Le cinque scene del cane nel catalogo frasi usano ora un mantello grigio, distinguibile dal gatto rosso, mantenendo azioni e stile fotografico coerenti.
- [x] Secondo blocco di hardening: PIN nuovi in PBKDF2 versionato con compatibilità SHA-256, rate limit D1 per email e rete (5 errori/15 minuti con blocco progressivo), rimozione del fallback in chiaro e migrazione `0014` forward-only.
- [x] Link pubblici con scadenza a 30 giorni, revoca dal pannello Configurazione, controllo uniforme anche sui media, cache disabilitata e pulizia opportunistica degli snapshot non più attivi.
- [x] Letture dello stato ridotte per profilo: PIN altrui rimossi, bambini e dati operativi limitati alle associazioni, storico del terapista limitato alle sessioni condotte e fallback completo riservato all’amministratore.
- [x] Ulteriore riduzione del debito client: grafico e celle dei progressi estratti in un componente dedicato e notifiche temporizzate centralizzate con cancellazione dei timer precedenti.
- [x] Primo blocco di hardening successivo alla code review: revoca server-side al logout, autorizzazione delle modifiche per profilo adulto, tentativi/aiuti append-only, proprietà delle sequenze e accesso ai bambini verificati anche nelle API; fallback `PUT` protetto da revisione e batch atomico per snapshot e credenziali.
- [x] Confine upload rafforzato con verifica dei byte reali PNG/JPEG/WebP, lettura delle dimensioni, limiti in pixel e lato massimo e metadati tecnici R2; validazione del formato login resa esplicita.
- [x] Controller QR alleggerito senza ridurre la frequenza percepita: heartbeat D1 limitato a uno ogni tre secondi e aggiornamenti React ignorati quando stato e snapshot non cambiano.
- [x] Primo intervento di riduzione del debito client: collezioni visibili memoizzate e indicizzate per ID, cache immagini con limite, drag pointer condiviso fra riconoscimento e frasi e serie `Numero quantità` aggiunta al grafico.
- [x] Stato cloud reso semanticamente corretto: un refresh di sola lettura fallito non mostra più il falso allarme rosso “Non salvato nel cloud” quando la revisione locale coincide con l’ultima confermata; journal esteso con `refresh_failed` e `cloud_load_failed`, stato HTTP e codice errore.
- [x] Libreria resa compatta per impostazione predefinita: immagini singole e frasi mostrano quattro schede con espansione esplicita, mentre ricerca e filtro mostrano tutti i risultati. Le preferenze dei quattro suoni passano dal solo dispositivo allo stato cloud dell’account, recuperando la configurazione locale storica e mantenendo la coda offline. Verificata inoltre la presenza delle 20 immagini d’azione nell’output distribuito e rinnovata la cache PWA.
- [x] Console QR resa più reattiva: il PC legge i comandi ogni 450 ms con una sola richiesta, mentre lo snapshot viene scritto soltanto quando cambia; il telefono aggiorna lo stato ogni 650 ms. Ogni tasto offre ora feedback immediato alla pressione, vibrazione quando supportata e stati accessibili di invio, conferma o errore.
- [x] MVP della console adulta da telefono pubblicato: QR autenticato, approvazione sul PC, heartbeat/lease, comandi ordinati e idempotenti in D1, blocco dell'avanzamento automatico mentre il telefono è connesso, shuffle, aiuti, audio, pausa e navigazione. Un nuovo telefono revoca immediatamente il precedente (“vince l'ultimo”) e la perdita della connessione ripristina i controlli locali senza cambiare turno. Migrazione `0011` applicata in produzione.
- [x] Pronuncia iniziale di `Numero quantità` resa affidabile a motore vocale freddo: attesa di `voiceschanged`, timeout controllato, un solo retry su errore e comando manuale di riascolto conservato.
- [x] Export CSV compatibile con Excel italiano: UTF-16LE con BOM, separatore dichiarato `;`, righe CRLF, escape completo e neutralizzazione delle formule; nello stesso file include riepiloghi per competenza e parola × competenza, con Valutazione e Insegnamento separate e stato descrittivo basato sui primi tentativi.
- [x] Aspetto ampliato a sette palette e quattro forme, con sette preset incluso `Lettura Globale`, ispirato al giallo, blu notte e azzurro dell’icona applicativa; migrazione `0010` forward-only per estendere i vincoli delle preferenze D1 già distribuite.
- [x] Aggiornamento PWA dei nuovi temi reso esplicito: cache applicativa `v17` e controllo del service worker senza riuso della cache HTTP, così una riapertura carica il pannello Aspetto corrente.
- [x] Configurazione Wrangler di produzione versionata e flusso GitHub → Cloudflare Workers Builds definito: build da `main`, deploy sul Worker `lettura-globale`, UUID D1 reale anche nella configurazione generata da Vinext, binding D1/R2 esistenti conservati e migrazioni escluse dal deploy ordinario.
- [x] Preferenze audio globali del dispositivo per risposta corretta, errata, completamento di ciascun esercizio nella sequenza e selezione in `Numero quantità`; aggiunti tre MP3 forniti e varianti sintetizzate, con ascolto di prova. Pausa con tasto `Prossimo esercizio` ai confini della sequenza; palloncini e coriandoli CSS per sei secondi al termine delle sequenze regolari.
- [x] `Numero quantità`: barra neutra del tempo di inattività, durata configurabile uguale per esiti corretti ed errati, scelta `Riprova` o `Continua` anche dopo un errore in insegnamento.
- [x] `Numero quantità`: timer anche nei link condivisi, errore dopo cinque secondi di inattività in insegnamento, esiti ripetuti conservati, spunta verde e avanzamento solo con `Continua`; in valutazione conferma adulta immediata senza timer.
- [x] Documentata la causa del `state_change_failed_batch` per lo storico di `Numero quantità` e aggiunta una verifica obbligatoria dei vincoli `CHECK` D1 storici quando si introducono nuove tipologie.
- [x] Nuovo esercizio `Numero quantità`: bersaglio casuale 1–10, dieci oggetti vettoriali toccabili e deselezionabili, contatore, pronuncia, conferma adulta e completamento automatico opzionale solo in insegnamento. Configurazione e risultati persistono nello shadow relazionale D1 e nello storico senza immagini.
- [x] L’amministratore può modificare nome, cognome, email, PIN, ruolo e bambini associati dei profili adulti non amministrativi.
- [x] `Trova la parola` supporta un bersaglio fisso con distrattori casuali; il configuratore spiega in modo puntuale quando i filtri non producono abbastanza alternative.
- [x] Chiusura deterministica delle prove con ritorno alla pagina di configurazione e nuvolette delle sequenze più compatte nella pagina sessione.
- [x] Analisi tecnica della nuova tipologia `Numero quantità`, inclusi comportamento del timer, modello dei risultati, persistenza e piano di implementazione.
- [x] Riparazione dello shadow relazionale incompleto: controllo delle identità di tutte le tabelle prima delle scritture granulari, fallback atomico allo snapshot per non perdere sequenze e reintegro non distruttivo a batch limitati al successivo caricamento. Migrazione `0008` per circoscrivere l'unicità email dei profili adulti all'account, con test D1 di due account sovrapposti.
- [x] Journal locale e copiabile dei salvataggi cloud, privo di contenuti personali, con codice di errore e revisione; l'API segnala esplicitamente la migrazione `state_operations` mancante e associa agli errori inattesi una fase tecnica e un identificatore diagnostico.

- [x] Repository GitLab privato, piano operativo, ADR iniziali e pipeline di verifica.
- [x] Landing pubblica separata dal pannello adulto autenticato.
- [x] Sessione applicativa server-side e accesso ai profili adulti con email e PIN.
- [x] Profili `Amministratore`, `Genitore`, `Supervisore` e `Terapista`; creazione e associazione molti-a-molti fra adulti e bambini.
- [x] Stato sincronizzato per account in Cloudflare D1; copia locale usata per reattività e migrazione.
- [x] Immagini private ottimizzate nel browser, caricate in Cloudflare R2 e servite da endpoint autenticato.
- [x] Cancellazione logica e versionamento delle immagini: una scheda archiviata non compare nei nuovi esercizi, mentre il file resta disponibile agli storici che lo referenziano.
- [x] Selezione e modifica dei profili terapista/bambino; tentativi, aiuti e statistiche associati al bambino attivo.
- [x] Libreria con ricerca, metadati, upload, sostituzione, eliminazione e assegnazione `IL / LA` persistenti.
- [x] Catalogo ampliato con 50 parole bisillabiche, dieci per ciascuna delle categorie `Animali`, `Parti del corpo`, `Vestiti`, `Oggetti della natura` e `Cibi`, predisposte per la sostituzione dell'emoji con una fotografia.
- [x] Catalogo ampliato con altri 100 elementi testuali verificati: 34 parole di 2 sillabe, 33 di 3 sillabe e 33 di 4 sillabe, inizialmente senza immagine.
- [x] La libreria consente di aggiungere una parola senza fotografia e di completarla in seguito; gli elementi testuali sono ammessi negli esercizi con sole parole ed esclusi automaticamente dalle attività che richiedono immagini.
- [x] Migrazione trasparente dei nomi storici delle categorie negli elementi e negli esercizi già salvati.
- [x] Migrazione automatica dei doppioni: una foto privata caricata prevale sul placeholder omonimo, che viene disattivato, e i riferimenti degli esercizi vengono riallineati.
- [x] Etichette in stampatello maiuscolo, fotografie realistiche disponibili nel catalogo demo e parole sotto le immagini.
- [x] Creazione e modifica degli esercizi parola→immagine, duplicazione e cancellazione logica con storico preservato.
- [x] Configurazione separata dall'avvio: creazione, selezione, rinomina, riordino e cancellazione logica di esercizi e sequenze in un solo pannello.
- [x] Ricerca per parola o categoria in tutte le griglie di selezione degli elementi, inclusi configuratori e avvio rapido.
- [x] Sequenze associate al terapista proprietario; supervisori e amministratori vedono tutte le sequenze con il nome del proprietario.
- [x] Anteprima `Prova` collegata all'esercizio selezionato, esclusa dalle statistiche e con ritorno automatico alla pagina di configurazione.
- [x] Modalità foto + parole e solo parole con parola visibile, sintesi vocale italiana e comando per riascoltare.
- [x] Pronuncia automatica configurabile per ogni esercizio `Trova la parola`, indipendentemente dalla presentazione con immagini o sole parole.
- [x] In `Abbina la parola` la parola di riferimento può essere trascinata sull’immagine scelta con mouse, dito o penna; il tocco diretto sulle immagini resta disponibile.
- [x] Avanzamento vocale sincronizzato: dopo una risposta corretta il turno successivo parte soltanto al termine della pronuncia, evitando sovrapposizioni audio.
- [x] Feedback di errore temporaneo: “Riproviamo insieme”, bordo e X rossa scompaiono automaticamente senza restare davanti alle immagini.
- [x] Ordine casuale e stabile delle risposte durante la singola prova.
- [x] Modalità casuale standard per `Trova la parola`, con 3/4 distrattori, filtri per parole e categorie e modalità fissa avanzata.
- [x] Filtro sillabico per `Trova la parola` casuale (`2`, `3`, `2 o 3`, `4 o più`), applicato dinamicamente alla libreria anche dopo la creazione dell’esercizio.
- [x] Sillabazione automatica dei nuovi elementi con correzione persistente, segnalazione dei casi dubbi e migrazione verificata dei 97 elementi del catalogo iniziale.
- [x] Generazione dei distrattori senza duplicati, con priorità alla stessa categoria e senza ripetizioni consecutive della parola-obiettivo.
- [x] Esercizio `IL / LA` con una sola immagine per volta, drag and drop e alternativa touch/tastiera.
- [x] Trascinamento `IL / LA` tramite Pointer Events su desktop e mobile, con tocco alternativo; su smartphone la figura è più grande e i box articolo più compatti.
- [x] Esercizio `Parola nella categoria` configurabile, inseribile nelle sequenze e utilizzabile con tocco o trascinamento.
- [x] Esercizio `Mix and vary`: una foto senza testo alla volta, scelta casuale o configurata, esito corretto/errato e indicatore di aiuto registrati dall’adulto.
- [x] `Mix and vary` offre tre esiti diretti: errato, corretto con aiuti e corretto; l’esito aiutato registra automaticamente l’aiuto senza checkbox separata.
- [x] Feedback di errore con bordi rossi sull'elemento e sulla categoria selezionati; effetti sonori corretti/errati disattivabili.
- [x] Effetti sonori di conferma ed errore precaricati e riprodotti dal primo campione udibile, eliminando automaticamente l'eventuale silenzio iniziale degli MP3.
- [x] `Trova la parola` avanza automaticamente dopo la risposta corretta, con spunta verde temporanea; l'errore mostra una X rossa temporanea e mantiene il turno corrente.
- [x] Esercizi `IL / LA` configurabili per immagini e numero di turni, inseribili e riordinabili nelle sequenze miste.
- [x] Modalità insegnamento e verifica, primo tentativo unico, correzioni separate e aiuti registrati.
- [x] Test di dominio per primo tentativo, doppio tap, correzione, nuovo item e registrazione aiuti.
- [x] Statistiche descrittive per parola, parola + esercizio ed esercizio, con andamento giornaliero, export CSV e azzeramento controllato per bambino.
- [x] Storico persistente delle sessioni per bambino con esito visivo verde/rosso al primo tentativo, sequenza completa delle risposte, aiuti, miniature e valutazione testuale modificabile dall’autore della sessione.
- [x] Accesso allo storico per ruolo: il terapista vede le proprie sessioni, genitore e supervisore tutte le sessioni dei bambini associati, l’amministratore ha visibilità completa e può cancellare logicamente singoli storici o l’intero storico del bambino.
- [x] L’amministratore può creare, associare, cambiare ruolo ed eliminare i profili adulti non amministrativi.
- [x] Link pubblici di anteprima per singoli esercizi e sequenze: nessun login, nessuna statistica registrata e ritorno alla Home al termine.
- [x] Navigazione interna integrata con la cronologia del browser; durante un esercizio il tasto Indietro mantiene la sessione protetta, mentre fuori dagli esercizi torna alla schermata precedente.
- [x] Con una modale aperta, il tasto Indietro chiude la modale senza cambiare la pagina sottostante.
- [x] Procedura guidata per la nuova sessione con scelta del bambino, sequenze a nuvoletta, avvio rapido, riepilogo e schermata `PRONTI?`.
- [x] Schermata degli esercizi adattiva all'altezza del dispositivo, con prompt e tutte le opzioni visibili senza scroll e riallineamento automatico a inizio turno.
- [x] Blocco del trascinamento oltre il bordo durante gli esercizi mobili, per evitare il pull-to-refresh accidentale e la perdita dello stato della sessione.
- [x] Pull-to-refresh disponibile nelle pagine di gestione per caricare gli aggiornamenti dopo un deploy; il blocco resta attivo durante gli esercizi.
- [x] Uscita protetta durante gli esercizi con pressione continua di quattro secondi, verifica del PIN adulto e pannello di gestione nascosto; i comandi di sistema di Chrome/PWA restano sotto il controllo del dispositivo.
- [x] Salvataggio locale della sessione attiva e proposta di ripristino alla riapertura per lo stesso adulto e bambino, con scadenza automatica dopo 24 ore.
- [x] Configuratore `Aspetto` con quattro temi predefiniti, palette e forme dei controlli combinabili, anteprima dal vivo e persistenza locale/cloud.
- [x] Bootstrap dati con timeout, retry, fallback alla copia locale e retry al resume/ritorno online; service worker network-first per pagina e asset applicativi aggiornabili.
- [x] Navigazione avanti/indietro per singolo turno in tutti gli esercizi, feedback verde uniforme per IL/LA e categorie, trascinamento touch anche nelle attività con sole parole.
- [x] Avvio rapido temporaneo per tutte le tipologie, con elementi casuali, categorie o scelta manuale, turni configurabili e salvataggio facoltativo come sequenza.
- [x] UI responsive desktop, tablet e smartphone; manifest e service worker PWA.
- [x] Shell iniziale pre-renderizzata e servita come asset statico su Cloudflare; le API restano dinamiche e il caricamento di `/` non dipende dal limite CPU del Worker.
- [x] Prima fase della migrazione relazionale D1: schema additivo, proiezione idempotente dello snapshot per account, revisione/checksum, tombstone per riferimenti storici e compatibilità completa con il JSON durante il periodo shadow.
- [x] Seconda fase della migrazione relazionale: ricostruzione completa del formato applicativo dalle tabelle, conservazione esplicita di opzioni/risposte/aiuti storici e diagnostica autenticata di revisioni e conteggi; letture applicative ancora sullo snapshot fino alla verifica del D1 pubblicato.
- [x] Cutover controllato delle letture D1: ordine delle raccolte persistito, confronto per revisione e identificativi, uso automatico delle tabelle quando allineate e fallback trasparente allo snapshot in caso di errore o differenza.
- [x] Prima fase delle scritture granulari: il browser invia solo entità e preferenze cambiate, con coda seriale, controllo ottimistico della revisione e retry idempotente registrato in D1; lo snapshot resta copia di rollback e alimenta ancora la proiezione relazionale.
- [x] Cutover delle scritture relazionali: ogni operazione aggiorna direttamente e atomicamente le sole tabelle di dominio coinvolte, insieme a revisione, idempotenza e credenziali; il JSON resta un mirror di rollback e prima inizializzazione.
- [x] Sincronizzazione della libreria tra dispositivi: salvataggio cloud immediato, recupero degli upload R2 rimasti locali e scritture dell’ordine suddivise entro il limite di parametri D1 anche con oltre 100 parole.
- [x] Esercizio `Abbina la frase` per frasi semplici soggetto + verbo, con 2/4 immagini, uno o due gradi di libertà, pronuncia automatica, shuffle remoto e tracciamento del primo tentativo.
- [x] Libreria riorganizzata in immagini singole, frasi e suoni; catalogo iniziale di 20 scene d’azione coerenti per gatto, cane, bimbo e mamma.
- [x] Pairing QR senza conferma sul PC: l’ultimo telefono autenticato prende il controllo e il pannello QR si chiude alla connessione.

## Scelte di persistenza e costo

- D1 usa le tabelle relazionali per le letture verificate e per le scritture granulari. Lo snapshot JSON versionato resta temporaneamente come mirror di rollback e compatibilità con versioni precedenti.
- R2 contiene soltanto i file binari privati, separati dallo stato D1. I riferimenti alle immagini sono salvati nello snapshot.
- Esercizi e sequenze cancellati restano nello snapshot con flag `deleted`, così i risultati storici continuano a essere interpretabili senza duplicare dati.
- Le immagini rimosse o sostituite non vengono eliminate fisicamente da R2: la libreria usa la cancellazione logica e ogni storico conserva il riferimento alla versione mostrata durante la sessione.
- La struttura relazionale supporta ricerca server-side e modifiche concorrenti protette da revisione; l'eliminazione futura del mirror JSON resta subordinata alla prova di backup e ripristino.

## Limitazioni note

- Le preferenze audio sono sincronizzate nel cloud; l'interruttore rapido degli effetti sonori resta locale al dispositivo e il caricamento di suoni personalizzati nella libreria resta un intervento futuro.
- Le modifiche simultanee da più dispositivi vengono ricaricate e riconciliate automaticamente per entità; conflitti ripetuti o vincoli applicativi vengono mostrati come errore di sincronizzazione senza sovrascrivere lo stato remoto.
- L'ottimizzazione dell'immagine avviene nel browser; il server verifica formato reale e dimensioni, mentre ricodifica e varianti server-side restano da realizzare.
- Il catalogo stock è dimostrativo e non usa ancora un provider esterno.
- Le scritture applicano ora una prima matrice server-side deny-by-default; la matrice definitiva per genitore/supervisore, inviti e recupero accesso resta subordinata all'ADR di identità.
- Dati e nomi presenti sono fittizi; il prodotto non è ancora approvato per dati reali di minori.
- La modalità protetta è un controllo dell'interfaccia web: Chrome/PWA non può impedire la chiusura dell'app, i gesti del sistema operativo o altri comandi del dispositivo.
- La durata di conservazione dei soli metadati tecnici in `state_operations` e `login_rate_limits` deve essere inclusa nella policy di retention prima del pilot.
- Mancano ancora test end-to-end, accessibilità completa, backup/restore e hardening per il pilot.

## Prossimi passi

1. Eseguire QA browser su `Abbina la frase`, pairing QR automatico e primo turno di `Numero quantità` sui browser target.
2. Approvare gli ADR ancora aperti del piano `docs/PIANO_SESSIONI_GUIDATE_REALTIME.md`.
3. Verificare sul campo QR Realtime da `PRONTI?`, avvio da entrambi i dispositivi, sospensione Android/iOS, rete instabile e sostituzione del telefono; il metodo classico resta solo compatibilità per client precedenti.
4. Approvare e completare la matrice definitiva dei permessi server-side per genitore e supervisore, partendo dai vincoli già applicati alle scritture.
5. Verificare sul D1 pubblicato che la diagnostica resti `ready` e che storico e statistiche siano equivalenti.
6. Spostare validazione, resize e varianti immagini nel Worker mantenendo R2 privato.
7. Completare test end-to-end desktop/mobile, accessibilità e sicurezza.
8. Definire retention, backup e prova di ripristino D1/R2; solo dopo valutare il ritiro del mirror JSON.
9. Separare staging e produzione Cloudflare e aggiungere una promozione protetta fra i due ambienti.
10. Valutare la generazione AI opzionale dopo ADR su provider, privacy, moderazione e budget.

## Verifiche della versione corrente

- Accoppiamento anticipato nella schermata `PRONTI?`: QR Realtime subito visibile, avvio dal PC o dal telefono già collegato, stesso piano/ID/socket dopo Inizia e nessun altro controllo sul telefono prima dell’avvio. Comandi pre-avvio bloccati anche dal DO; uscita dal riepilogo chiude la preparazione. Nuovi QR esclusivamente DO, senza selettore Classico; API storiche mantenute per compatibilità. Nessun nuovo APK necessario.
- Verificati i comandi contestuali sulle sei tipologie: Mischia per riconoscimento/frasi/categorie, valutazione per Mix and vary e Numero quantità, corretta con aiuto solo per Mix and vary e Riprova solo per Numero quantità. Riascolta è esposto solo dove il prompt vocale è implementato (riconoscimento/frasi/quantità), evitando pulsanti senza effetto nelle altre attività.
- Numero quantità: conteggio aggiornato pronunciato anche togliendo spunte, incluso zero, rispettando l’opzione vocale; l’apprendimento senza errori resta bloccato dopo la quantità corretta. Bersagli estratti senza reinserimento nell’intervallo configurato; soltanto esaurito il giro ne inizia uno nuovo, evitando ripetizioni consecutive al confine quando sono disponibili almeno due numeri. Nessuna modifica ai risultati storici o alle preferenze salvate.
- Verifiche QR pre-avvio/quantità: 170 test dominio superati, typecheck e build verdi, lint con i soli tre avvisi `<img>` preesistenti. Test Miniflare DO/WebSocket e Worker completo superati, inclusi rifiuto dei comandi nello stato ready, start idempotente, stessa connessione dopo start, replay e chiusura. Resa visiva e scansione da confermare sul dispositivo; nessuna migrazione dati o ricompilazione APK.

- APK 0.1.2: App Links verificati sul dominio esistente, QR Classico/DO ricevuti sia all’avvio sia ad app già aperta, firma invariata e controllo automatico della corrispondenza con `assetlinks.json`. Nessun nuovo permesso e nessuna migrazione dati. Verifica dell’associazione Android e scansione reale da confermare sul telefono; istruzioni di fallback in `android/README.md`.
- Controller adulto: intento QR preservato durante login e reload, con priorità sul recupero della sessione locale (che non viene cancellata); aggiornamenti PWA rinviati mentre la console è aperta. Precedente/successiva attività limitati dai confini reali del piano, esposti anche negli snapshot Classico/DO. Nell’ultima attività è disponibile `Concludi sessione`, distinta da interruzione, con festa finale e soli tentativi realmente registrati; comando tracciato nello schema D1 storico senza migrazione. Test di regressione su intenti, scadenza, confini e protocollo realtime.
- Verifiche 0.1.2/controller: test JVM Android, firma APK e corrispondenza App Links, suite di dominio, typecheck e build superati; lint con i tre avvisi `<img>` preesistenti. Test reale Miniflare DO/WebSocket, incluso comando `finish`, e integrazione del Worker completo superati. Asset JSON e APK presenti nell’output statico; nessun test su hardware Android disponibile nell’ambiente.

- Festa finale interattiva: otto palloncini toccabili/cliccabili con scoppio visivo, un solo scoppio per palloncino e protezione dai tocchi sui controlli sottostanti. Durata invariata a sei secondi, supporto tastiera e movimento ridotto; nessun dato o punteggio salvato nelle statistiche. Funzione web condivisa con l'APK, senza ricompilazione Android.
- APK 0.1.1: mitigazione del freeze dei tocchi osservato dopo screen pinning su telefono. Avvio del blocco dopo chiusura del dialogo adulto, barre Android visibili durante richiesta/blocco e ripristino focus WebView al ritorno dal sistema. VersionCode incrementato e stessa firma della 0.1.0 per aggiornare senza disinstallazione. Policy verificata su JVM; esito reale sul telefono da confermare con l'utente.
- Contenitore tablet Android 11+ in `android/`: APK WebView sul dominio esistente, schermo intero, menu adulto con credenziali Android e avvio screen pinning. Bridge limitato per voce italiana nativa, volume/cancellazione e CSV con selettore documenti; caricamento immagini tramite file chooser. Firma e manifest verificabili con SDK ufficiale, test URL JVM e bridge voce. APK di prova: la configurazione PIN/sblocco e la QA su dispositivo sono obbligatorie; nessuna promessa di kiosk device owner o offline completo. ADR 0017.
- `Numero quantità`: opzioni cloud per pronunciare il conteggio delle selezioni e per `Apprendimento senza errori`, presenti anche nell'avvio rapido. La quantità corretta blocca subito le selezioni e registra un solo esito; timer e avanzamenti automatici sono esclusi anche senza controller o dopo la sua disconnessione. Modalità fotografata nei tentativi e nello storico, distinta in UI e CSV ed esclusa dalle percentuali di acquisizione autonoma. Migrazione additiva D1 `0015`, con valori predefiniti disattivati e test sullo schema storico.
- Corretto `Passo successivo` dopo una navigazione indietro o un salto fra attività: il blocco anti-doppio completamento vale per la visita corrente al turno, non impedisce di ripercorrere lo stesso passo. Test di regressione su avanti/indietro, cambio attività e doppia callback; trasporti Classico/DO e dati cloud invariati.
- Migrazione realtime controllata: il pannello QR mantiene `Classico` predefinito e offre `Realtime DO · prova`, con QR esplicitamente distinto. Il nuovo percorso usa un vero Durable Object SQLite e WebSocket nello stesso Worker, ticket monouso, audit D1 prima della conferma, heartbeat, replay e revoca del controller precedente. Il cambio di modalità chiude il vecchio collegamento e richiede nuova scansione; nessuna migrazione D1/R2. Vedi ADR 0015 e test runtime `pnpm test:realtime`.
- Pausa remota: i comandi che cambiano esercizio, risposta, ordine o aiuti vengono bloccati dal PC e disabilitati nella console; restano disponibili ripresa, audio e termine. Il blocco è immediato anche per comandi ricevuti nello stesso batch. L'avanzamento remoto supera le transizioni fra esercizi; una transizione già aperta è confermabile dal telefono senza saltare il primo turno.
- Console adulta: feedback comandi in notifica temporanea sovrapposta, home accessibile senza logout e scollegamento immediato del controller; il token QR viene consumato al primo accesso e rimosso dalla URL. Logout azzera la modalità controller e la pausa locale. Alla chiusura della sessione sul PC la console scarta lo snapshot e torna alla home; durante disconnessioni non mostra la vecchia indicazione di pausa.
- Pairing telefono: il join salva l'identificativo dell'adulto insieme alla chiave del controller, richiesti dalla validazione delle richieste successive. Test SQLite sullo stesso SQL delle route verifica primo collegamento, invio di comandi e revoca del primo telefono quando si collega il secondo.
- Durante la sessione il controller usa un pulsante trasparente da 28 px nella barra, con il solo puntino visibile; il pannello QR si apre al tocco. Il controllo dedicato non riutilizza il vecchio badge flottante. Build completa verificata; QA visiva della produzione ancora da confermare.
- `Avvio rapido` espone tutte le sei tipologie disponibili, incluse `Abbina la frase` e `Numero quantità`, con i rispettivi parametri e controlli di validità.
- `Abbina la frase` usa contenitori 4:3, accetta il trascinamento della frase sull'immagine, precarica le scene della sessione e avvia la voce del turno successivo solo dopo la conferma della schermata di passaggio.
- Gli esercizi casuali `Trova la parola` accettano da 1 a 4 distrattori; la sessione desktop adatta la griglia al numero di alternative, amplia le immagini e ingrandisce le scelte nella modalità solo parole.
- L’origine dei distrattori è configurabile: per impostazione predefinita vengono estratti da tutte le parole selezionate; il vincolo alla stessa categoria è opzionale ed esplicito.
- Ogni esercizio `Trova la parola` salva la propria presentazione (`Foto + parole` oppure `Solo parole con voce`), quindi una sequenza può alternare le due modalità; gli esercizi precedenti restano su `Foto + parole`.
- Ogni esercizio `Trova la parola` salva anche la scelta di pronunciare automaticamente il prompt; gli esercizi esistenti conservano il comportamento precedente.
- Gli esercizi precedenti senza filtro sillabico continuano a usare tutta la libreria; i link pubblici già creati restano snapshot immutabili e compatibili con i campi mancanti.
- La libreria propone e salva sillabazione e numero di sillabe. Le grafie potenzialmente ambigue compaiono nel filtro `Da verificare`, mentre le correzioni confermate non vengono sovrascritte.
- Su desktop, due, tre, quattro o cinque alternative occupano una sola riga quando lo spazio lo consente, così le foto conservano un’area verticale ampia e restano interamente visibili.
- `pnpm test`: copre anche sillabazione, casi da verificare, correzioni persistenti, filtro sillabico, composizione del catalogo testuale, separazione tra modalità con immagini e sole parole e scritture ordinate oltre 100 elementi entro i limiti D1.
- `pnpm lint`: superato con i soli tre avvisi già noti sugli elementi `<img>` usati per anteprime e file dinamici.
- `pnpm typecheck`: superato senza errori.
- `pnpm build`: superato senza errori.
- Pubblicazione Sites successiva alla verifica corrente, con binding D1/R2 invariati.
- Browser QA automatizzata locale non disponibile su questa macchina perché il runtime Workers/Miniflare termina con `ERR_RUNTIME_FAILURE`; build e verifiche statiche sono completati.
