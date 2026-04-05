package io.cypherlog.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(AmberSignerPlugin.class);
    registerPlugin(ReceiptPickerPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
