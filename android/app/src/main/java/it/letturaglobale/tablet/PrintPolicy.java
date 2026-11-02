package it.letturaglobale.tablet;

/** Bounded print-only bridge parameters, not URLs, HTML or filesystem paths. */
public final class PrintPolicy {
    private PrintPolicy() {}
    public static boolean valid(String title, double widthMm, double heightMm, String id) {
        return title != null && !title.trim().isEmpty() && title.length() <= 140
            && id != null && id.matches("[a-zA-Z0-9-]{1,80}")
            && Double.isFinite(widthMm) && Double.isFinite(heightMm)
            && widthMm >= 80 && widthMm <= 600 && heightMm >= 80 && heightMm <= 600;
    }
    public static int mils(double mm) { return (int) Math.round(mm * 1000 / 25.4); }
    public static String jobName(String title) {
        return "Lettura Globale - " + title.replaceAll("[\\p{Cntrl}/\\\\]", " ").trim();
    }
}
