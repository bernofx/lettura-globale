# ADR 0017 — Contenitore Android 11 per il tablet

## Stampa CAA nativa — 2 novembre 2026

Richiesta esplicita dell’utente: stampare o almeno salvare il PDF dall’APK. La 0.1.3 aggiunge un bridge limitato `printCaa(titolo, larghezza, altezza, id)`, non caricamento di HTML/URL/file arbitrari. L’origine principale è verificata, la stampa è ammessa soltanto con anteprima CAA attiva, credenziali Android confermate e pagina non cambiata durante la verifica. Se screen pinning è attivo viene chiesto di rimuoverlo manualmente; nessuna disattivazione implicita del blocco. Formati 80–600 mm finiti, titolo/ID limitati e nome lavoro normalizzato.

PrintManager riceve l’adattatore di stampa della stessa WebView e il formato fisico selezionato, senza margini aggiunti dall’app. Riusa il DOM di stampa con immagini già caricate, crediti, imposizione del libretto e percentuale simboli; il sito esegue prima gli stessi controlli di accesso/overflow del browser. Nel dialogo Android l’utente sceglie stampante o Salva come PDF. Non si conferma un file salvato al solo avvio del dialogo; annullamenti, errori e mancanza di risposta sono distinti. Le vecchie APK mostrano richiesta di aggiornamento invece di un tentativo silenzioso di window.print.

Non si aggiungono permessi di storage, provider, librerie PDF, backend o migrazioni D1/R2/DO. I dati restano nel contenitore e nel sistema di stampa Android, salvo la destinazione/stampante scelta esplicitamente dall’adulto; il servizio di stampa deve essere attivo. Stessa chiave di prova e App Links invariati, versionCode 4. Controlli JVM/compilazione reale e test browser con bridge simulato non sostituiscono una prova sul tablet Android 11: stampa fisica e selezione Salva come PDF restano da confermare sul dispositivo.

## Contenitore e vincoli esistenti

Accettato su richiesta dell'utente del 22 ottobre 2026: APK collegata al sito, senza duplicare gli esercizi, con primo livello di protezione tramite blocco app Android. Non è autorizzata/configurata la gestione device owner del tablet né un kiosk gestito.

Un'Activity Android nativa senza dipendenze di terze parti apre esclusivamente il dominio HTTPS esistente, preservando la pipeline Git → Cloudflare e la fonte dati cloud D1/R2/DO. Non si crea un secondo backend o una seconda implementazione delle attività. La WebView ha cookie/sessione propri, dom storage e coda offline già gestita dall'app web; non si promette una disponibilità offline completa.

La sintesi vocale usa un bridge minimo al motore Android installato, con ID di richiesta, volume, callback e cancellazione che non deve provocare avanzamenti. Il browser normale conserva Web Speech. Il bridge espone solo speak, stop e salvataggio CSV con selettore documenti e verifica adulta. Le immagini sono caricate tramite selettore file di sistema; nessun accesso generalizzato allo storage. Unico permesso: Internet. No HTTP, bypass TLS, WebView debug, popup o navigazione su origini esterne; backup Android disabilitato.

L'app usa immersive fullscreen e una piccola barra adulta nativa non sovrapposta ai pulsanti degli esercizi. Il menu richiede le credenziali del blocco schermo Android e consente screen pinning, refresh o uscita. La richiesta PIN alla rimozione del blocco va abilitata dal proprietario nelle impostazioni Android: startLockTask non concede device owner e non garantisce da solo un kiosk completo. Tasti fisici, riavvio e differenze OEM rimangono limiti del sistema. Test sul tablet indispensabile prima dell'uso col bambino.

La prima APK è un artefatto dimostrativo firmato con chiave di prova locale esclusa dal repository; è scaricabile come asset del sito pubblico esistente, senza dati né credenziali inclusi. Una distribuzione definitiva richiede una chiave stabile del proprietario con backup sicuro e strategia aggiornamenti nativi. Le normali correzioni web arrivano senza reinstallare l'APK. Fonti e procedura SDK sono versionate; non occorrono migrazioni cloud. Vedi `android/README.md` per installazione, compilazione e QA.

## Estensione approvata — App Links, 23 ottobre 2026

Su richiesta esplicita dell’utente, APK 0.1.2 associa la radice HTTPS del dominio attuale all’app tramite Android App Links verificati e `/.well-known/assetlinks.json`. Pubblica soltanto l’impronta del certificato già usato per firmare le APK di prova, senza trasferire chiavi o introdurre provider, permessi o backend nuovi. Una sola Activity gestisce intent iniziali e successivi, con convalida dell’origine e dei parametri; QR Classico/DO e anteprime sono mantenuti. Il comportamento finale dipende anche da verifica Android, preferenze dell’utente e lettore QR: nessuna forzatura dei default di sistema. La futura firma definitiva richiederà un aggiornamento esplicito dell’associazione. Nessuna migrazione D1/R2/DO.
