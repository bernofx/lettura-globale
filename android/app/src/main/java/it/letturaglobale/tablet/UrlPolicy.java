package it.letturaglobale.tablet;

import java.net.URI;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;

public final class UrlPolicy {
    public static final String HOME = "https://lettura-globale.bernofx.workers.dev/";
    private UrlPolicy() {}

    /** External intents may open only known root-page links, never API/media/other origins. */
    public static String appLink(String value) {
        if (!trusted(value)) return null;
        try {
            URI uri = new URI(value);
            if (!"/".equals(uri.getPath()) || uri.getRawFragment() != null) return null;
            if (uri.getRawQuery() == null || uri.getRawQuery().isEmpty()) return HOME;
            Map<String, String> params = new HashMap<>();
            for (String pair : uri.getRawQuery().split("&")) {
                String[] parts = pair.split("=", 2);
                String key = URLDecoder.decode(parts[0], "UTF-8");
                String decoded = parts.length > 1 ? URLDecoder.decode(parts[1], "UTF-8") : "";
                if (params.put(key, decoded) != null) return null;
            }
            String token = params.get("controller");
            if (token == null) {
                String preview = params.get("preview");
                if (preview != null && preview.matches("[0-9a-fA-F-]{36}")) return HOME + "?preview=" + preview;
                String kind = params.get("launch"), id = params.get("id");
                if (("exercise".equals(kind) || "sequence".equals(kind)) && id != null && id.matches("[a-zA-Z0-9_-]{1,100}")) return HOME + "?launch=" + kind + "&id=" + id;
                return null;
            }
            if (token == null || !token.matches("[a-f0-9]{64}")) return null;
            String link = HOME + "?controller=" + token;
            if ("do".equals(params.get("transport"))) {
                String session = params.get("session");
                if (session == null || !session.matches("[a-zA-Z0-9:_-]{8,100}")) return null;
                link += "&transport=do&session=" + session;
            } else if (params.containsKey("transport") || params.containsKey("session")) return null;
            return link;
        } catch (Exception error) { return null; }
    }

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
