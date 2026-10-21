# ADR 0011: deploy Cloudflare automatico da Git

## Contesto

Il Worker `lettura-globale` è già operativo su Cloudflare con i binding D1 e R2 della demo, ma il deploy è stato eseguito manualmente con Wrangler. Il collegamento Git di Cloudflare tenta il build, tuttavia il repository non contiene una configurazione Wrangler di produzione: quella generata da Vinext vive in `dist/`, non viene versionata e contiene un identificativo D1 segnaposto. Per questo un build Git può risultare fallito anche mentre l'ultima versione pubblicata manualmente continua a funzionare.

## Decisione

- GitHub è la sorgente autorevole per il Worker Cloudflare della demo.
- Un aggiornamento di `main` avvia il build e il deploy tramite Cloudflare Workers Builds. Le revisioni sui branch possono produrre anteprime, ma non ricevono traffico di produzione.
- Il repository versiona `wrangler.production.jsonc` alla radice con nome del Worker, artefatti Vinext e binding D1/R2 della demo. Il nome distinto impedisce al plugin Vite di risolvere `dist/server/index.js` prima che il build lo abbia generato. Anche la configurazione Vite usa l'identificativo D1 reale, perché Vinext lo copia nel `dist/server/wrangler.json` utilizzato da Workers Builds per caricare la versione. Gli identificativi delle risorse non sono segreti; token, PIN e altre credenziali non entrano nei file.
- Cloudflare usa `pnpm run build` come comando di build e `pnpm run deploy:cloudflare` come comando di deploy, dalla radice del repository.
- Il deploy conserva le variabili configurate nel dashboard e non ricrea né copia D1/R2: applicazione, immagini, suoni e dati continuano a usare le risorse già collegate.
- Le migrazioni D1 non vengono applicate automaticamente a ogni push. Una migrazione forward-only richiede verifica separata, backup automatico di D1 e applicazione esplicita prima della versione applicativa che la richiede.
- Il rollback avviene promuovendo una versione Worker precedente dal dashboard oppure correggendo e ripubblicando da Git. Non si riscrive la storia di `main`.

## Configurazione operativa

Nel progetto Workers Builds collegato a `bernofx/lettura-globale`:

- branch di produzione: `main`;
- root directory: `/`;
- build command: `pnpm run build`;
- deploy command: `pnpm run deploy:cloudflare`;
- versione Node: compatibile con `package.json` (Node 22 o successiva).

Il primo deploy automatico deve essere controllato confrontando commit, stato del deployment e binding `DB`/`BUCKET`. Un errore di Workers Builds non interrompe la versione Worker già attiva.

## Conseguenze

Per le modifiche applicative ordinarie basta integrare il branch in `main`; non è più necessario pubblicare manualmente con Wrangler o ChatGPT Sites. La pipeline riguarda per ora il solo ambiente demo esistente. La separazione completa staging/produzione e la promozione fra ambienti rimangono attività di hardening prima dell'uso con dati reali.
