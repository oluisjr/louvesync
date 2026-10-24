package br.com.louvesync.app;
import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LouvePrintPlugin.class);
        registerPlugin(MicrophoneAccessPlugin.class);
        super.onCreate(savedInstanceState);
        // HTML/version discovery must never come from the WebView HTTP cache.
        // The service worker still provides the last complete offline build.
        getBridge().getWebView().getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
    }
    @Override public void onResume() {
        super.onResume();
        if (getBridge() != null) getBridge().triggerWindowJSEvent("louvesync:resume");
    }
}
