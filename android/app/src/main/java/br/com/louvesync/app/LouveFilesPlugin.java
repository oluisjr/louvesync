package br.com.louvesync.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "LouveFiles")
public class LouveFilesPlugin extends Plugin {
    @PluginMethod
    public void saveExcel(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename");
        if (data == null || data.length() > 8000000 || filename == null || !filename.matches("[A-Za-z0-9_-]+\\.xlsx")) {
            call.reject("Planilha inválida.");
            return;
        }
        try {
            Base64.decode(data, Base64.DEFAULT);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            startActivityForResult(call, intent, "saveResult");
        } catch (Exception error) {
            call.reject("Não foi possível abrir o salvamento da planilha.", error);
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri destination = result.getData() == null ? null : result.getData().getData();
        if (destination == null) {
            call.reject("Escolha um local para salvar a planilha.");
            return;
        }
        bridge.execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(destination, "wt")) {
                if (output == null) throw new java.io.IOException("Destino indisponível.");
                output.write(Base64.decode(call.getString("data"), Base64.DEFAULT));
                call.resolve();
            } catch (Exception error) {
                call.reject("Não foi possível salvar a planilha no local escolhido.", error);
            }
        });
    }
}
