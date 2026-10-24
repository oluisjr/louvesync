package br.com.louvesync.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LouvePrint")
public class LouvePrintPlugin extends Plugin {
    private WebView printView;
    @PluginMethod
    public void printDocument(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.length() > 1000000) { call.reject("Documento inválido."); return; }
        getActivity().runOnUiThread(() -> {
            if (printView != null) printView.destroy();
            printView = new WebView(getContext());
            printView.getSettings().setJavaScriptEnabled(false);
            printView.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView view, String url) {
                    PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                    manager.print("LouveSync", view.createPrintDocumentAdapter("LouveSync"), new PrintAttributes.Builder().build());
                    call.resolve();
                }
            });
            printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
    @Override protected void handleOnDestroy() { if (printView != null) printView.destroy(); }
}
