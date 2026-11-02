package it.letturaglobale.tablet;

public class UrlPolicyTest {
    public static void main(String[] args) {
        String[] allowed = { UrlPolicy.HOME, UrlPolicy.HOME + "?controller=abc&transport=do", "https://lettura-globale.bernofx.workers.dev:443/api/media/1" };
        String[] denied = { null, "http://lettura-globale.bernofx.workers.dev/", "https://lettura-globale.bernofx.workers.dev.evil.test/", "https://lettura-globale.bernofx.workers.dev@evil.test/", "https://adult@lettura-globale.bernofx.workers.dev/", "https://lettura-globale.bernofx.workers.dev:8443/", "file:///data/data/private", "content://provider/private", "javascript:alert(1)", "intent://app", "https://example.test/", "/relative" };
        for (String url : allowed) if (!UrlPolicy.trusted(url)) throw new AssertionError("Blocked trusted URL: " + url);
        for (String url : denied) if (UrlPolicy.trusted(url)) throw new AssertionError("Allowed untrusted URL: " + url);
        System.out.println("PASS: URL Android limitate all'origine HTTPS dell'app.");
        String token = new String(new char[64]).replace('\0', 'a');
        String classic = UrlPolicy.HOME + "?controller=" + token;
        String realtime = classic + "&transport=do&session=session-demo-123";
        for (String link : new String[] { UrlPolicy.HOME, classic, realtime, UrlPolicy.HOME + "?preview=12345678-1234-1234-1234-123456789abc", UrlPolicy.HOME + "?launch=exercise&id=demo-123" }) {
            if (!link.equals(UrlPolicy.appLink(link))) throw new AssertionError("App Link valido perso: " + link);
        }
        String[] invalidLinks = { classic.replace("https:", "http:"), classic.replace("workers.dev", "workers.dev.evil.test"), UrlPolicy.HOME + "api/logout?controller=" + token, classic + "&controller=" + token, classic + "&transport=do", classic + "&transport=evil", classic + "#evil", UrlPolicy.HOME + "?controller=short", "javascript:alert(1)", null };
        for (String link : invalidLinks) if (UrlPolicy.appLink(link) != null) throw new AssertionError("App Link non valido accettato");
        System.out.println("PASS: App Links classici/DO/condivisione; respinti intent e parametri non validi.");
        if (!PinningUiPolicy.allowImmersive(false, false)) throw new AssertionError("Immersive normale non disponibile");
        if (PinningUiPolicy.allowImmersive(true, false)) throw new AssertionError("Conferma Android nascosta durante il blocco");
        if (PinningUiPolicy.allowImmersive(false, true)) throw new AssertionError("Immersive riattivata mentre l'app è fissata");
        if (PinningUiPolicy.allowImmersive(true, true)) throw new AssertionError("Comandi Android nascosti durante la transizione");
        System.out.println("PASS: barre Android visibili durante richiesta e blocco, senza nascondere la conferma.");
        if (!PrintPolicy.valid("Storia demo", 297, 210, "print-demo-01")) throw new AssertionError("Formato libretto A4 respinto");
        if (!PrintPolicy.valid("Storia demo", 180, 240, "print-demo-02")) throw new AssertionError("Formato personalizzato respinto");
        for (double size : new double[] { 0, 79, 601, Double.NaN, Double.POSITIVE_INFINITY }) if (PrintPolicy.valid("Demo", size, 210, "print-demo-03")) throw new AssertionError("Formato non valido ammesso");
        if (PrintPolicy.valid("", 297, 210, "demo") || PrintPolicy.valid("Demo", 297, 210, "../escape")) throw new AssertionError("Titolo/ID non valido ammesso");
        if (PrintPolicy.mils(210) != 8268 || PrintPolicy.mils(297) != 11693) throw new AssertionError("Misure A4 errate");
        if (PrintPolicy.jobName("Demo/\\\n").contains("\n")) throw new AssertionError("Nome stampa non normalizzato");
        System.out.println("PASS: stampa CAA limitata, formati A4/libretto/personalizzati e parametri non validi respinti.");
    }
}
