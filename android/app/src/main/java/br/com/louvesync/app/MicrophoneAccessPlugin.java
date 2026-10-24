package br.com.louvesync.app;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "MicrophoneAccess", permissions = @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }))
public class MicrophoneAccessPlugin extends Plugin {
    @PluginMethod public void request(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) complete(call);
        else requestPermissionForAlias("microphone", call, "complete");
    }
    @PermissionCallback private void complete(PluginCall call) {
        JSObject result = new JSObject(); result.put("granted", getPermissionState("microphone") == PermissionState.GRANTED); call.resolve(result);
    }
}
