# ADR-0001 — Accesso terapista nel prototipo pubblico

**Stato:** provvisorio, da approvare prima dell'uso reale  
**Data:** 15 ottobre 2026

## Contesto

La demo su ChatGPT Sites deve essere visitabile senza account ChatGPT e deve mostrare il flusso con cui un terapista accede, sceglie uno dei bambini associati e modifica i profili. In questa fase non sono disponibili D1, sessioni server-side o un provider di identità applicativo.

## Decisione provvisoria

- L'hosting Sites è pubblico tramite link.
- L'app presenta un login dimostrativo browser-local con email e PIN.
- Il PIN viene conservato nel browser come hash SHA-256, non in chiaro.
- La sessione del terapista usa `sessionStorage`; profili e associazioni usano `localStorage`.
- Il terapista vede e può scegliere soltanto i bambini elencati nella propria associazione locale.
- Tentativi e aiuti nuovi registrano terapista e bambino; dashboard e statistiche sono filtrate sul bambino attivo.
- L'interfaccia dichiara esplicitamente che non si tratta di autenticazione sicura e vieta dati reali.

## Conseguenze

Il flusso UX può essere provato su ogni dispositivo, ma dati, account e modifiche non si sincronizzano fra browser. Chiunque abbia accesso al dispositivo può manipolare lo storage locale: il login non costituisce autorizzazione né protezione dei dati.

## Passo necessario prima del pilot

Sostituire il prototipo con identità e sessioni server-side, autorizzazione deny-by-default sulle associazioni terapista-bambino, credenziali protette, audit, recupero accesso, rate limiting e persistenza D1/R2 separata per ambiente. La scelta definitiva richiede approvazione esplicita e una privacy/security review per dati di minori.
