# Piano di hardening successivo alla code review

## Obiettivo

Ridurre i rischi di sicurezza e perdita dati prima del pilot, quindi diminuire il costo del realtime e il debito tecnico del client senza cambiare il comportamento didattico.

## Ordine di intervento

1. **Sessioni e autorizzazione**
   - logout server-side con revoca della sessione;
   - scritture dello stato associate a un profilo adulto autenticato;
   - policy server-side per ruolo, bambino e proprietà delle sequenze;
   - test negativi sulle operazioni non autorizzate.
2. **Consistenza dei dati**
   - revisione obbligatoria anche nel fallback `PUT`;
   - scrittura atomica di snapshot e credenziali;
   - rimozione del fallback completo quando la migrazione granulare sarà obbligatoria.
3. **Credenziali e confini API**
   - rate limit persistente del login;
   - migrazione dei PIN a un formato lento e versionato;
   - validazione strutturale degli input e delle immagini.
4. **Condivisione e retention**
   - scadenza e revoca dei link pubblici;
   - pulizia programmata di snapshot e media non più referenziati.
5. **Realtime QR**
   - riduzione degli heartbeat D1;
   - aggiornamento React solo quando lo stato cambia;
   - valutazione Durable Objects/WebSocket separata.
6. **Prestazioni del client**
   - indici `Map` e valori derivati memoizzati;
   - cache di preload immagini limitata;
   - timer e notifiche centralizzati.
7. **Manutenibilità**
   - hook condiviso per drag-and-drop;
   - estrazione di sincronizzazione, session runner e builder da `page.tsx`;
   - registry unico delle tipologie di esercizio.
8. **Correttezza e copertura**
   - serie `Numero quantità` nel grafico;
   - test delle route, concorrenza, autorizzazioni e principali flussi browser;
   - lint, typecheck, test e build a ogni blocco.

## Stato al 22 ottobre 2026

- Completati i punti 1, 2, 3 e 5.
- Il punto 4 include scadenza, revoca, interfaccia e pulizia opportunistica; resta da definire la retention globale prima del pilot.
- Il punto 6 include memoizzazione, cache limitata e timer delle notifiche centralizzato.
- Il punto 7 include hook drag-and-drop e prima estrazione dei componenti statistici; sincronizzazione, runner, builder e registry unico restano interventi incrementali.
- Il punto 8 copre le policy di autorizzazione, visibilità, PIN, rate limit e migrazioni; E2E browser e concorrenza reale restano aperti.

## Decisioni che richiedono ADR

- formato e parametri del nuovo hash dei PIN, rate limit e recupero accesso;
- durata, revoca e pulizia dei link pubblici;
- matrice definitiva dei permessi di terapista, genitore e supervisore;
- eventuale passaggio da polling D1 a Durable Objects/WebSocket.

## Criteri di completamento

- nessuna scrittura privilegiata autorizzata solo dal client;
- nessun salvataggio completo senza controllo di revisione;
- logout non riutilizzabile dopo refresh;
- costo del controller non proporzionale a una scrittura D1 ogni 650 ms;
- componenti critici e route protetti da test automatici;
- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` verdi.
