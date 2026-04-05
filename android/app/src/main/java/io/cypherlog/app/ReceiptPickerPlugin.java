package io.cypherlog.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

@CapacitorPlugin(name = "ReceiptPicker")
public class ReceiptPickerPlugin extends Plugin {

  @PluginMethod
  public void pickReceipt(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("*/*");
    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/*", "application/pdf" });
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    startActivityForResult(call, intent, "pickReceiptResult");
  }

  @ActivityCallback
  private void pickReceiptResult(PluginCall call, ActivityResult result) {
    if (call == null) {
      return;
    }
    if (result.getResultCode() != Activity.RESULT_OK) {
      call.reject("cancelled", "Receipt picker was cancelled");
      return;
    }

    Intent data = result.getData();
    Uri uri = data != null ? data.getData() : null;
    if (uri == null) {
      call.reject("missing_uri", "No file was returned");
      return;
    }

    try {
      try {
        getContext()
          .getContentResolver()
          .takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
      } catch (SecurityException ignored) {
        // Some providers do not grant persistable permissions; immediate read still works.
      }

      String name = queryDisplayName(uri);
      String mimeType = getContext().getContentResolver().getType(uri);
      if (mimeType == null || mimeType.isEmpty()) {
        mimeType = inferMimeType(name);
      }

      JSObject ret = new JSObject();
      ret.put("name", (name == null || name.isEmpty()) ? "receipt" : name);
      ret.put("mimeType", mimeType);
      ret.put("path", copyUriToCache(uri, ret.getString("name")));
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("read_failed", e.getMessage(), e);
    }
  }

  private String queryDisplayName(Uri uri) {
    Cursor cursor = null;
    try {
      cursor = getContext()
        .getContentResolver()
        .query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
      if (cursor != null && cursor.moveToFirst()) {
        int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (index >= 0) {
          return cursor.getString(index);
        }
      }
    } catch (Exception ignored) {
      // Fall through to default name.
    } finally {
      if (cursor != null) {
        cursor.close();
      }
    }
    return null;
  }

  private String inferMimeType(String name) {
    if (name != null && name.toLowerCase().endsWith(".pdf")) {
      return "application/pdf";
    }
    return "application/octet-stream";
  }

  private String copyUriToCache(Uri uri, String fileName) throws IOException {
    InputStream input = getContext().getContentResolver().openInputStream(uri);
    if (input == null) {
      throw new IOException("Could not open the selected file");
    }

    File cacheDir = new File(getContext().getCacheDir(), "receipts");
    if (!cacheDir.exists() && !cacheDir.mkdirs()) {
      throw new IOException("Could not create receipt cache directory");
    }

    String safeName = (fileName == null || fileName.isEmpty()) ? "receipt" : fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
    File outFile = new File(cacheDir, System.currentTimeMillis() + "_" + safeName);

    try (InputStream stream = input; FileOutputStream output = new FileOutputStream(outFile)) {
      byte[] buffer = new byte[8192];
      int read;
      while ((read = stream.read(buffer)) != -1) {
        output.write(buffer, 0, read);
      }
      output.flush();
      return outFile.getAbsolutePath();
    }
  }
}
