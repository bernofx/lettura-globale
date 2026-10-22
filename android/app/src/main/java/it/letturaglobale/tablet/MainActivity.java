package it.letturaglobale.tablet;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.io.OutputStream;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int AUTH = 10, PICK_FILE = 11, SAVE_CSV = 12;
    private WebView web;
    private TextToSpeech voice;
    private boolean voiceReady;
    private boolean voiceFailed;
    private Speech pendingSpeech;
    private String activeSpeechId;
    private Runnable adultAction;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingCsv;
    private final class Speech {
        final String text, id;
        final float volume;
        Speech(String text, String id, float volume) { this.text = text; this.id = id; this.volume = volume; }
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("Lettura Globale"); title.setTextColor(Color.rgb(11, 58, 109));
        title.setPadding(dp(12), 0, 0, 0); title.setTextSize(13);
        bar.addView(title, new LinearLayout.LayoutParams(0, dp(36), 1));
        Button menu = new Button(this);
        menu.setText("⋮"); menu.setTextSize(20); menu.setBackgroundColor(Color.TRANSPARENT);
        menu.setContentDescription("Menu adulto: tieni premuto");
        menu.setOnClickListener(v -> toast("Tieni premuto per aprire il menu adulto"));
        menu.setOnLongClickListener(v -> { authenticate(this::showAdultMenu); return true; });
        bar.addView(menu, new LinearLayout.LayoutParams(dp(52), dp(36)));
        root.addView(bar);
        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        // File chooser grants only the documents explicitly selected by the adult.
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new NativeBridge(), "LetturaGlobaleAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                boolean blocked = !UrlPolicy.trusted(request.getUrl().toString());
                if (blocked && request.isForMainFrame()) toast("Questa app apre soltanto Lettura Globale");
                return blocked;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                stopVoice();
                if (!UrlPolicy.trusted(url)) { view.stopLoading(); view.loadUrl(UrlPolicy.HOME); }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) toast("Pagina non disponibile. Controlla la rete e usa Aggiorna nel menu adulto.");
            }
            @Override public boolean onRenderProcessGone(android.webkit.WebView view, android.webkit.RenderProcessGoneDetail detail) {
                root.removeView(view); view.destroy(); web = null;
                new AlertDialog.Builder(MainActivity.this).setTitle("Motore web interrotto")
                    .setMessage("Riapri l’app per riprovare. I dati locali non verranno cancellati.")
                    .setPositiveButton("Riapri", (dialog, which) -> recreate()).setCancelable(false).show();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), PICK_FILE); }
                catch (Exception error) { fileCallback.onReceiveValue(null); fileCallback = null; toast("Selettore file non disponibile"); }
                return true;
            }
        });
        voice = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int language = voice.setLanguage(Locale.ITALIAN);
                voiceReady = language != TextToSpeech.LANG_MISSING_DATA && language != TextToSpeech.LANG_NOT_SUPPORTED;
                voice.setSpeechRate(0.72f);
                voice.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {}
                    @Override public void onDone(String id) { speechEnded(id, false); }
                    @Override public void onError(String id) { speechEnded(id, true); }
                });
            }
            voiceFailed = !voiceReady;
            if (pendingSpeech != null) speak(pendingSpeech);
        });
        if (saved == null || web.restoreState(saved) == null) web.loadUrl(UrlPolicy.HOME);
        if (!getPreferences(0).getBoolean("introShown", false)) {
            new AlertDialog.Builder(this).setTitle("Prima dell’attività")
                .setMessage("Imposta un PIN di blocco schermo sul tablet e attiva ‘Richiedi PIN per sbloccare app’. Tieni premuti i tre puntini per il menu adulto e scegli Blocca app. Lo schermo intero, da solo, non blocca Home e cambio app. Voce italiana e WebView devono essere aggiornati.")
                .setPositiveButton("Ho capito", (dialog, which) -> getPreferences(0).edit().putBoolean("introShown", true).apply()).show();
        }
        immersive();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    private boolean trustedPage() { return web != null && UrlPolicy.trusted(web.getUrl()); }
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    @Override public void onWindowFocusChanged(boolean focused) { super.onWindowFocusChanged(focused); if (focused) immersive(); }
    @Override protected void onSaveInstanceState(Bundle state) { if (web != null) web.saveState(state); super.onSaveInstanceState(state); }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else authenticate(this::showAdultMenu);
    }
    private void authenticate(Runnable action) {
        if (adultAction != null) return;
        KeyguardManager keyguard = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        Intent intent = keyguard.createConfirmDeviceCredentialIntent("Area adulto", "Usa il PIN o la sequenza di sblocco del tablet");
        if (intent == null) { toast("Imposta prima un PIN di blocco schermo nelle impostazioni Android"); return; }
        adultAction = action;
        try { startActivityForResult(intent, AUTH); } catch (Exception error) { adultAction = null; toast("Verifica adulta non disponibile"); }
    }
    private void showAdultMenu() {
        new AlertDialog.Builder(this).setTitle("Area adulto")
            .setItems(new String[]{"Blocca app sullo schermo", "Aggiorna pagina", "Esci dall’app"}, (dialog, item) -> {
                if (item == 0) {
                    try { startLockTask(); toast("Conferma il blocco Android. La richiesta PIN all’uscita va attivata nelle impostazioni del tablet."); }
                    catch (Exception error) { toast("Blocco app non disponibile: usa le impostazioni Android"); }
                } else if (item == 1 && web != null) web.reload();
                else {
                    stopVoice();
                    ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
                    try { if (manager.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) stopLockTask(); }
                    catch (Exception error) { toast("Esci prima dal blocco app con i comandi Android e il PIN del tablet"); return; }
                    finishAndRemoveTask();
                }
            }).setNegativeButton("Annulla", null).show();
    }
    private void stopVoice() {
        String id = activeSpeechId != null ? activeSpeechId : pendingSpeech != null ? pendingSpeech.id : null;
        pendingSpeech = null; activeSpeechId = null;
        if (voice != null) voice.stop();
        if (id != null) speechEnded(id, false, true);
    }
    private void speak(Speech speech) {
        pendingSpeech = speech;
        if (!trustedPage()) return;
        if (voiceFailed) { pendingSpeech = null; toast("Installa o attiva una voce italiana nelle impostazioni di sintesi vocale Android"); speechEnded(speech.id, true); return; }
        if (!voiceReady) return;
        pendingSpeech = null;
        activeSpeechId = speech.id;
        Bundle params = new Bundle(); params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, speech.volume);
        if (voice.speak(speech.text, TextToSpeech.QUEUE_FLUSH, params, speech.id) == TextToSpeech.ERROR) speechEnded(speech.id, true);
    }
    private void speechEnded(String id, boolean error) {
        speechEnded(id, error, false);
    }
    private void speechEnded(String id, boolean error, boolean cancelled) {
        runOnUiThread(() -> {
            if (id.equals(activeSpeechId)) activeSpeechId = null;
            if (trustedPage() && !isFinishing()) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('lg-native-speech-end',{detail:{id:" + JSONObject.quote(id) + ",error:" + error + ",cancelled:" + cancelled + "}}))", null);
        });
    }
    public final class NativeBridge {
        @JavascriptInterface public void speak(String text, String id, double volume) {
            if (text == null || text.length() > 600 || id == null || !id.matches("[a-zA-Z0-9-]{1,80}")) return;
            runOnUiThread(() -> { if (trustedPage()) MainActivity.this.speak(new Speech(text, id, (float) Math.max(0, Math.min(1, volume)))); });
        }
        @JavascriptInterface public void stop() { runOnUiThread(() -> { if (trustedPage()) stopVoice(); }); }
        @JavascriptInterface public void saveCsv(String encoded) {
            if (encoded == null || encoded.length() > 8_000_000) return;
            runOnUiThread(() -> {
                if (!trustedPage() || pendingCsv != null) return;
                authenticate(() -> {
                    try {
                        pendingCsv = Base64.decode(encoded, Base64.DEFAULT);
                        Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/csv").putExtra(Intent.EXTRA_TITLE, "lettura-globale-progressi.csv");
                        startActivityForResult(save, SAVE_CSV);
                    } catch (Exception error) { pendingCsv = null; toast("Salvataggio CSV non disponibile"); }
                });
            });
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == AUTH) { Runnable action = adultAction; adultAction = null; if (result == RESULT_OK && action != null) action.run(); }
        if (request == PICK_FILE && fileCallback != null) { fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); fileCallback = null; }
        if (request == SAVE_CSV) {
            byte[] bytes = pendingCsv; pendingCsv = null;
            if (result == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData())) { if (output == null) throw new Exception(); output.write(bytes); toast("CSV salvato"); }
                catch (Exception error) { toast("Salvataggio CSV non riuscito"); }
            }
        }
    }
    @Override protected void onPause() { stopVoice(); super.onPause(); }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (voice != null) { voice.stop(); voice.shutdown(); }
        if (web != null) { web.removeJavascriptInterface("LetturaGlobaleAndroid"); web.destroy(); }
        pendingCsv = null; adultAction = null;
        super.onDestroy();
    }
}
