package it.letturaglobale.tablet;

import java.net.URI;

public final class UrlPolicy {
    public static final String HOME = "https://lettura-globale.bernofx.workers.dev/";
    private UrlPolicy() {}

    public static boolean trusted(String value) {
        if (value == null) return false;
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme())
                && "lettura-globale.bernofx.workers.dev".equalsIgnoreCase(uri.getHost())
                && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception error) { return false; }
    }
}
