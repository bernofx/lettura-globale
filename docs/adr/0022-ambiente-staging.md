# ADR 0022 — Ambiente di staging separato dalla produzione

## Stato

Proposto, in attesa di approvazione. Nessuna risorsa Cloudflare è stata creata e nessun deploy è stato modificato.

## Contesto

Oggi esiste un solo ambiente. `wrangler.production.jsonc` collega il Worker `lettura-globale` al database D1 `site-creator-d1` e al bucket R2 `site-creator-r2`, e Cloudflare Workers Builds pubblica ogni aggiornamento di `main` (ADR 0011). Migrazioni D1, nuove tipologie di esercizio e modifiche alla sincronizzazione vengono quindi provate per la prima volta sui dati della demo. `AGENTS.md` richiede D1, R2, configurazioni e credenziali separati per ambiente, e ADR 0008 richiede che backup e rollback siano provati in staging prima di ritirare il mirror JSON.

## Proposta

- Creare un secondo Worker `lettura-globale-staging` con D1 `lettura-globale-staging` e R2 `lettura-globale-staging`, senza alcun dato copiato dalla produzione. Si usano solo dati fittizi.
- Versionare `wrangler.staging.jsonc` partendo da `wrangler.staging.jsonc.example`, con l'identificativo D1 reale dopo la creazione, e aggiungere lo script `deploy:staging` che usa quella configurazione.
- Collegare il Worker di staging a Workers Builds sul branch `staging`, oppure pubblicare con un'azione manuale. La produzione resta su `main`.
- Ordine delle migrazioni: prima `wrangler d1 migrations apply` sullo staging, poi lo smoke test e la verifica dello schema storico (`docs/MIGRAZIONE_DATI_RELAZIONALE.md`), infine la produzione con un passaggio esplicito.
- Promozione: si integra in `main` soltanto un commit già verificato in staging. Il rollback resta quello dell'ADR 0011.
- Variabili e segreti dello staging sono separati e configurati nel dashboard, mai nei file.

## Punti da decidere

1. Nomi delle risorse e conto Cloudflare (stesso account o account separato).
2. Pubblicazione automatica dal branch `staging` oppure manuale.
3. Se rinominare anche le risorse di produzione `site-creator-*`, che richiede una migrazione dei dati e una finestra di manutenzione. La proposta è di non farlo per ora.
4. Accesso allo staging, pubblico o protetto (per esempio con Cloudflare Access).

## Conseguenze

Costi aggiuntivi minimi (piano gratuito o a consumo). Ogni migrazione passa da due ambienti. Nessuna modifica al codice applicativo: i binding mantengono i nomi `DB`, `BUCKET` e `SESSIONS`.
