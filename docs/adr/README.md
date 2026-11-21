# Architecture Decision Records

Ogni decisione su autenticazione, privacy, retention, provider, licenze o deploy richiede un ADR approvato (`AGENTS.md`). Numerazione progressiva a quattro cifre; i due ADR storici con lo stesso numero sono distinti come `0005a` e `0005b`.

| ADR | Titolo | Stato |
| --- | --- | --- |
| [0001](0001-auth-prototipo-locale.md) | Accesso terapista nel prototipo pubblico | — |
| [0002](0002-eliminazione-profili-prototipo.md) | Eliminazione profili nel prototipo locale | — |
| [0003](0003-cloud-persistence.md) | persistenza cloud con D1 e R2 | Accettato |
| [0004](0004-esercizi-sequenze-e-storico.md) | gestione di esercizi, sequenze e storico | Accettato |
| [0005a](0005a-amministratore-e-associazioni.md) | amministratore e associazioni terapista-bambino | Accettato |
| [0005b](0005b-lettura-dei-progressi.md) | lettura dei progressi di apprendimento | — |
| [0006](0006-generazione-attivita-e-feedback.md) | generazione delle attività e feedback multimodale | Accettato |
| [0007](0007-modalita-protetta-ripristino-e-temi.md) | modalità protetta, ripristino della sessione e temi | Accettato |
| [0008](0008-migrazione-dati-relazionale.md) | migrazione progressiva dallo snapshot alle tabelle relazionali | Accettato e implementato fino al cutover delle scritture |
| [0009](0009-diagnostica-salvataggi.md) | journal tecnico dei salvataggi | — |
| [0010](0010-numero-quantita.md) | esercizio Numero quantità ed esiti non lessicali | — |
| [0011](0011-deploy-cloudflare-da-git.md) | deploy Cloudflare automatico da Git | — |
| [0012](0012-console-remota-qr.md) | Console remota tramite QR | — |
| [0013](0013-abbina-la-frase.md) | Esercizio “Abbina la frase” | Accettato e implementato |
| [0014](0014-hardening-identita-retention.md) | Hardening di identità, PIN e contenuti condivisi | — |
| [0015](0015-durable-object-opt-in.md) | Collegamento Durable Object facoltativo | — |
| [0016](0016-quantity-errorless-learning.md) | Conteggio vocale e apprendimento senza errori | — |
| [0017](0017-android-tablet-wrapper.md) | Contenitore Android 11 per il tablet | — |
| [0018](0018-category-images.md) | Simboli espliciti delle categorie | — |
| [0019](0019-explicit-app-updates.md) | Versione visibile e aggiornamento con ripresa | — |
| [0020](0020-caa-stories.md) | Prima versione di storie in CAA | — |
| [0021](0021-caa-sharing.md) | Condivisione selettiva delle storie CAA | — |
| [0022](0022-ambiente-staging.md) | Ambiente di staging separato dalla produzione | Proposto, in attesa di approvazione |
| [0023](0023-backup-e-ripristino.md) | Backup e prova di ripristino di D1 e R2 | Proposto, in attesa di approvazione |
| [0024](0024-distribuzione-apk.md) | Distribuzione dell'APK Android fuori dal repository | Proposto, in attesa di approvazione |
| [0025](0025-giochi-colorare.md) | Colorare nella sezione Giochi | Implementato, in attesa di approvazione su privacy e licenze |

“—” indica un ADR privo di una sezione `## Stato` esplicita: lo stato va desunto dal testo e da `PROGRESS.md`.
