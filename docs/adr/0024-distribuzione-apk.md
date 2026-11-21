# ADR 0024 — Distribuzione dell'APK Android fuori dal repository

## Stato

Proposto, in attesa di approvazione. Gli APK esistenti restano in `public/downloads/` finché non esiste un'alternativa verificata, perché il sito pubblicato e le vecchie APK (messaggio di aggiornamento) puntano a quei percorsi.

## Contesto

ADR 0017 pubblica l'APK di prova come asset statico del sito. Ogni versione viene però aggiunta a git come binario (0.1.0–0.1.3, circa 4 file): la storia del repository cresce a ogni rilascio, i cloni rallentano e i binari non sono revisionabili.

## Proposta

- Pubblicare ogni APK firmata come asset di una **GitHub Release** con tag `android-vX.Y.Z`. In alternativa la si carica nel bucket R2 pubblico/firmato già usato dal Worker.
- Mantenere sul sito l'URL stabile `/downloads/lettura-globale-android11-latest.apk`, servito dal Worker come redirect verso l'asset della release, e gli URL versionati come redirect per compatibilità con le APK già installate.
- Rimuovere gli APK da `public/downloads/` e aggiungere `public/downloads/*.apk` a `.gitignore` soltanto dopo aver verificato i redirect.
- Non riscrivere la storia git per eliminare i binari passati: si accetta il peso storico, si evita solo la crescita futura.
- Calcolare il checksum SHA-256 di ogni APK e pubblicarlo accanto al download.

## Punti da decidere

- GitHub Releases oppure R2.
- Chi firma e pubblica le release (la chiave resta fuori dal repository, come oggi).

## Conseguenze

Repository più leggero. Il rilascio Android diventa un passaggio esplicito, che richiede approvazione, anziché un commit.
