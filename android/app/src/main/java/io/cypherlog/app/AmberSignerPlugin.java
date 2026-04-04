package io.cypherlog.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/**
 * NIP-55 Android signer bridge (Amber, etc.): intents with nostrsigner: scheme.
 */
@CapacitorPlugin(name = "AmberSigner")
public class AmberSignerPlugin extends Plugin {

  @PluginMethod
  public void isAvailable(PluginCall call) {
    Intent probe = new Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:"));
    PackageManager pm = getContext().getPackageManager();
    List<ResolveInfo> infos = pm.queryIntentActivities(probe, PackageManager.MATCH_DEFAULT_ONLY);
    JSObject ret = new JSObject();
    ret.put("installed", infos != null && !infos.isEmpty());
    call.resolve(ret);
  }

  @PluginMethod
  public void getPublicKey(PluginCall call) {
    String permissionsJson = call.getString("permissionsJson", "[]");
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:"));
    intent.putExtra("type", "get_public_key");
    intent.putExtra("permissions", permissionsJson);
    startActivityForResult(call, intent, "getPublicKeyResult");
  }

  @ActivityCallback
  private void getPublicKeyResult(PluginCall call, ActivityResult result) {
    if (call == null) {
      return;
    }
    if (result.getResultCode() != Activity.RESULT_OK) {
      call.reject("cancelled", "Signer request was cancelled or declined");
      return;
    }
    Intent data = result.getData();
    if (data == null) {
      call.reject("missing_data", "No data returned from signer");
      return;
    }
    String pubkey = data.getStringExtra("result");
    String pkg = data.getStringExtra("package");
    if (pubkey == null || pubkey.isEmpty()) {
      call.reject("missing_pubkey", "Signer did not return a public key");
      return;
    }
    JSObject ret = new JSObject();
    ret.put("pubkey", pubkey);
    ret.put("packageName", pkg != null ? pkg : "");
    call.resolve(ret);
  }

  @PluginMethod
  public void signEvent(PluginCall call) {
    String eventJson = call.getString("eventJson");
    String signerPackage = call.getString("signerPackage");
    String pubkey = call.getString("pubkey");
    String requestId = call.getString("requestId", UUID.randomUUID().toString());
    if (eventJson == null || signerPackage == null || pubkey == null) {
      call.reject("invalid_args", "eventJson, signerPackage, and pubkey are required");
      return;
    }
    try {
      String encoded = URLEncoder.encode(eventJson, StandardCharsets.UTF_8.name()).replace("+", "%20");
      Uri uri = Uri.parse("nostrsigner:" + encoded);
      Intent intent = new Intent(Intent.ACTION_VIEW, uri);
      intent.setPackage(signerPackage);
      intent.putExtra("type", "sign_event");
      intent.putExtra("id", requestId);
      intent.putExtra("current_user", pubkey);
      intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      startActivityForResult(call, intent, "signEventResult");
    } catch (Exception e) {
      call.reject("intent_failed", e.getMessage(), e);
    }
  }

  @ActivityCallback
  private void signEventResult(PluginCall call, ActivityResult result) {
    if (call == null) {
      return;
    }
    if (result.getResultCode() != Activity.RESULT_OK) {
      call.reject("cancelled", "Sign request was cancelled or declined");
      return;
    }
    Intent data = result.getData();
    if (data == null) {
      call.reject("missing_data", "No data returned from signer");
      return;
    }
    String signed = data.getStringExtra("event");
    if (signed == null || signed.isEmpty()) {
      call.reject("missing_event", "Signer did not return signed event JSON");
      return;
    }
    JSObject ret = new JSObject();
    ret.put("eventJson", signed);
    call.resolve(ret);
  }

  @PluginMethod
  public void nip44Encrypt(PluginCall call) {
    launchCryptoIntent(call, "nip44_encrypt", "nip44EncryptResult");
  }

  @ActivityCallback
  private void nip44EncryptResult(PluginCall call, ActivityResult result) {
    resolveCryptoResult(call, result);
  }

  @PluginMethod
  public void nip44Decrypt(PluginCall call) {
    launchCryptoIntent(call, "nip44_decrypt", "nip44DecryptResult");
  }

  @ActivityCallback
  private void nip44DecryptResult(PluginCall call, ActivityResult result) {
    resolveCryptoResult(call, result);
  }

  private void launchCryptoIntent(PluginCall call, String type, String callbackName) {
    String payload = call.getString("plaintext");
    if (payload == null) {
      payload = call.getString("ciphertext");
    }
    String signerPackage = call.getString("signerPackage");
    String pubkey = call.getString("pubkey");
    String peerPubkey = call.getString("peerPubkey");
    String requestId = call.getString("requestId", UUID.randomUUID().toString());
    if (payload == null || signerPackage == null || pubkey == null || peerPubkey == null) {
      call.reject("invalid_args", "payload, signerPackage, pubkey, and peerPubkey are required");
      return;
    }
    try {
      String encoded = URLEncoder.encode(payload, StandardCharsets.UTF_8.name()).replace("+", "%20");
      Uri uri = Uri.parse("nostrsigner:" + encoded);
      Intent intent = new Intent(Intent.ACTION_VIEW, uri);
      intent.setPackage(signerPackage);
      intent.putExtra("type", type);
      intent.putExtra("id", requestId);
      intent.putExtra("current_user", pubkey);
      intent.putExtra("pubkey", peerPubkey);
      intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      startActivityForResult(call, intent, callbackName);
    } catch (Exception e) {
      call.reject("intent_failed", e.getMessage(), e);
    }
  }

  private void resolveCryptoResult(PluginCall call, ActivityResult result) {
    if (call == null) {
      return;
    }
    if (result.getResultCode() != Activity.RESULT_OK) {
      call.reject("cancelled", "Crypto request was cancelled or declined");
      return;
    }
    Intent data = result.getData();
    if (data == null) {
      call.reject("missing_data", "No data returned from signer");
      return;
    }
    String res = data.getStringExtra("result");
    if (res == null) {
      call.reject("missing_result", "Signer did not return a result");
      return;
    }
    JSObject ret = new JSObject();
    ret.put("result", res);
    call.resolve(ret);
  }
}
