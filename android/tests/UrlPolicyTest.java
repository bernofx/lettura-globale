package it.letturaglobale.tablet;

public class UrlPolicyTest {
    public static void main(String[] args) {
        String[] allowed = { UrlPolicy.HOME, UrlPolicy.HOME + "?controller=abc&transport=do", "https://lettura-globale.bernofx.workers.dev:443/api/media/1" };
        String[] denied = { null, "http://lettura-globale.bernofx.workers.dev/", "https://lettura-globale.bernofx.workers.dev.evil.test/", "https://lettura-globale.bernofx.workers.dev@evil.test/", "https://adult@lettura-globale.bernofx.workers.dev/", "https://lettura-globale.bernofx.workers.dev:8443/", "file:///data/data/private", "content://provider/private", "javascript:alert(1)", "intent://app", "https://example.test/", "/relative" };
        for (String url : allowed) if (!UrlPolicy.trusted(url)) throw new AssertionError("Blocked trusted URL: " + url);
        for (String url : denied) if (UrlPolicy.trusted(url)) throw new AssertionError("Allowed untrusted URL: " + url);
        System.out.println("PASS: URL Android limitate all'origine HTTPS dell'app.");
        if (!PinningUiPolicy.allowImmersive(false, false)) throw new AssertionError("Immersive normale non disponibile");
        if (PinningUiPolicy.allowImmersive(true, false)) throw new AssertionError("Conferma Android nascosta durante il blocco");
        if (PinningUiPolicy.allowImmersive(false, true)) throw new AssertionError("Immersive riattivata mentre l'app è fissata");
        if (PinningUiPolicy.allowImmersive(true, true)) throw new AssertionError("Comandi Android nascosti durante la transizione");
        System.out.println("PASS: barre Android visibili durante richiesta e blocco, senza nascondere la conferma.");
    }
}
