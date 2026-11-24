# Generazione immagini in Libreria

Da **Libreria → Generazione con OpenAI**, l’amministratore dell’account abilitato inserisce una parola o un elenco e preme **Genera con OpenAI**. Le voci già illustrate vengono saltate. **Aggiungi parola o foto** rimane il percorso per salvare una voce manuale.

Da **Verifica immagine** si controllano la foto, la categoria, l’articolo e le sillabe. **Approva e pubblica** rende la scheda disponibile a tutti gli account del catalogo condiviso. La foto viene salvata in R2 e la scheda in D1. I dati sono visibili alla Libreria al successivo aggiornamento del catalogo. Un errore temporaneo lascia la proposta in **In pubblicazione**, con recupero automatico ogni cinque minuti e il comando **Pubblica ora**. Pubblicazione e recupero usano i byte già generati.

## Configurazione

1. Usa coda, database e bucket distinti per ambiente. Applica le migrazioni D1 `0017_scheduled_images` e `0018_official_catalog` prima del deploy. In staging copia `wrangler.staging.jsonc.example` in `wrangler.staging.jsonc` e compila con `LETTURA_WRANGLER_CONFIG=wrangler.staging.jsonc pnpm build`.
2. In **Libreria → Generazione con OpenAI → Configurazione OpenAI**, copia l’identificativo account. In Cloudflare imposta `SCHEDULED_IMAGES_ACCOUNT_ID` a quel valore, `SCHEDULED_IMAGES_MONTHLY_LIMIT` al numero massimo di tentativi per mese UTC e `OPENAI_API_KEY` come secret del Worker.
3. Il trigger Cloudflare recupera sia i lavori di generazione non consegnati sia le proposte già approvate, incluse quelle in attesa del flusso precedente. La migrazione revoca la chiave del vecchio publisher e il workflow GitHub viene rimosso.

## Immagini, permessi e budget

Il provider riceve la parola e l’eventuale precisazione visiva generica. Il Worker valida WebP, PNG o JPEG statici e quadrati. I metadati del file vengono scartati per la pubblicazione. L’anteprima richiede l’accesso dell’amministratore; la scheda e i byte approvati sono poi consumabili anche dalle condivisioni del catalogo. I file caricati privatamente mantengono il percorso autenticato.

Ogni chiamata OpenAI prenota un tentativo prima dell’invio, inclusi gli errori e gli esiti incerti. Questi ultimi richiedono una nuova richiesta esplicita prima di spendere un altro tentativo. Il limite è sul numero di chiamate, mentre la fattura dipende dalle tariffe e dall’uso API. Rimuovere `OPENAI_API_KEY` o impostare il limite a `0` sospende le nuove generazioni.

Riferimenti [OpenAI Images API](https://developers.openai.com/api/reference/resources/images/methods/generate) e [modello GPT-Image-2.6 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare).
