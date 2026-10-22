# Lettura Globale — APK tablet Android 11+

Contenitore WebView nativo: carica esclusivamente `https://lettura-globale.bernofx.workers.dev/`. Esercizi, temi, risultati e controller restano nell'unica applicazione web; un normale deploy Cloudflare li aggiorna anche nel tablet. Una nuova APK serve solo quando cambia il contenitore nativo.

## Installazione e primo avvio

1. Aggiornare Android System WebView e installare/attivare una voce italiana nelle impostazioni Android di sintesi vocale. Internet è necessario per il primo caricamento; questa APK non promette disponibilità offline completa.
2. Impostare un PIN, password o sequenza di blocco schermo del tablet.
3. Scaricare `https://lettura-globale.bernofx.workers.dev/downloads/lettura-globale-android11-v0.1.0.apk`, autorizzare l'installazione da quella sorgente se Android lo richiede e installare. È una versione di prova firmata, non una pubblicazione Play Store. Dopo l'installazione è possibile revocare il permesso alla sorgente.
4. Aprire Lettura Globale e accedere con il consueto profilo adulto. L'accesso della WebView è separato da Chrome; i dati cloud sono gli stessi, non vengono copiati i cookie del browser.

## Blocco app e uscita adulta

- Nelle impostazioni Android cercare **Blocco app**, **Fissa schermo** o **Screen pinning**; il nome varia per produttore. Abilitare anche la richiesta del PIN per rimuovere il blocco. Il PIN è quello di sblocco Android, non il PIN del profilo nel sito.
- Tenere premuti i tre puntini della piccola barra nativa e confermare le credenziali Android. Scegliere **Blocca app sullo schermo** e accettare l'eventuale conferma del sistema.
- Il menu adulto permette anche di aggiornare la pagina e uscire dall'app, dopo verifica Android. Il tasto Indietro segue la cronologia interna del sito; alla radice richiede l'accesso adulto al menu.
- **Schermo intero non significa kiosk completo.** Questa versione usa il normale screen pinning con consenso del sistema: non diventa device owner, non cambia le impostazioni di sicurezza e non blocca riavvio o tasti fisici. Verificare sul tablet concreto Home, Recenti, gesti e richiesta PIN prima di consegnarlo al bambino. Il kiosk gestito con Lock Task/device owner rimane un intervento separato.

## Funzioni native e dati

La sintesi vocale passa al motore TTS italiano Android perché Web Speech non è garantito nelle WebView. Sono rispettati volume, interruzione e callback di fine; la sospensione cancella la richiesta senza avanzare. La scelta del motore e l'eventuale uso di rete dipendono dalle impostazioni Android: per il funzionamento senza rete del solo parlato installare la voce offline. Non si introducono API vocali a pagamento.

Il selettore file usa i documenti scelti esplicitamente dall'adulto. Il CSV viene salvato con il selettore documenti Android, dopo verifica adulta. L'unico permesso richiesto nel manifest è Internet; niente permessi generali di archiviazione, microfono o fotocamera. Traffico HTTP, navigazione fuori dal dominio, popup e debug WebView sono disabilitati. Le verifiche TLS rimangono quelle di Android. Il bridge espone soltanto voce/stop/export CSV, non accesso generico a filesystem o comandi. L'esportazione nativa è limitata a circa 6 MB; per file maggiori usare il PC.

Il cloud resta la fonte primaria. La WebView conserva cookie e copia/coda locale nello spazio privato dell'app; il backup Android è disabilitato. Non cancellare dati né disinstallare l'app con modifiche ancora non sincronizzate. Nessuna migrazione D1/R2/DO è richiesta per il contenitore.

## Compilazione ripetibile

Requisiti: JDK 17+ con modulo compilatore, Android SDK Platform 35, build-tools 35.0.0 e `zip` nel PATH. Gli strumenti devono provenire dall'SDK ufficiale Google; non si scaricano componenti durante la build.

```sh
ANDROID_SDK_ROOT=/percorso/android-sdk pnpm build:android
pnpm test:android
```

Il risultato è `android/build/lettura-globale-android11-prova.apk`. La build esegue aapt2, javac, D8, zipalign e apksigner, controlla la firma e stampa manifest, package e API minima. Non dipende da Gradle, AndroidX o Capacitor; il contenitore usa solo API del sistema. Ogni compilazione usa intermedi nuovi per evitare classi obsolete.

La chiave **di prova** è generata in `.android-local/test.keystore`, esclusa da Git, con le convenzioni standard Android debug. Non pubblicarla, non usarla per distribuzioni definitive e non perdere quella impiegata per aggiornare una stessa installazione. Per una distribuzione stabile occorrono chiave di firma del proprietario e backup sicuro separato: non generare sostituzioni silenziose. Una firma diversa richiede disinstallazione/reinstallazione e può perdere la coda locale. Per aggiornamenti nativi incrementare versionCode/versionName nel manifest e pubblicare un nuovo nome APK; gli aggiornamenti del sito non richiedono nuova firma o installazione.

Se l'APK pubblicata esiste ma manca la chiave locale, la build si ferma. Soltanto per una **nuova installazione di prova**, non per aggiornare quella distribuita, si può scegliere esplicitamente `LG_ANDROID_NEW_TEST_KEY=1`: produrrà una firma differente. Nessuna chiave privata è inclusa nell'APK o nel repository.

## Verifiche e limiti

Compilazione reale delle classi Android, firma APK, manifest, policy URL su JVM, test del bridge voce e verifiche web. Non è stato eseguito un test strumentale su emulatori/tablet: verificare sul dispositivo Android 11 login, voce italiana, volume, pausa/cambio turno, file chooser, CSV, QR/DO, rotazione, rete assente/riconnessione, Home/Recenti e sblocco con PIN. Non usare dati reali di minori prima del pilot/privacy review.
