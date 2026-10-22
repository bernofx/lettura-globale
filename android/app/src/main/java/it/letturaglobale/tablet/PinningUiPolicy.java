package it.letturaglobale.tablet;

public final class PinningUiPolicy {
    private PinningUiPolicy() {}
    public static boolean allowImmersive(boolean requestPending, boolean pinned) {
        // Leave system confirmation/navigation visible throughout pinning on OEM devices.
        return !requestPending && !pinned;
    }
}
