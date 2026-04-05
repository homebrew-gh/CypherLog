import { registerPlugin, WebPlugin } from '@capacitor/core';

export interface ReceiptPickerResult {
  path: string;
  mimeType: string;
  name: string;
}

export interface ReceiptPickerPlugin {
  pickReceipt(): Promise<ReceiptPickerResult>;
}

class ReceiptPickerWeb extends WebPlugin implements ReceiptPickerPlugin {
  async pickReceipt(): Promise<ReceiptPickerResult> {
    throw new Error('Native receipt picker is only available in the Cypher Log Android app.');
  }
}

export const ReceiptPicker = registerPlugin<ReceiptPickerPlugin>('ReceiptPicker', {
  web: () => new ReceiptPickerWeb(),
});
