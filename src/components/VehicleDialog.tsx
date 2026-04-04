import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Upload, X, FileText, Image, ChevronDown, ChevronUp, AlertCircle, Trash2, MoreVertical, Shield, CreditCard, Wrench, CirclePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { DateInput } from '@/components/ui/date-input';
import { VehicleMaintenanceWizard } from '@/components/VehicleMaintenanceWizard';
import { useVehicleActions } from '@/hooks/useVehicles';
import { useVehicleTypes } from '@/hooks/useVehicleTypes';
import { useWarrantyActions } from '@/hooks/useWarranties';
import { useSubscriptionActions } from '@/hooks/useSubscriptions';
import { useUploadFile, useDeleteFile, NoPrivateServerError, useCanUploadFiles } from '@/hooks/useUploadFile';
import { toast } from '@/hooks/useToast';
import { FUEL_TYPES, BILLING_FREQUENCIES, type Vehicle, type BillingFrequency } from '@/lib/types';
import { logger } from '@/lib/logger';

interface VehicleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle?: Vehicle; // If provided, we're editing
}

// Type-specific field configurations
const TYPE_FIELDS: Record<string, string[]> = {
  'Personal Vehicle': ['make', 'model', 'year', 'licensePlate', 'mileage', 'fuelType', 'registration'],
  'Recreational': ['make', 'model', 'year', 'licensePlate', 'mileage', 'fuelType', 'registration'],
  'Farm Machinery': ['make', 'model', 'year', 'serialNumber', 'engineHours', 'fuelType'],
  'Business Vehicle': ['make', 'model', 'year', 'licensePlate', 'mileage', 'fuelType', 'registration'],
  'Boat': ['make', 'model', 'year', 'hullId', 'registrationNumber', 'engineHours', 'fuelType', 'registration'],
  'Plane': ['make', 'model', 'year', 'tailNumber', 'hobbsTime', 'fuelType', 'registration'],
};

// Default fields for custom types
const DEFAULT_FIELDS = ['make', 'model', 'year', 'serialNumber', 'fuelType'];

// Subscription entry type for form state
interface SubscriptionEntry {
  id: string; // Temporary ID for React keys
  name: string;
  subscriptionType: string;
  cost: string;
  billingFrequency: BillingFrequency;
}

// Create a new empty subscription entry
function createEmptySubscription(): SubscriptionEntry {
  return {
    id: crypto.randomUUID(),
    name: '',
    subscriptionType: 'Vehicle',
    cost: '',
    billingFrequency: 'monthly',
  };
}

export function VehicleDialog({ isOpen, onClose, vehicle }: VehicleDialogProps) {
  const { createVehicle, updateVehicle } = useVehicleActions();
  const { allVehicleTypes, addCustomVehicleType } = useVehicleTypes();
  const { createWarranty } = useWarrantyActions();
  const { createSubscription } = useSubscriptionActions();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { mutateAsync: deleteFile, isPending: isDeleting } = useDeleteFile();
  const canUploadFiles = useCanUploadFiles();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [newType, setNewType] = useState('');
  const [showWarranty, setShowWarranty] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  
  // Options to create linked events
  const [createWarrantyEvent, setCreateWarrantyEvent] = useState(false);
  const [createSubscriptionEvent, setCreateSubscriptionEvent] = useState(false);
  
  // Maintenance wizard state
  const [showMaintenanceWizard, setShowMaintenanceWizard] = useState(false);
  const [savedVehicleId, setSavedVehicleId] = useState<string | null>(null);
  const [savedVehicleName, setSavedVehicleName] = useState<string>('');

  const [formData, setFormData] = useState({
    vehicleType: '',
    name: '',
    make: '',
    model: '',
    year: '',
    purchaseDate: '',
    purchasePrice: '',
    purchaseLocation: '',
    licensePlate: '',
    mileage: '',
    fuelType: '',
    registrationExpiry: '',
    hullId: '',
    registrationNumber: '',
    engineHours: '',
    tailNumber: '',
    hobbsTime: '',
    serialNumber: '',
    receiptUrl: '',
    warrantyUrl: '',
    warrantyExpiry: '',
    documents: [] as { url: string; name: string }[],
    notes: '',
  });

  // Multiple subscriptions state
  const [subscriptions, setSubscriptions] = useState<SubscriptionEntry[]>([]);

  const receiptInputRef = useRef<HTMLInputElement>(null);
  const warrantyInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!vehicle;

  // Get fields to show based on vehicle type
  const getVisibleFields = () => {
    if (!formData.vehicleType) return [];
    return TYPE_FIELDS[formData.vehicleType] || DEFAULT_FIELDS;
  };

  const visibleFields = getVisibleFields();

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      if (vehicle) {
        setFormData({
          vehicleType: vehicle.vehicleType,
          name: vehicle.name,
          make: vehicle.make || '',
          model: vehicle.model || '',
          year: vehicle.year || '',
          purchaseDate: vehicle.purchaseDate || '',
          purchasePrice: vehicle.purchasePrice || '',
          purchaseLocation: vehicle.purchaseLocation || '',
          licensePlate: vehicle.licensePlate || '',
          mileage: vehicle.mileage || '',
          fuelType: vehicle.fuelType || '',
          registrationExpiry: vehicle.registrationExpiry || '',
          hullId: vehicle.hullId || '',
          registrationNumber: vehicle.registrationNumber || '',
          engineHours: vehicle.engineHours || '',
          tailNumber: vehicle.tailNumber || '',
          hobbsTime: vehicle.hobbsTime || '',
          serialNumber: vehicle.serialNumber || '',
          receiptUrl: vehicle.receiptUrl || '',
          warrantyUrl: vehicle.warrantyUrl || '',
          warrantyExpiry: vehicle.warrantyExpiry || '',
          documents: (vehicle.documents ?? vehicle.documentsUrls?.map(url => ({ url, name: '' })) ?? []).map(d => ({
            url: d.url,
            name: typeof d === 'object' && d.name != null ? d.name : '',
          })),
          notes: vehicle.notes || '',
        });
        setShowWarranty(!!(vehicle.warrantyUrl || vehicle.warrantyExpiry));
        setShowSubscription(false);
        setCreateWarrantyEvent(false);
        setCreateSubscriptionEvent(false);
        setSubscriptions([]);
      } else {
        setFormData({
          vehicleType: '',
          name: '',
          make: '',
          model: '',
          year: '',
          purchaseDate: '',
          purchasePrice: '',
          purchaseLocation: '',
          licensePlate: '',
          mileage: '',
          fuelType: '',
          registrationExpiry: '',
          hullId: '',
          registrationNumber: '',
          engineHours: '',
          tailNumber: '',
          hobbsTime: '',
          serialNumber: '',
          receiptUrl: '',
          warrantyUrl: '',
          warrantyExpiry: '',
          documents: [],
          notes: '',
        });
        setShowWarranty(false);
        setShowSubscription(false);
        setCreateWarrantyEvent(false);
        setCreateSubscriptionEvent(false);
        setSubscriptions([]);
      }
      setShowAddType(false);
      setNewType('');
    }
  }, [isOpen, vehicle]);

  const handleFileUpload = async (file: File, type: 'receipt' | 'warranty' | 'document') => {
    try {
      const tags = await uploadFile(file);
      const url = tags[0]?.[1];
      if (url) {
        if (type === 'document') {
          setFormData(prev => ({
            ...prev,
            documents: [...prev.documents, { url, name: '' }],
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            [type === 'receipt' ? 'receiptUrl' : 'warrantyUrl']: url,
          }));
        }
        toast({
          title: 'File uploaded',
          description: `${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully.`,
        });
      }
    } catch (error) {
      logger.error('File upload error:', error);
      
      if (error instanceof NoPrivateServerError) {
        toast({
          title: 'No private server configured',
          description: 'Please configure a private media server in Settings > Server Settings > Media before uploading sensitive files.',
          variant: 'destructive',
        });
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        toast({
          title: 'Upload failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    }
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'receipt');
    e.target.value = '';
  };

  const handleWarrantyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'warranty');
    e.target.value = '';
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'document');
    e.target.value = '';
  };

  const handleRemoveDocument = (index: number, deleteFromServer: boolean = false) => {
    const url = formData.documents[index]?.url;
    
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));

    if (deleteFromServer && url) {
      deleteFile(url)
        .then(() => {
          toast({
            title: 'File deleted',
            description: 'Document has been removed from your media server.',
          });
        })
        .catch((error) => {
          logger.error('Failed to delete file from server:', error);
          toast({
            title: 'Could not delete from server',
            description: error instanceof Error ? error.message : 'The file reference was removed but the file may still exist on the server.',
            variant: 'destructive',
          });
        });
    }
  };

  const handleRemoveFile = async (type: 'receipt' | 'warranty', deleteFromServer: boolean = false) => {
    const url = type === 'receipt' ? formData.receiptUrl : formData.warrantyUrl;
    
    // Clear the URL from form data first
    setFormData(prev => ({
      ...prev,
      [type === 'receipt' ? 'receiptUrl' : 'warrantyUrl']: '',
    }));

    // Optionally delete from server
    if (deleteFromServer && url) {
      try {
        await deleteFile(url);
        toast({
          title: 'File deleted',
          description: 'File has been removed from your media server.',
        });
      } catch (error) {
        logger.error('Failed to delete file from server:', error);
        toast({
          title: 'Could not delete from server',
          description: error instanceof Error ? error.message : 'The file reference was removed but the file may still exist on the server.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleAddType = () => {
    if (newType.trim()) {
      addCustomVehicleType(newType.trim());
      setFormData(prev => ({ ...prev, vehicleType: newType.trim() }));
      setNewType('');
      setShowAddType(false);
    }
  };

  // Subscription management functions
  const handleAddSubscription = useCallback(() => {
    setSubscriptions(prev => [...prev, createEmptySubscription()]);
  }, []);

  const handleRemoveSubscription = useCallback((id: string) => {
    setSubscriptions(prev => prev.filter(sub => sub.id !== id));
  }, []);

  const handleUpdateSubscription = useCallback((id: string, field: keyof SubscriptionEntry, value: string) => {
    setSubscriptions(prev => prev.map(sub =>
      sub.id === id ? { ...sub, [field]: value } : sub
    ));
  }, []);

  const handleSubmit = async (openMaintenanceWizard: boolean = false) => {
    if (!formData.vehicleType) {
      toast({
        title: 'Vehicle type required',
        description: 'Please select a vehicle type.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a vehicle name or description.',
        variant: 'destructive',
      });
      return;
    }

    // Validate subscription fields if creating subscriptions
    if (createSubscriptionEvent && subscriptions.length > 0) {
      for (let i = 0; i < subscriptions.length; i++) {
        const sub = subscriptions[i];
        if (!sub.name.trim()) {
          toast({
            title: 'Subscription name required',
            description: `Please enter a name for subscription ${i + 1}.`,
            variant: 'destructive',
          });
          return;
        }
        if (!sub.cost.trim()) {
          toast({
            title: 'Subscription cost required',
            description: `Please enter the cost for "${sub.name}".`,
            variant: 'destructive',
          });
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      let vehicleId: string;
      
      if (isEditing && vehicle) {
        await updateVehicle(vehicle.id, {
          ...formData,
          documents: formData.documents.map(({ url, name }) => ({ url, name: name.trim() || undefined })),
        });
        vehicleId = vehicle.id;
        toast({
          title: 'Vehicle updated',
          description: 'Your vehicle has been updated successfully.',
        });
      } else {
        vehicleId = await createVehicle({
          ...formData,
          documents: formData.documents.map(({ url, name }) => ({ url, name: name.trim() || undefined })),
        });
        toast({
          title: 'Vehicle added',
          description: 'Your vehicle has been added successfully.',
        });
      }

      // Create linked warranty event if checkbox is checked and warranty info exists
      if (createWarrantyEvent && formData.warrantyExpiry && !isEditing) {
        try {
          await createWarranty({
            name: `${formData.name} Warranty`,
            warrantyType: 'Automotive',
            purchaseDate: formData.purchaseDate || undefined,
            purchasePrice: formData.purchasePrice || undefined,
            warrantyStartDate: formData.purchaseDate || undefined,
            warrantyEndDate: formData.warrantyExpiry,
            linkedType: 'vehicle',
            linkedItemId: vehicleId,
            linkedItemName: formData.name,
            documents: formData.warrantyUrl ? [{ url: formData.warrantyUrl, name: undefined }] : [],
            receiptUrl: formData.receiptUrl || undefined,
          });
          toast({
            title: 'Warranty created',
            description: 'A warranty record has been created in the Warranties tab.',
          });
        } catch (error) {
          logger.error('Failed to create warranty:', error);
          toast({
            title: 'Warning',
            description: 'Vehicle saved but failed to create warranty record.',
            variant: 'destructive',
          });
        }
      }

      // Create linked subscription events if checkbox is checked and there are subscriptions
      if (createSubscriptionEvent && subscriptions.length > 0 && !isEditing) {
        const createdCount = { success: 0, failed: 0 };
        
        for (const sub of subscriptions) {
          if (sub.name.trim() && sub.cost.trim()) {
            try {
              await createSubscription({
                name: sub.name.trim(),
                subscriptionType: sub.subscriptionType,
                cost: sub.cost.trim(),
                billingFrequency: sub.billingFrequency,
                linkedAssetType: 'vehicle',
                linkedAssetId: vehicleId,
                linkedAssetName: formData.name,
              });
              createdCount.success++;
            } catch (error) {
              logger.error('Failed to create subscription:', error);
              createdCount.failed++;
            }
          }
        }

        if (createdCount.success > 0) {
          toast({
            title: createdCount.success === 1 ? 'Subscription created' : 'Subscriptions created',
            description: createdCount.success === 1
              ? 'A subscription record has been created in the Subscriptions tab.'
              : `${createdCount.success} subscription records have been created in the Subscriptions tab.`,
          });
        }
        
        if (createdCount.failed > 0) {
          toast({
            title: 'Warning',
            description: `Failed to create ${createdCount.failed} subscription${createdCount.failed > 1 ? 's' : ''}.`,
            variant: 'destructive',
          });
        }
      }

      // If openMaintenanceWizard is true, show the wizard instead of closing
      if (openMaintenanceWizard && !isEditing) {
        setSavedVehicleId(vehicleId);
        setSavedVehicleName(formData.name);
        setShowMaintenanceWizard(true);
      } else {
        onClose();
      }
    } catch {
      toast({
        title: 'Error',
        description: `Failed to ${isEditing ? 'update' : 'add'} vehicle. Please try again.`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMaintenanceWizardClose = () => {
    setShowMaintenanceWizard(false);
    setSavedVehicleId(null);
    setSavedVehicleName('');
    onClose();
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Vehicle Type Selection */}
          <div className="space-y-2">
            <Label>Vehicle Type *</Label>
            {showAddType ? (
              <div className="flex gap-2">
                <Input
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  placeholder="Enter custom type name"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddType();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddType} size="sm">
                  Add
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddType(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select
                  value={formData.vehicleType}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, vehicleType: value }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a vehicle type" />
                  </SelectTrigger>
                  <SelectContent>
                    {allVehicleTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setShowAddType(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Name/Description */}
          <div className="space-y-2">
            <Label htmlFor="name">Name/Description *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., 2020 Toyota Camry, John Deere Tractor"
            />
          </div>

          {/* Type-specific fields */}
          {formData.vehicleType && (
            <>
              {/* Make/Model/Year row */}
              {(visibleFields.includes('make') || visibleFields.includes('model') || visibleFields.includes('year')) && (
                <div className="grid grid-cols-3 gap-2">
                  {visibleFields.includes('make') && (
                    <div className="space-y-2">
                      <Label htmlFor="make">Make</Label>
                      <Input
                        id="make"
                        value={formData.make}
                        onChange={(e) => setFormData(prev => ({ ...prev, make: e.target.value }))}
                        placeholder="Make"
                      />
                    </div>
                  )}
                  {visibleFields.includes('model') && (
                    <div className="space-y-2">
                      <Label htmlFor="model">Model</Label>
                      <Input
                        id="model"
                        value={formData.model}
                        onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                        placeholder="Model"
                      />
                    </div>
                  )}
                  {visibleFields.includes('year') && (
                    <div className="space-y-2">
                      <Label htmlFor="year">Year</Label>
                      <Input
                        id="year"
                        value={formData.year}
                        onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value }))}
                        placeholder="Year"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Serial Number (Farm Machinery) */}
              {visibleFields.includes('serialNumber') && (
                <div className="space-y-2">
                  <Label htmlFor="serialNumber">Serial Number</Label>
                  <Input
                    id="serialNumber"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, serialNumber: e.target.value }))}
                    placeholder="Serial Number"
                  />
                </div>
              )}

              {/* Hull ID (Boats) */}
              {visibleFields.includes('hullId') && (
                <div className="space-y-2">
                  <Label htmlFor="hullId">Hull ID (HIN)</Label>
                  <Input
                    id="hullId"
                    value={formData.hullId}
                    onChange={(e) => setFormData(prev => ({ ...prev, hullId: e.target.value }))}
                    placeholder="Hull Identification Number"
                  />
                </div>
              )}

              {/* Tail Number (Planes) */}
              {visibleFields.includes('tailNumber') && (
                <div className="space-y-2">
                  <Label htmlFor="tailNumber">Tail Number</Label>
                  <Input
                    id="tailNumber"
                    value={formData.tailNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, tailNumber: e.target.value }))}
                    placeholder="Aircraft Tail Number"
                  />
                </div>
              )}

              {/* License Plate / Registration Number */}
              {(visibleFields.includes('licensePlate') || visibleFields.includes('registrationNumber')) && (
                <div className="space-y-2">
                  <Label htmlFor="licensePlate">
                    {visibleFields.includes('registrationNumber') ? 'Registration Number' : 'License Plate'}
                  </Label>
                  <Input
                    id="licensePlate"
                    value={visibleFields.includes('registrationNumber') ? formData.registrationNumber : formData.licensePlate}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      [visibleFields.includes('registrationNumber') ? 'registrationNumber' : 'licensePlate']: e.target.value
                    }))}
                    placeholder={visibleFields.includes('registrationNumber') ? 'Registration Number' : 'License Plate'}
                  />
                </div>
              )}

              {/* Mileage / Engine Hours / Hobbs Time */}
              {(visibleFields.includes('mileage') || visibleFields.includes('engineHours') || visibleFields.includes('hobbsTime')) && (
                <div className="space-y-2">
                  <Label htmlFor="usage">
                    {visibleFields.includes('hobbsTime') ? 'Hobbs Time' :
                     visibleFields.includes('engineHours') ? 'Engine Hours' : 'Mileage'}
                  </Label>
                  <Input
                    id="usage"
                    value={
                      visibleFields.includes('hobbsTime') ? formData.hobbsTime :
                      visibleFields.includes('engineHours') ? formData.engineHours : formData.mileage
                    }
                    onChange={(e) => {
                      const field = visibleFields.includes('hobbsTime') ? 'hobbsTime' :
                                    visibleFields.includes('engineHours') ? 'engineHours' : 'mileage';
                      setFormData(prev => ({ ...prev, [field]: e.target.value }));
                    }}
                    placeholder={
                      visibleFields.includes('hobbsTime') ? 'Hours' :
                      visibleFields.includes('engineHours') ? 'Hours' : 'Miles'
                    }
                  />
                </div>
              )}

              {/* Fuel Type */}
              {visibleFields.includes('fuelType') && (
                <div className="space-y-2">
                  <Label>Fuel Type</Label>
                  <Select
                    value={formData.fuelType}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, fuelType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select fuel type" />
                    </SelectTrigger>
                    <SelectContent>
                      {FUEL_TYPES.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Registration Expiry */}
              {visibleFields.includes('registration') && (
                <DateInput
                  id="registrationExpiry"
                  label="Registration Expiry"
                  value={formData.registrationExpiry}
                  onChange={(value) => setFormData(prev => ({ ...prev, registrationExpiry: value }))}
                />
              )}
            </>
          )}

          {/* Purchase Date */}
          <DateInput
            id="purchaseDate"
            label="Purchase Date"
            value={formData.purchaseDate}
            onChange={(value) => setFormData(prev => ({ ...prev, purchaseDate: value }))}
            showTodayCheckbox
          />

          {/* Purchase Price */}
          <div className="space-y-2">
            <Label htmlFor="purchasePrice">Purchase Price</Label>
            <Input
              id="purchasePrice"
              value={formData.purchasePrice}
              onChange={(e) => setFormData(prev => ({ ...prev, purchasePrice: e.target.value }))}
              placeholder="$0.00"
            />
          </div>

          {/* Where Bought */}
          <div className="space-y-2">
            <Label htmlFor="purchaseLocation">Where Bought</Label>
            <Input
              id="purchaseLocation"
              value={formData.purchaseLocation}
              onChange={(e) => setFormData(prev => ({ ...prev, purchaseLocation: e.target.value }))}
              placeholder="e.g., ABC Motors, private party"
            />
          </div>

          {/* Warranty Section (collapsible) */}
          <Collapsible open={showWarranty} onOpenChange={setShowWarranty}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
              {showWarranty ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <Shield className="h-4 w-4" />
              <span className="font-medium">Warranty Information</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              <DateInput
                id="warrantyExpiry"
                label="Warranty Expiry"
                value={formData.warrantyExpiry}
                onChange={(value) => setFormData(prev => ({ ...prev, warrantyExpiry: value }))}
              />
              <div className="space-y-2">
                <Label>Warranty Document</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    value={formData.warrantyUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, warrantyUrl: e.target.value }))}
                    placeholder="URL or upload file"
                    className="flex-1"
                  />
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    ref={warrantyInputRef}
                    onChange={handleWarrantyUpload}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => warrantyInputRef.current?.click()}
                          disabled={isUploading || !canUploadFiles}
                        >
                          {isUploading ? (
                            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : !canUploadFiles ? (
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!canUploadFiles 
                        ? 'Configure a private media server in Settings to enable uploads'
                        : 'Upload warranty document'
                      }
                    </TooltipContent>
                  </Tooltip>
                </div>
                {formData.warrantyUrl && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span className="truncate flex-1">{formData.warrantyUrl}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <MoreVertical className="h-3 w-3" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRemoveFile('warranty', false)}>
                          <X className="h-4 w-4 mr-2" />
                          Remove from vehicle
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleRemoveFile('warranty', true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete from server
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>

              {/* Option to create warranty event */}
              {!isEditing && formData.warrantyExpiry && (
                <div className="flex items-center space-x-2 pt-2 border-t">
                  <Checkbox
                    id="createWarrantyEvent"
                    checked={createWarrantyEvent}
                    onCheckedChange={(checked) => setCreateWarrantyEvent(checked === true)}
                  />
                  <Label
                    htmlFor="createWarrantyEvent"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Also create a warranty record in the Warranties tab
                  </Label>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Subscription Section (collapsible) - only for new vehicles */}
          {!isEditing && (
            <Collapsible open={showSubscription} onOpenChange={setShowSubscription}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
                {showSubscription ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <CreditCard className="h-4 w-4" />
                <span className="font-medium">Vehicle Subscriptions</span>
                {subscriptions.length > 0 && (
                  <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {subscriptions.length}
                  </span>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Add recurring subscriptions linked to this vehicle (e.g., roadside assistance, extended warranty service, maintenance plan).
                </p>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="createSubscriptionEvent"
                    checked={createSubscriptionEvent}
                    onCheckedChange={(checked) => {
                      const isChecked = checked === true;
                      setCreateSubscriptionEvent(isChecked);
                      // Add an empty subscription when enabling if none exist
                      if (isChecked && subscriptions.length === 0) {
                        handleAddSubscription();
                      }
                    }}
                  />
                  <Label
                    htmlFor="createSubscriptionEvent"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Create subscription records in the Subscriptions tab
                  </Label>
                </div>

                {createSubscriptionEvent && (
                  <div className="space-y-4">
                    {subscriptions.map((sub, index) => (
                      <div 
                        key={sub.id} 
                        className="space-y-3 p-3 border rounded-lg bg-muted/30 relative"
                      >
                        {/* Subscription header with remove button */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">
                            Subscription {index + 1}
                          </span>
                          {subscriptions.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveSubscription(sub.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {/* Subscription Name */}
                        <div className="space-y-1.5">
                          <Label htmlFor={`sub-name-${sub.id}`} className="text-xs">
                            Subscription Name *
                          </Label>
                          <Input
                            id={`sub-name-${sub.id}`}
                            value={sub.name}
                            onChange={(e) => handleUpdateSubscription(sub.id, 'name', e.target.value)}
                            placeholder="e.g., AAA Roadside Assistance"
                            className="h-9"
                          />
                        </div>

                        {/* Cost and Billing Frequency row */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={`sub-cost-${sub.id}`} className="text-xs">
                              Cost *
                            </Label>
                            <Input
                              id={`sub-cost-${sub.id}`}
                              value={sub.cost}
                              onChange={(e) => handleUpdateSubscription(sub.id, 'cost', e.target.value)}
                              placeholder="$0.00"
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Billing Frequency</Label>
                            <Select
                              value={sub.billingFrequency}
                              onValueChange={(value) => handleUpdateSubscription(sub.id, 'billingFrequency', value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {BILLING_FREQUENCIES.map(({ value, label }) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Subscription Type */}
                        <div className="space-y-1.5">
                          <Label className="text-xs">Subscription Type</Label>
                          <Select
                            value={sub.subscriptionType}
                            onValueChange={(value) => handleUpdateSubscription(sub.id, 'subscriptionType', value)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Vehicle">Vehicle</SelectItem>
                              <SelectItem value="Streaming">Streaming</SelectItem>
                              <SelectItem value="Software">Software</SelectItem>
                              <SelectItem value="Health/Wellness">Health/Wellness</SelectItem>
                              <SelectItem value="Finance">Finance</SelectItem>
                              <SelectItem value="Home">Home</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}

                    {/* Add Another Subscription button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddSubscription}
                      className="w-full"
                    >
                      <CirclePlus className="h-4 w-4 mr-2" />
                      Add Another Subscription
                    </Button>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Receipt Upload */}
          <div className="space-y-2">
            <Label>Purchase Receipt</Label>
            <div className="flex gap-2 items-center">
              <Input
                value={formData.receiptUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, receiptUrl: e.target.value }))}
                placeholder="URL or upload file"
                className="flex-1"
              />
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                ref={receiptInputRef}
                onChange={handleReceiptUpload}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => receiptInputRef.current?.click()}
                      disabled={isUploading || !canUploadFiles}
                    >
                      {isUploading ? (
                        <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : !canUploadFiles ? (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {!canUploadFiles 
                    ? 'Configure a private media server in Settings to enable uploads'
                    : 'Upload receipt image or PDF'
                  }
                </TooltipContent>
              </Tooltip>
            </div>
            {formData.receiptUrl && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Image className="h-4 w-4" />
                <span className="truncate flex-1">{formData.receiptUrl}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <MoreVertical className="h-3 w-3" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleRemoveFile('receipt', false)}>
                      <X className="h-4 w-4 mr-2" />
                      Remove from vehicle
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => handleRemoveFile('receipt', true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete from server
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Documents Upload */}
          <div className="space-y-2">
            <Label>Additional Documents (PDFs)</Label>
            <div className="flex gap-2 items-center">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                ref={documentInputRef}
                onChange={handleDocumentUpload}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => documentInputRef.current?.click()}
                      disabled={isUploading || !canUploadFiles}
                      className="w-full"
                    >
                      {isUploading ? (
                        <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                      ) : !canUploadFiles ? (
                        <AlertCircle className="h-4 w-4 text-amber-500 mr-2" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Upload Document
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {!canUploadFiles 
                    ? 'Configure a private media server in Settings to enable uploads'
                    : 'Upload additional PDF documents'
                  }
                </TooltipContent>
              </Tooltip>
            </div>
            {formData.documents.length > 0 && (
              <div className="space-y-2">
                {formData.documents.map((doc, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                      value={doc.name}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        documents: prev.documents.map((d, i) => i === index ? { ...d, name: e.target.value } : d),
                      }))}
                      placeholder="e.g. Registration, Service manual"
                      className="flex-1 h-8 text-sm"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 shrink-0"
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <MoreVertical className="h-3 w-3" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRemoveDocument(index, false)}>
                          <X className="h-4 w-4 mr-2" />
                          Remove from vehicle
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleRemoveDocument(index, true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete from server
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-4 border-t">
          {/* Primary actions row */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handleSubmit(false)} disabled={isSubmitting || isUploading}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
            {!isEditing && (
              <Button 
                variant="secondary" 
                onClick={() => handleSubmit(true)} 
                disabled={isSubmitting || isUploading}
              >
                <Wrench className="h-4 w-4 mr-2" />
                Save & Add Maintenance
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Discard
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Maintenance Wizard Dialog */}
    {savedVehicleId && (
      <VehicleMaintenanceWizard
        isOpen={showMaintenanceWizard}
        onClose={handleMaintenanceWizardClose}
        vehicleId={savedVehicleId}
        vehicleName={savedVehicleName}
      />
    )}
    </>
  );
}
