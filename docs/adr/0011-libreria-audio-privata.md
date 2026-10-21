# ADR 0011: libreria audio privata

## Stato

Accettato per il prototipo Sites; retention definitiva da approvare prima del pilot.

## Contesto

I suoni di feedback erano incorporati nel deploy. Aggiungerne uno richiedeva una nuova versione dell'app. L'adulto deve poter caricare MP3 e assegnarli a uno dei quattro momenti già configurabili, senza pubblicare un nuovo bundle.

## Decisione

- I file caricati sono privati dell'account: i byte vanno in R2, i metadati in una nuova tabella D1 `sound_assets`, separata dallo stato degli esercizi. Non sono inclusi nei link pubblici di anteprima.
- Ogni suono ha un nome e una sola categoria: risposta errata, risposta corretta, fine esercizio della sequenza o selezione in `Numero quantità`. Nella pagina Aspetto compaiono soltanto i file della categoria corrispondente.
- Accettiamo soltanto MP3 fino a 2 MB; l'interfaccia verifica una durata massima di 15 secondi. Il server controlla dimensione, tipo e intestazione del file, limita la libreria a 50 voci attive per account e serve i file con autenticazione e `no-store`.
- L'upload usa un identificativo stabile per il retry; la risposta positiva arriva solo dopo la scrittura in R2 e D1. In caso di errore D1 si tenta di rimuovere l'oggetto R2 appena scritto.
- Le scelte del suono attivo restano locali al dispositivo, come già accadeva; la libreria dei file si sincronizza fra dispositivi dello stesso account. Un file assente o rimosso fa ripiegare l'audio sul suono incluso predefinito.
- La rimozione dalla libreria è logica in D1. L'oggetto R2 non viene eliminato durante il prototipo, in coerenza con gli asset già usati dalla libreria immagini; una policy di retention fisica e backup va approvata prima del pilot. L'interfaccia invita a caricare soltanto file per cui si hanno i diritti d'uso.

## Conseguenze

La migrazione D1 0010 aggiunge una tabella indipendente, senza modificare gli snapshot dello stato applicativo. Le preferenze locali esistenti e i suoni inclusi rimangono compatibili. La prova end-to-end di upload, scelta e riproduzione con sessione reale resta da eseguire sul sito pubblicato.
