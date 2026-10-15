# Lettura Globale

PWA assistiva per esercizi di lettura globale guidati da un terapista o genitore.

## Stato

La release attuale è un prototipo funzionale pubblico pubblicato su ChatGPT Sites. I dati della demo sono salvati soltanto nel browser. D1, R2, autenticazione server-side e provider stock verranno introdotti prima di qualsiasi uso con dati reali.

Funzioni disponibili:

- dashboard adulto responsive;
- accesso dimostrativo del terapista con PIN locale;
- scelta fra i bambini associati e modifica dei profili;
- libreria di parole con provenienza e licenza;
- upload privato con dichiarazione del diritto d'uso;
- esercizi singoli e sequenza salvabile;
- modalità insegnamento e verifica;
- primo tentativo distinto dalle correzioni;
- aiuti scelti e registrati dall'adulto;
- statistiche ed export CSV.

## Sviluppo

Requisiti: Node.js 22+ e pnpm 11.25.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Controlli prima di una Merge Request:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Leggere sempre `MASTER_PLAN.md`, `AGENTS.md` e `PROGRESS.md` prima di modificare il progetto.

## Hosting

- Prove e revisioni: ChatGPT Sites, accesso pubblico tramite link.
- Produzione stabile: Cloudflare Workers + D1 + R2, soltanto dopo hardening e approvazione.
- Repository autorevole: GitLab privato.

## Credenziali demo

- Email: `giulia@letturaglobale.demo`
- PIN: `1234`

Sono dati fittizi. L'accesso protegge soltanto l'interfaccia nel browser e non sostituisce l'autenticazione server-side prevista per la versione Cloudflare.
