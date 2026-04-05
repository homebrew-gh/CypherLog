import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { Car, Gauge, Wrench, Plus, X, Package, Building2, Receipt, ImagePlus, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { useVehicles, useVehicleActions } from '@/hooks/useVehicles';
import { useCompanies } from '@/hooks/useCompanies';
import { useMaintenanceActions } from '@/hooks/useMaintenance';
import { useMaintenanceCompletionActions } from '@/hooks/useMaintenanceCompletions';
import { useCurrency } from '@/hooks/useCurrency';
import { useUploadFile, useCanUploadFiles, NoPrivateServerError } from '@/hooks/useUploadFile';
import { toast } from '@/hooks/useToast';
import { uploadTagsToImetaRow } from '@/lib/maintenanceReceipt';
import { useCapacitorAndroid } from '@/hooks/useCapacitorAndroid';
import type { MaintenancePart } from '@/lib/types';

interface LogMaintenanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedVehicleId?: string;
}

// Get today's date in MM/DD/YYYY format
function getTodayFormatted(): string {
  return format(new Date(), 'MM/dd/yyyy');
}

const RECEIPT_FILE_ACCEPT = 'image/*,application/pdf';

function isAllowedReceiptFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  if (file.type === 'application/pdf') return true;
  // Some pickers omit MIME; allow by extension
  if (!file.type && /\.pdf$/i.test(file.name)) return true;
  return false;
}

export function LogMaintenanceDialog({ isOpen, onClose, preselectedVehicleId }: LogMaintenanceDialogProps) {
  const { data: vehicles = [] } = useVehicles();
  const { formatForDisplay } = useCurrency();
  const { data: companies = [] } = useCompanies();
  const { updateVehicle } = useVehicleActions();
  const { createMaintenance } = useMaintenanceActions();
  const { createCompletion } = useMaintenanceCompletionActions();
  const { mutateAsync: uploadFile } = useUploadFile();
  const canUploadReceipt = useCanUploadFiles();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);
  const isAndroidApp = useCapacitorAndroid();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    vehicleId: '',
    description: '',
    companyId: '',
    mileage: '',
    completedDate: getTodayFormatted(),
  });

  // Parts state
  const [parts, setParts] = useState<MaintenancePart[]>([]);
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPart, setNewPart] = useState<MaintenancePart>({ name: '', partNumber: '', cost: '' });

  // Get the selected vehicle
  const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);

  // Reset only on closed → open. Resetting whenever `preselectedVehicleId` changed while open
  // wiped the receipt right after the native file picker returned on some Android WebViews.
  useEffect(() => {
    const opening = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;
    if (!opening) return;
    setFormData({
      vehicleId: preselectedVehicleId || '',
      description: '',
      companyId: '',
      mileage: '',
      completedDate: getTodayFormatted(),
    });
    setParts([]);
    setShowAddPart(false);
    setNewPart({ name: '', partNumber: '', cost: '' });
    setReceiptFile(null);
  }, [isOpen, preselectedVehicleId]);

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!isAllowedReceiptFile(file)) {
      toast({
        title: 'Unsupported file type',
        description: 'Choose a photo (JPEG, PNG, etc.) or a PDF receipt.',
        variant: 'destructive',
      });
      return;
    }
    setReceiptFile(file);
  };

  const handleAddPart = () => {
    if (!newPart.name.trim()) {
      toast({
        title: 'Part name required',
        description: 'Please enter a name for the part.',
        variant: 'destructive',
      });
      return;
    }

    setParts(prev => [...prev, { 
      name: newPart.name.trim(), 
      partNumber: newPart.partNumber?.trim() || undefined,
      cost: newPart.cost?.trim() || undefined,
    }]);
    setNewPart({ name: '', partNumber: '', cost: '' });
    setShowAddPart(false);
  };

  const handleRemovePart = (index: number) => {
    setParts(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.vehicleId) {
      toast({
        title: 'Vehicle required',
        description: 'Please select a vehicle.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.description.trim()) {
      toast({
        title: 'Description required',
        description: 'Please enter a description of the maintenance performed.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.completedDate) {
      toast({
        title: 'Date required',
        description: 'Please select the date the maintenance was performed.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let receiptImetaRow: string[] | undefined;
      if (receiptFile) {
        if (!canUploadReceipt) {
          toast({
            title: 'Private media server required',
            description:
              'Add a private Blossom server in Settings → Server Settings → Media to attach receipt files.',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }
        try {
          const uploadTags = await uploadFile(receiptFile);
          receiptImetaRow = uploadTagsToImetaRow(uploadTags);
        } catch (err) {
          if (err instanceof NoPrivateServerError) {
            toast({
              title: 'Private media server required',
              description: err.message,
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Upload failed',
              description: err instanceof Error ? err.message : 'Could not upload receipt file.',
              variant: 'destructive',
            });
          }
          setIsSubmitting(false);
          return;
        }
      }

      // Create a log-only maintenance schedule
      const maintenanceId = await createMaintenance({
        vehicleId: formData.vehicleId,
        description: formData.description.trim(),
        companyId: formData.companyId || undefined,
        isLogOnly: true,
      });

      // Create the completion record with parts
      await createCompletion(
        maintenanceId,
        formData.completedDate, // Already in MM/DD/YYYY format
        formData.mileage.trim() || undefined,
        undefined, // notes
        parts.length > 0 ? parts : undefined,
        receiptImetaRow
      );

      // If mileage was provided, update the vehicle's mileage
      if (formData.mileage.trim() && selectedVehicle) {
        const currentMileage = selectedVehicle.mileage ? parseInt(selectedVehicle.mileage, 10) : 0;
        const newMileage = parseInt(formData.mileage.trim(), 10);
        
        // Only update if the new mileage is higher
        if (!isNaN(newMileage) && newMileage > currentMileage) {
          await updateVehicle(selectedVehicle.id, {
            ...selectedVehicle,
            mileage: newMileage.toString(),
          });
        }
      }

      toast({
        title: 'Maintenance logged',
        description: `Maintenance for ${selectedVehicle?.name || 'vehicle'} has been recorded.`,
      });
      onClose();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to log maintenance. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const receiptFileInput =
    typeof document !== 'undefined' ? (
      <input
        ref={receiptInputRef}
        type="file"
        accept={RECEIPT_FILE_ACCEPT}
        className="sr-only fixed left-0 top-0 -z-50 h-px w-px opacity-0"
        aria-hidden
        tabIndex={-1}
        onChange={handleReceiptChange}
      />
    ) : null;

  return (
    <>
    {/* Portal to body + non-modal Dialog: Radix still treats WebView file-picker
        focus loss as "dismiss" unless outside events are prevented and modal trap is off. */}
    {receiptFileInput ? createPortal(receiptFileInput, document.body) : null}

    <Dialog modal={false} open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-[95vw] sm:max-w-lg max-h-[90dvh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (isAndroidApp) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Log Maintenance Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Vehicle Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Vehicle *
            </Label>
            <Select
              value={formData.vehicleId}
              onValueChange={(value) => setFormData(prev => ({ ...prev, vehicleId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No vehicles found. Add a vehicle first.
                  </div>
                ) : (
                  vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.name} ({vehicle.vehicleType})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* Show vehicle current mileage if selected */}
            {selectedVehicle?.mileage && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                <Gauge className="h-4 w-4" />
                <span>Current mileage: {Number(selectedVehicle.mileage).toLocaleString()} mi</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the maintenance performed (e.g., Oil change, Brake pad replacement)"
              rows={3}
            />
          </div>

          {/* Receipt (private Blossom) — placed early so it is visible on small screens (e.g. Android) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Add receipt (optional)
            </Label>
            {!canUploadReceipt ? (
              <Alert className="border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40">
                <Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <AlertTitle className="text-sm text-sky-950 dark:text-sky-100">Receipt attachment</AlertTitle>
                <AlertDescription className="text-xs text-sky-900/90 dark:text-sky-200/90 space-y-2">
                  <p>
                    This app only uploads receipts to a Blossom server you mark as <strong>private</strong>. Until you
                    add one, you will not see a file picker here—that is expected.
                  </p>
                  <p>
                    <strong>Where to set it up:</strong> open the menu (☰) → <strong>Nostr Relays</strong> →{' '}
                    <strong>Configure</strong> → <strong>Media</strong> tab → add a Blossom URL and turn on{' '}
                    <strong>Private</strong>.
                  </p>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                {receiptFile ? (
                  <div className="flex items-center gap-2 flex-wrap rounded-md border p-2 bg-muted/30">
                    <span className="text-sm truncate flex-1 min-w-0">{receiptFile.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setReceiptFile(null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => receiptInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4 mr-2" />
                    Choose receipt (image or PDF)
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Service Provider / Company */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Service Provider
            </Label>
            <Select
              value={formData.companyId}
              onValueChange={(value) => setFormData(prev => ({ ...prev, companyId: value === '__none__' ? '' : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a company (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-muted-foreground">
                  None
                </SelectItem>
                {companies.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No companies found. Add one in the Company/Service tab.
                  </div>
                ) : (
                  companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name} ({company.serviceType})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Parts Section */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Parts Used
            </Label>
            
            {/* List of added parts */}
            {parts.length > 0 && (
              <div className="space-y-2">
                {parts.map((part, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{part.name}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        {part.partNumber && <span>Part #: {part.partNumber}</span>}
                        {part.cost && <span>Cost: {formatForDisplay(part.cost)}</span>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleRemovePart(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Part Form */}
            {showAddPart ? (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="partName" className="text-sm">Part Name *</Label>
                  <Input
                    id="partName"
                    value={newPart.name}
                    onChange={(e) => setNewPart(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Oil Filter"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="partNumber" className="text-sm">Part Number</Label>
                    <Input
                      id="partNumber"
                      value={newPart.partNumber || ''}
                      onChange={(e) => setNewPart(prev => ({ ...prev, partNumber: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="partCost" className="text-sm">Cost</Label>
                    <Input
                      id="partCost"
                      value={newPart.cost || ''}
                      onChange={(e) => setNewPart(prev => ({ ...prev, cost: e.target.value }))}
                      placeholder="e.g., $12.99"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddPart} size="sm">
                    Add Part
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddPart(false);
                      setNewPart({ name: '', partNumber: '', cost: '' });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddPart(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Part
              </Button>
            )}
          </div>

          {/* Mileage */}
          <div className="space-y-2">
            <Label htmlFor="mileage" className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Current Vehicle Mileage
            </Label>
            <Input
              id="mileage"
              type="number"
              min="0"
              value={formData.mileage}
              onChange={(e) => setFormData(prev => ({ ...prev, mileage: e.target.value }))}
              placeholder="e.g., 45000"
            />
            <p className="text-xs text-muted-foreground">
              If entered, this will update the vehicle's current mileage on the Vehicles tab.
            </p>
          </div>

          {/* Date */}
          <DateInput
            id="completedDate"
            label="Date Performed *"
            value={formData.completedDate}
            onChange={(value) => setFormData(prev => ({ ...prev, completedDate: value }))}
            showTodayCheckbox
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-start gap-2 pt-4 border-t">
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || vehicles.length === 0}
          >
            {isSubmitting ? 'Saving...' : 'Log Maintenance'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
