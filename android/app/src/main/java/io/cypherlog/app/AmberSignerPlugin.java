package io.cypherlog.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.provider.Browser;

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

  /**
   * Amber branches on {@link Browser#EXTRA_APPLICATION_ID}: when it is absent, Amber parses
   * nostrsigner: URIs via {@code getIntentDataFromIntent} and passes the full decoded string
   * (payload plus {@code ?type=...} query) into NIP-44 encrypt/decrypt. That breaks self-encrypt
   * round-trips and often yields the generic string {@code Could not decrypt the message}.
   * Setting this extra forces {@code getIntentDataWithoutExtras}, which splits the payload at the
   * first {@code '?'} correctly.
   */
  private void attachAmberUriPayloadFix(Intent intent) {
    intent.putExtra(Browser.EXTRA_APPLICATION_ID, getContext().getPackageName());
  }

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
    try {
      Uri uri = buildSignerUri(null, new String[][] {
        {"type", "get_public_key"},
        {"permissions", permissionsJson}
      });
      Intent intent = new Intent(Intent.ACTION_VIEW, uri);
      intent.putExtra("type", "get_public_key");
      intent.putExtra("permissions", permissionsJson);
      attachAmberUriPayloadFix(intent);
      startActivityForResult(call, intent, "getPublicKeyResult");
    } catch (Exception e) {
      call.reject("intent_failed", e.getMessage(), e);
    }
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
      Uri uri = buildSignerUri(encoded, new String[][] {
        {"type", "sign_event"},
        {"id", requestId},
        {"current_user", pubkey}
      });
      Intent intent = new Intent(Intent.ACTION_VIEW, uri);
      intent.setPackage(signerPackage);
      intent.putExtra("type", "sign_event");
      intent.putExtra("id", requestId);
      intent.putExtra("current_user", pubkey);
      intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      attachAmberUriPayloadFix(intent);
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
      String payloadQueryKey = type.endsWith("_encrypt") ? "plainText" : "encryptedText";
      Uri uri = buildSignerUri(encoded, new String[][] {
        {"type", type},
        {"id", requestId},
        {"current_user", pubkey},
        {"pubkey", peerPubkey},
        {"pubKey", peerPubkey},
        {payloadQueryKey, payload}
      });
      Intent intent = new Intent(Intent.ACTION_VIEW, uri);
      intent.setPackage(signerPackage);
      intent.putExtra("type", type);
      intent.putExtra("id", requestId);
      intent.putExtra("current_user", pubkey);
      intent.putExtra("pubkey", peerPubkey);
      intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      attachAmberUriPayloadFix(intent);
      startActivityForResult(call, intent, callbackName);
    } catch (Exception e) {
      call.reject("intent_failed", e.getMessage(), e);
    }
  }

  private Uri buildSignerUri(String encodedPayload, String[][] queryParams) throws Exception {
    StringBuilder uri = new StringBuilder("nostrsigner:");
    if (encodedPayload != null) {
      uri.append(encodedPayload);
    }
    boolean isFirstParam = true;
    for (String[] queryParam : queryParams) {
      if (queryParam == null || queryParam.length < 2 || queryParam[1] == null) {
        continue;
      }
      uri.append(isFirstParam ? "?" : "&");
      isFirstParam = false;
      uri.append(queryParam[0]);
      uri.append("=");
      uri.append(encodeQueryValue(queryParam[1]));
    }
    return Uri.parse(uri.toString());
  }

  private String encodeQueryValue(String value) throws Exception {
    return URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20");
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
