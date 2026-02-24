import { useState, useEffect, useMemo } from 'react';
import { Plus, X, AlertTriangle, Building, Package, Car, TreePine, Link2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSubscriptionActions } from '@/hooks/useSubscriptions';
import { useSubscriptionTypes } from '@/hooks/useSubscriptionTypes';
import { useCompanies } from '@/hooks/useCompanies';
import { useAppliances } from '@/hooks/useAppliances';
import { useVehicles } from '@/hooks/useVehicles';
import { useCustomHomeFeatures } from '@/hooks/useCustomHomeFeatures';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from '@/hooks/useToast';
import { DateInput } from '@/components/ui/date-input';
import { BILLING_FREQUENCIES, type Subscription, type BillingFrequency, type LinkedAssetType } from '@/lib/types';
import { getGroupedCurrencies, getCurrency } from '@/lib/currency';

interface SubscriptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  subscription?: Subscription; // If provided, we're editing
}

export function SubscriptionDialog({ isOpen, onClose, subscription }: SubscriptionDialogProps) {
  const { createSubscription, updateSubscription } = useSubscriptionActions();
  const { allSubscriptionTypes, addCustomSubscriptionType } = useSubscriptionTypes();
  const { data: companies = [] } = useCompanies();
  const { data: appliances = [] } = useAppliances();
  const { data: vehicles = [] } = useVehicles();
  const { allHomeFeatures } = useCustomHomeFeatures();
  const { entryCurrency } = useCurrency();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [newType, setNewType] = useState('');
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [assetSearchOpen, setAssetSearchOpen] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    subscriptionType: '',
    cost: '',
    currency: entryCurrency,
    billingFrequency: 'monthly' as BillingFrequency,
    companyId: '',
    companyName: '',
    linkedAssetType: '' as LinkedAssetType | '',
    linkedAssetId: '',
    linkedAssetName: '',
    notes: '',
    startDate: '',
  });

  const groupedCurrencies = getGroupedCurrencies();
  const isEditing = !!subscription;

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      if (subscription) {
        setFormData({
          name: subscription.name,
          subscriptionType: subscription.subscriptionType,
          cost: subscription.cost,
          currency: subscription.currency || entryCurrency,
          billingFrequency: subscription.billingFrequency,
          companyId: subscription.companyId || '',
          companyName: subscription.companyName || '',
          linkedAssetType: subscription.linkedAssetType || '',
          linkedAssetId: subscription.linkedAssetId || '',
          linkedAssetName: subscription.linkedAssetName || '',
          notes: subscription.notes || '',
          startDate: subscription.startDate || '',
        });
      } else {
        setFormData({
          name: '',
          subscriptionType: '',
          cost: '',
          currency: entryCurrency,
          billingFrequency: 'monthly',
          companyId: '',
          companyName: '',
          linkedAssetType: '',
          linkedAssetId: '',
          linkedAssetName: '',
          notes: '',
          startDate: '',
        });
      }
      setShowAddType(false);
      setNewType('');
      setCompanySearch('');
      setAssetSearch('');
    }
  }, [isOpen, subscription, entryCurrency]);

  // Filter companies for search
  const filteredCompanies = useMemo(() => {
    if (!companySearch) return companies;
    const search = companySearch.toLowerCase();
    return companies.filter(c => 
      c.name.toLowerCase().includes(search) ||
      c.serviceType.toLowerCase().includes(search)
    );
  }, [companies, companySearch]);

  // Get selected company name for display
  const selectedCompanyName = useMemo(() => {
    if (formData.companyId) {
      const company = companies.find(c => c.id === formData.companyId);
      return company?.name || '';
    }
    return formData.companyName;
  }, [formData.companyId, formData.companyName, companies]);

  const handleAddType = () => {
    if (newType.trim()) {
      addCustomSubscriptionType(newType.trim());
      setFormData(prev => ({ ...prev, subscriptionType: newType.trim() }));
      setNewType('');
      setShowAddType(false);
    }
  };

  const handleSelectCompany = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    if (company) {
      setFormData(prev => ({
        ...prev,
        companyId: company.id,
        companyName: '', // Clear manual name when selecting a company
      }));
    }
    setCompanySearchOpen(false);
    setCompanySearch('');
  };

  const handleManualCompanyName = (name: string) => {
    setFormData(prev => ({
      ...prev,
      companyId: '', // Clear company ID when entering manual name
      companyName: name,
    }));
    setCompanySearchOpen(false);
    setCompanySearch('');
  };

  const handleClearCompany = () => {
    setFormData(prev => ({
      ...prev,
      companyId: '',
      companyName: '',
    }));
  };

  // Filter assets based on search
  const filteredAppliances = useMemo(() => {
    if (!assetSearch) return appliances;
    const search = assetSearch.toLowerCase();
    return appliances.filter(a => 
      a.model.toLowerCase().includes(search) ||
      (a.manufacturer && a.manufacturer.toLowerCase().includes(search))
    );
  }, [appliances, assetSearch]);

  const filteredVehicles = useMemo(() => {
    if (!assetSearch) return vehicles;
    const search = assetSearch.toLowerCase();
    return vehicles.filter(v => 
      v.name.toLowerCase().includes(search) ||
      (v.make && v.make.toLowerCase().includes(search)) ||
      (v.model && v.model.toLowerCase().includes(search))
    );
  }, [vehicles, assetSearch]);

  const filteredHomeFeatures = useMemo(() => {
    if (!assetSearch) return allHomeFeatures;
    const search = assetSearch.toLowerCase();
    return allHomeFeatures.filter(f => f.toLowerCase().includes(search));
  }, [allHomeFeatures, assetSearch]);

  // Get selected asset display name
  const selectedAssetDisplay = useMemo(() => {
    if (!formData.linkedAssetType) return '';
    
    if (formData.linkedAssetType === 'appliance' && formData.linkedAssetId) {
      const appliance = appliances.find(a => a.id === formData.linkedAssetId);
      return appliance ? `${appliance.model}${appliance.manufacturer ? ` (${appliance.manufacturer})` : ''}` : '';
    }
    
    if (formData.linkedAssetType === 'vehicle' && formData.linkedAssetId) {
      const vehicle = vehicles.find(v => v.id === formData.linkedAssetId);
      return vehicle ? vehicle.name : '';
    }
    
    if (formData.linkedAssetType === 'home_feature' && formData.linkedAssetName) {
      return formData.linkedAssetName;
    }
    
    return '';
  }, [formData.linkedAssetType, formData.linkedAssetId, formData.linkedAssetName, appliances, vehicles]);

  const handleSelectAppliance = (applianceId: string) => {
    const appliance = appliances.find(a => a.id === applianceId);
    if (appliance) {
      setFormData(prev => ({
        ...prev,
        linkedAssetType: 'appliance',
        linkedAssetId: appliance.id,
        linkedAssetName: appliance.model,
      }));
    }
    setAssetSearchOpen(false);
    setAssetSearch('');
  };

  const handleSelectVehicle = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (vehicle) {
      setFormData(prev => ({
        ...prev,
        linkedAssetType: 'vehicle',
        linkedAssetId: vehicle.id,
        linkedAssetName: vehicle.name,
      }));
    }
    setAssetSearchOpen(false);
    setAssetSearch('');
  };

  const handleSelectHomeFeature = (featureName: string) => {
    setFormData(prev => ({
      ...prev,
      linkedAssetType: 'home_feature',
      linkedAssetId: '',
      linkedAssetName: featureName,
    }));
    setAssetSearchOpen(false);
    setAssetSearch('');
  };

  const handleClearLinkedAsset = () => {
    setFormData(prev => ({
      ...prev,
      linkedAssetType: '',
      linkedAssetId: '',
      linkedAssetName: '',
    }));
  };

  // Get icon for linked asset type
  const getLinkedAssetIcon = () => {
    switch (formData.linkedAssetType) {
      case 'appliance':
        return <Package className="h-4 w-4 text-muted-foreground" />;
      case 'vehicle':
        return <Car className="h-4 w-4 text-muted-foreground" />;
      case 'home_feature':
        return <TreePine className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Link2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a subscription name or description.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.subscriptionType) {
      toast({
        title: 'Type required',
        description: 'Please select a subscription type.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.cost.trim()) {
      toast({
        title: 'Cost required',
        description: 'Please enter the subscription cost.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const submitData = {
        name: formData.name.trim(),
        subscriptionType: formData.subscriptionType,
        cost: formData.cost.trim(),
        currency: formData.currency,
        billingFrequency: formData.billingFrequency,
        companyId: formData.companyId || undefined,
        companyName: formData.companyName.trim() || undefined,
        linkedAssetType: formData.linkedAssetType || undefined,
        linkedAssetId: formData.linkedAssetId || undefined,
        linkedAssetName: formData.linkedAssetName || undefined,
        notes: formData.notes.trim() || undefined,
        startDate: formData.startDate?.trim() || undefined,
      };

      if (isEditing && subscription) {
        await updateSubscription(subscription.id, submitData);
        toast({
          title: 'Subscription updated',
          description: 'Your subscription has been updated successfully.',
        });
      } else {
        await createSubscription(submitData);
        toast({
          title: 'Subscription added',
          description: 'Your subscription has been added successfully.',
        });
      }
      onClose();
    } catch {
      toast({
        title: 'Error',
        description: `Failed to ${isEditing ? 'update' : 'add'} subscription. Please try again.`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Subscription' : 'Add Subscription'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Subscription Type */}
          <div className="space-y-2">
            <Label>Subscription Type *</Label>
            {showAddType ? (
              <div className="flex gap-2">
                <Input
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  placeholder="Enter custom type"
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
                  value={formData.subscriptionType}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, subscriptionType: value }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {allSubscriptionTypes.map((type) => (
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
              placeholder="e.g., Netflix Premium, Spotify Family"
            />
          </div>

          {/* Cost with Currency */}
          <div className="space-y-2">
            <Label htmlFor="cost">Cost *</Label>
            <div className="flex gap-2">
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
              >
                <SelectTrigger className="w-28 shrink-0">
                  <SelectValue>
                    {getCurrency(formData.currency)?.symbol || formData.currency}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {groupedCurrencies.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.currencies.map((currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          <span className="flex items-center gap-2">
                            <span className="font-mono w-8">{currency.symbol}</span>
                            <span className="text-xs text-muted-foreground">{currency.code}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="cost"
                value={formData.cost}
                onChange={(e) => setFormData(prev => ({ ...prev, cost: e.target.value }))}
                placeholder="e.g., 15.99"
                className="flex-1"
              />
            </div>
          </div>

          {/* Billing Frequency */}
          <div className="space-y-2">
            <Label>Billing Frequency *</Label>
            <Select
              value={formData.billingFrequency}
              onValueChange={(value) => setFormData(prev => ({ ...prev, billingFrequency: value as BillingFrequency }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {BILLING_FREQUENCIES.map((freq) => (
                  <SelectItem key={freq.value} value={freq.value}>
                    {freq.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subscription start date (initial purchase) */}
          <div className="space-y-2">
            <Label htmlFor="startDate" className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Subscription start date
            </Label>
            <DateInput
              id="startDate"
              value={formData.startDate}
              onChange={(value) => setFormData(prev => ({ ...prev, startDate: value }))}
              placeholder="MM/DD/YYYY"
            />
            <p className="text-xs text-muted-foreground">When the subscription began (initial purchase date). Optional.</p>
          </div>

          {/* Company/Service Provider */}
          <div className="space-y-2">
            <Label>Company/Service Provider</Label>
            <Popover open={companySearchOpen} onOpenChange={setCompanySearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={companySearchOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedCompanyName ? (
                    <span className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      {selectedCompanyName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select or type a company name</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput 
                    placeholder="Search companies or type a name..." 
                    value={companySearch}
                    onValueChange={setCompanySearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {companySearch ? (
                        <button
                          onClick={() => handleManualCompanyName(companySearch)}
                          className="w-full p-2 text-left hover:bg-accent rounded-sm"
                        >
                          Use "{companySearch}" as company name
                        </button>
                      ) : (
                        'No companies found'
                      )}
                    </CommandEmpty>
                    {companySearch && (
                      <CommandGroup heading="Manual Entry">
                        <CommandItem onSelect={() => handleManualCompanyName(companySearch)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Use "{companySearch}"
                        </CommandItem>
                      </CommandGroup>
                    )}
                    {filteredCompanies.length > 0 && (
                      <CommandGroup heading="Your Companies">
                        {filteredCompanies.map((company) => (
                          <CommandItem
                            key={company.id}
                            value={company.name}
                            onSelect={() => handleSelectCompany(company.id)}
                          >
                            <Building className="h-4 w-4 mr-2 text-muted-foreground" />
                            <div className="flex flex-col">
                              <span>{company.name}</span>
                              <span className="text-xs text-muted-foreground">{company.serviceType}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedCompanyName && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={handleClearCompany}
              >
                <X className="h-3 w-3 mr-1" />
                Clear company
              </Button>
            )}
          </div>

          {/* Link to Asset */}
          <div className="space-y-2">
            <Label>Link to Asset</Label>
            <Popover open={assetSearchOpen} onOpenChange={setAssetSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={assetSearchOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedAssetDisplay ? (
                    <span className="flex items-center gap-2">
                      {getLinkedAssetIcon()}
                      <span className="truncate">{selectedAssetDisplay}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Link to an appliance, vehicle, or home feature</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput 
                    placeholder="Search appliances, vehicles, or features..." 
                    value={assetSearch}
                    onValueChange={setAssetSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      No matching assets found
                    </CommandEmpty>
                    {filteredAppliances.length > 0 && (
                      <CommandGroup heading="Appliances">
                        {filteredAppliances.map((appliance) => (
                          <CommandItem
                            key={appliance.id}
                            value={`appliance-${appliance.model}`}
                            onSelect={() => handleSelectAppliance(appliance.id)}
                          >
                            <Package className="h-4 w-4 mr-2 text-muted-foreground" />
                            <div className="flex flex-col">
                              <span>{appliance.model}</span>
                              {appliance.manufacturer && (
                                <span className="text-xs text-muted-foreground">{appliance.manufacturer}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {filteredVehicles.length > 0 && (
                      <CommandGroup heading="Vehicles">
                        {filteredVehicles.map((vehicle) => (
                          <CommandItem
                            key={vehicle.id}
                            value={`vehicle-${vehicle.name}`}
                            onSelect={() => handleSelectVehicle(vehicle.id)}
                          >
                            <Car className="h-4 w-4 mr-2 text-muted-foreground" />
                            <div className="flex flex-col">
                              <span>{vehicle.name}</span>
                              {(vehicle.make || vehicle.model) && (
                                <span className="text-xs text-muted-foreground">
                                  {[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {filteredHomeFeatures.length > 0 && (
                      <CommandGroup heading="Home Features">
                        {filteredHomeFeatures.map((feature) => (
                          <CommandItem
                            key={feature}
                            value={`feature-${feature}`}
                            onSelect={() => handleSelectHomeFeature(feature)}
                          >
                            <TreePine className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>{feature}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedAssetDisplay && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={handleClearLinkedAsset}
              >
                <X className="h-3 w-3 mr-1" />
                Remove link
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Optionally link this subscription to an appliance, vehicle, or home feature for better organization.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes about this subscription..."
              rows={3}
            />
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Security Warning:</strong> Do not store login credentials, passwords, or payment information here. Use a dedicated password manager to securely store sensitive account details.
              </AlertDescription>
            </Alert>
          </div>
        </div>

        {/* Action Buttons - Bottom Left */}
        <div className="flex justify-start gap-2 pt-4 border-t">
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Discard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
