# ADR-0002 — Eliminazione profili nel prototipo locale

**Stato:** accettata per il prototipo  
**Data:** 15 ottobre 2026

## Contesto

Il prototipo deve permettere all'adulto di eliminare terapisti e bambini. In questa fase i dati sono conservati esclusivamente nel browser e non esistono ancora identità server-side, audit log o politiche definitive di conservazione.

## Decisione

- Ogni eliminazione richiede una conferma esplicita e comunica che l'azione non è annullabile.
- Non è possibile eliminare l'ultimo terapista disponibile.
- Un terapista non può eliminare il proprio ultimo bambino associato.
- Eliminando un bambino vengono rimossi dal browser anche le sue associazioni, i tentativi e gli aiuti registrati.
- Eliminando il terapista attualmente autenticato, la sessione locale termina immediatamente.
- La cancellazione riguarda soltanto il browser corrente e non rappresenta ancora una politica di cancellazione valida per la produzione.

## Conseguenze e lavoro futuro

Prima dell'uso con dati reali occorrerà definire conservazione, cancellazione differita o immediata, audit, recupero amministrativo e obblighi privacy. L'implementazione Cloudflare dovrà applicare tali regole lato server con autorizzazioni, transazioni e test dedicati.
