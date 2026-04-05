import { useState, useEffect } from 'react';
import { Clock, Package, Wrench, Edit, Trash2, AlertTriangle, CheckCircle, Check, Car, Gauge, TreePine, ClipboardList, Plus, X, Calendar, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MaintenanceReceiptThumb } from '@/components/MaintenanceReceiptThumb';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { DateInput } from '@/components/ui/date-input';
import { useApplianceById } from '@/hooks/useAppliances';
import { useVehicleById, useVehicleActions } from '@/hooks/useVehicles';
import { useMaintenanceActions, calculateNextDueDate, formatDueDate, isOverdue, isDueSoon } from '@/hooks/useMaintenance';
import { useMaintenanceCompletionActions, useCompletionsByMaintenance } from '@/hooks/useMaintenanceCompletions';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from '@/hooks/useToast';
import type { MaintenanceSchedule, MaintenancePart } from '@/lib/types';

interface MaintenanceDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  maintenance: MaintenanceSchedule;
  onEdit: () => void;
}

export function MaintenanceDetailDialog({ isOpen, onClose, maintenance, onEdit }: MaintenanceDetailDialogProps) {
  const { deleteMaintenance } = useMaintenanceActions();
  const { createCompletion } = useMaintenanceCompletionActions();
  const { updateVehicle } = useVehicleActions();
  const { formatForDisplay } = useCurrency();
  const appliance = useApplianceById(maintenance.applianceId);
  const vehicle = useVehicleById(maintenance.vehicleId);
  const completions = useCompletionsByMaintenance(maintenance.id);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Determine if this is vehicle maintenance
  const isVehicleMaintenance = !!maintenance.vehicleId;

  // Completion form state
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [completionDate, setCompletionDate] = useState('');
  const [completionMileage, setCompletionMileage] = useState('');
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);

  // Parts state for completion
  const [completionParts, setCompletionParts] = useState<MaintenancePart[]>([]);
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPart, setNewPart] = useState<MaintenancePart>({ name: '', partNumber: '', cost: '' });

  // Reset completion form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setShowCompletionForm(false);
      setCompletionDate('');
      setCompletionMileage('');
      setCompletionParts([]);
      setShowAddPart(false);
      setNewPart({ name: '', partNumber: '', cost: '' });
    }
  }, [isOpen]);

  const purchaseDate = isVehicleMaintenance ? (vehicle?.purchaseDate || '') : (appliance?.purchaseDate || '');

  // Get the most recent completion date (completions are already sorted newest first)
  const lastCompletionDate = completions.length > 0 ? completions[0].completedDate : undefined;

  // Check if this is log-only maintenance
  const isLogOnly = maintenance.isLogOnly;

  // Only calculate due dates for scheduled (non-log-only) maintenance
  const nextDueDate = !isLogOnly && maintenance.frequency && maintenance.frequencyUnit
    ? calculateNextDueDate(purchaseDate, maintenance.frequency, maintenance.frequencyUnit, lastCompletionDate)
    : null;
  const overdue = !isLogOnly && purchaseDate && maintenance.frequency && maintenance.frequencyUnit
    ? isOverdue(purchaseDate, maintenance.frequency, maintenance.frequencyUnit, lastCompletionDate)
    : false;
  const dueSoon = !isLogOnly && purchaseDate && maintenance.frequency && maintenance.frequencyUnit
    ? isDueSoon(purchaseDate, maintenance.frequency, maintenance.frequencyUnit, lastCompletionDate)
    : false;

  const getFrequencyLabel = () => {
    if (!maintenance.frequency || !maintenance.frequencyUnit) return '';
    const unit = maintenance.frequencyUnit;
    const freq = maintenance.frequency;
    const unitLabel = freq === 1 ? unit.slice(0, -1) : unit;
    return `Every ${freq} ${unitLabel}`;
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMaintenance(maintenance.id);
      toast({
        title: 'Maintenance deleted',
        description: 'The maintenance schedule has been removed.',
      });
      onClose();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete maintenance. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleEdit = () => {
    onClose();
    onEdit();
  };

  const handleSubmitCompletion = async () => {
    if (!completionDate.trim()) {
      toast({
        title: 'Date required',
        description: 'Please enter a completion date or select "Today".',
        variant: 'destructive',
      });
      return;
    }

    // Validate date format MM/DD/YYYY (flexible - allows M/D/YYYY as well)
    const dateRegex = /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/\d{4}$/;
    if (!dateRegex.test(completionDate)) {
      toast({
        title: 'Invalid date format',
        description: 'Please enter the date in MM/DD/YYYY format.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmittingCompletion(true);
    try {
      // Pass mileage only if it's vehicle maintenance and a value was entered
      const mileageValue = isVehicleMaintenance && completionMileage.trim() ? completionMileage.trim() : undefined;
      
      // Create the completion with parts
      await createCompletion(
        maintenance.id, 
        completionDate, 
        mileageValue,
        undefined, // notes
        completionParts.length > 0 ? completionParts : undefined
      );

      // If mileage was provided, update the vehicle's mileage
      if (mileageValue && vehicle) {
        const currentMileage = vehicle.mileage ? parseInt(vehicle.mileage, 10) : 0;
        const newMileage = parseInt(mileageValue, 10);
        
        // Only update if the new mileage is higher
        if (!isNaN(newMileage) && newMileage > currentMileage) {
          await updateVehicle(vehicle.id, {
            ...vehicle,
            mileage: newMileage.toString(),
          });
        }
      }
      
      const mileageInfo = mileageValue ? ` at ${Number(mileageValue).toLocaleString()} miles` : '';
      toast({
        title: 'Maintenance completed',
        description: `Marked as completed on ${completionDate}${mileageInfo}.`,
      });
      setShowCompletionForm(false);
      setCompletionDate('');
      setCompletionMileage('');
      setCompletionParts([]);
      setShowAddPart(false);
      setNewPart({ name: '', partNumber: '', cost: '' });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to record completion. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingCompletion(false);
    }
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

    setCompletionParts(prev => [...prev, { 
      name: newPart.name.trim(), 
      partNumber: newPart.partNumber?.trim() || undefined,
      cost: newPart.cost?.trim() || undefined,
    }]);
    setNewPart({ name: '', partNumber: '', cost: '' });
    setShowAddPart(false);
  };

  const handleRemovePart = (index: number) => {
    setCompletionParts(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {isLogOnly ? (
                <ClipboardList className="h-5 w-5 text-blue-600" />
              ) : (
                <Wrench className="h-5 w-5" />
              )}
              <span>{maintenance.description}</span>
              {isLogOnly ? (
                <Badge variant="secondary" className="ml-auto bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  <ClipboardList className="h-3 w-3 mr-1" />
                  Log Only
                </Badge>
              ) : overdue ? (
                <Badge variant="destructive" className="ml-auto">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Overdue
                </Badge>
              ) : dueSoon ? (
                <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  <Clock className="h-3 w-3 mr-1" />
                  Due Soon
                </Badge>
              ) : nextDueDate ? (
                <Badge variant="secondary" className="ml-auto bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  On Track
                </Badge>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Show Vehicle info for vehicle maintenance */}
            {isVehicleMaintenance && vehicle && (
              <div className="flex items-start gap-3">
                <Car className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Vehicle</p>
                  <p>{vehicle.name}</p>
                  <p className="text-sm text-muted-foreground">{vehicle.vehicleType}</p>
                </div>
              </div>
            )}

            {/* Show Appliance info for appliance maintenance */}
            {!isVehicleMaintenance && appliance && (
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Appliance</p>
                  <p>{appliance.model}</p>
                  {appliance.room && (
                    <p className="text-sm text-muted-foreground">{appliance.room}</p>
                  )}
                </div>
              </div>
            )}

            {/* Show Home Feature info */}
            {!isVehicleMaintenance && maintenance.homeFeature && (
              <div className="flex items-start gap-3">
                <TreePine className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Home Feature</p>
                  <p>{maintenance.homeFeature}</p>
                </div>
              </div>
            )}

            {/* Frequency - only for scheduled maintenance */}
            {!isLogOnly && maintenance.frequency && maintenance.frequencyUnit && (
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Frequency</p>
                  <p>{getFrequencyLabel()}</p>
                </div>
              </div>
            )}

            {/* Log Only indicator */}
            {isLogOnly && (
              <div className="flex items-start gap-3">
                <ClipboardList className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tracking Type</p>
                  <p className="text-blue-600 dark:text-blue-400">Log Only - No recurring schedule</p>
                </div>
              </div>
            )}

            {/* Parts - show multiple parts or legacy single part number */}
            {(maintenance.parts && maintenance.parts.length > 0) ? (
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Parts</p>
                  <div className="space-y-1 mt-1">
                    {maintenance.parts.map((part, index) => (
                      <div key={index} className="text-sm">
                        <span className="font-medium">{part.name}</span>
                        {(part.partNumber || part.cost) && (
                          <span className="text-muted-foreground ml-2">
                            {part.partNumber && `#${part.partNumber}`}
                            {part.partNumber && part.cost && ' · '}
                            {part.cost && formatForDisplay(part.cost)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : maintenance.partNumber ? (
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Part Number</p>
                  <p className="font-mono">{maintenance.partNumber}</p>
                </div>
              </div>
            ) : null}

            {purchaseDate && (
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {isVehicleMaintenance ? 'Vehicle Purchase Date' : 'Appliance Install Date'}
                  </p>
                  <p>{purchaseDate}</p>
                </div>
              </div>
            )}

            {/* Show mileage/hours interval for scheduled vehicle maintenance */}
            {isVehicleMaintenance && !isLogOnly && maintenance.mileageInterval && (
              <div className="flex items-start gap-3">
                <Gauge className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {maintenance.intervalType === 'hours' ? 'Hours' : 'Mileage'} Interval
                  </p>
                  <p>Every {maintenance.mileageInterval.toLocaleString()} {maintenance.intervalType === 'hours' ? 'hours' : 'miles'}</p>
                </div>
              </div>
            )}

            {/* Due Date section - only for scheduled maintenance */}
            {!isLogOnly && nextDueDate && (
              <div className={`flex items-start gap-3 p-3 rounded-lg ${
                overdue
                  ? 'bg-red-50 dark:bg-red-950/30'
                  : dueSoon
                    ? 'bg-amber-50 dark:bg-amber-950/30'
                    : 'bg-green-50 dark:bg-green-950/30'
              }`}>
                <Calendar className={`h-5 w-5 shrink-0 mt-0.5 ${
                  overdue
                    ? 'text-red-600 dark:text-red-400'
                    : dueSoon
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-green-600 dark:text-green-400'
                }`} />
                <div>
                  <p className={`text-sm font-medium ${
                    overdue
                      ? 'text-red-700 dark:text-red-300'
                      : dueSoon
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-green-700 dark:text-green-300'
                  }`}>
                    Next Due Date
                  </p>
                  <p className={`font-semibold ${
                    overdue
                      ? 'text-red-900 dark:text-red-100'
                      : dueSoon
                        ? 'text-amber-900 dark:text-amber-100'
                        : 'text-green-900 dark:text-green-100'
                  }`}>
                    {formatDueDate(nextDueDate)}
                  </p>
                </div>
              </div>
            )}

            {/* Last Completed section - for log-only maintenance */}
            {isLogOnly && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <Calendar className="h-5 w-5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Last Completed
                  </p>
                  <p className="font-semibold text-blue-900 dark:text-blue-100">
                    {lastCompletionDate || 'No records yet'}
                  </p>
                </div>
              </div>
            )}

            {/* Past completions: dates, parts, mileage, receipt links (same data as vehicle/appliance maintenance pages) */}
            {completions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Completion history
                </p>
                <ScrollArea className="max-h-[min(280px,45vh)] pr-3">
                  <div className="space-y-2">
                    {completions.map((completion) => (
                      <div
                        key={completion.id}
                        className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-medium text-green-900 dark:text-green-100">Completed</span>
                          <span className="text-xs font-medium text-green-800 dark:text-green-200 shrink-0">
                            {completion.completedDate}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-green-800 dark:text-green-300">
                          {isVehicleMaintenance && completion.mileageAtCompletion && (
                            <span className="flex items-center gap-1">
                              <Gauge className="h-3 w-3 shrink-0" />
                              {Number(completion.mileageAtCompletion).toLocaleString()} mi
                            </span>
                          )}
                          {completion.parts && completion.parts.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Package className="h-3 w-3 shrink-0" />
                              {completion.parts.length} part{completion.parts.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {completion.parts && completion.parts.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-green-900/90 dark:text-green-100/90">
                            {completion.parts.map((part, idx) => (
                              <li key={idx}>
                                <span className="font-medium">{part.name}</span>
                                {(part.partNumber || part.cost) && (
                                  <span className="text-muted-foreground">
                                    {part.partNumber ? ` · #${part.partNumber}` : ''}
                                    {part.cost ? ` · ${formatForDisplay(part.cost)}` : ''}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {completion.notes && (
                          <p className="text-xs text-green-700 dark:text-green-400 mt-2 whitespace-pre-wrap">
                            {completion.notes}
                          </p>
                        )}
                        <MaintenanceReceiptThumb completion={completion} compact={false} className="mt-2" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Mark as Completed Section */}
            {!showCompletionForm ? (
              <Button
                onClick={() => setShowCompletionForm(true)}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="h-4 w-4 mr-2" />
                Mark as Completed
              </Button>
            ) : (
              <div className="space-y-3 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Record Completion
                </p>

                <DateInput
                  id="completionDate"
                  label="Completion Date"
                  value={completionDate}
                  onChange={setCompletionDate}
                  showTodayCheckbox
                  disabled={isSubmittingCompletion}
                />

                {/* Mileage input for vehicle maintenance */}
                {isVehicleMaintenance && (
                  <div className="space-y-2">
                    <Label htmlFor="completionMileage" className="text-sm flex items-center gap-2">
                      <Gauge className="h-4 w-4" />
                      Current Mileage (optional)
                    </Label>
                    <Input
                      id="completionMileage"
                      type="number"
                      min="0"
                      value={completionMileage}
                      onChange={(e) => setCompletionMileage(e.target.value)}
                      placeholder="e.g., 45000"
                      disabled={isSubmittingCompletion}
                    />
                    {vehicle?.mileage && (
                      <p className="text-xs text-muted-foreground">
                        Current vehicle mileage: {Number(vehicle.mileage).toLocaleString()} mi
                      </p>
                    )}
                  </div>
                )}

                {/* Parts Section */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Parts Used
                  </Label>
                  
                  {/* List of added parts */}
                  {completionParts.length > 0 && (
                    <div className="space-y-1">
                      {completionParts.map((part, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{part.name}</p>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              {part.partNumber && <span>#{part.partNumber}</span>}
                              {part.cost && <span>{formatForDisplay(part.cost)}</span>}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => handleRemovePart(index)}
                            disabled={isSubmittingCompletion}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Part Form */}
                  {showAddPart ? (
                    <div className="space-y-2 p-2 border rounded bg-white dark:bg-slate-800">
                      <Input
                        value={newPart.name}
                        onChange={(e) => setNewPart(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Part name *"
                        disabled={isSubmittingCompletion}
                        autoFocus
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={newPart.partNumber || ''}
                          onChange={(e) => setNewPart(prev => ({ ...prev, partNumber: e.target.value }))}
                          placeholder="Part # (optional)"
                          disabled={isSubmittingCompletion}
                        />
                        <Input
                          value={newPart.cost || ''}
                          onChange={(e) => setNewPart(prev => ({ ...prev, cost: e.target.value }))}
                          placeholder="Cost (optional)"
                          disabled={isSubmittingCompletion}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleAddPart} size="sm" disabled={isSubmittingCompletion}>
                          Add
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowAddPart(false);
                            setNewPart({ name: '', partNumber: '', cost: '' });
                          }}
                          disabled={isSubmittingCompletion}
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
                      disabled={isSubmittingCompletion}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Part
                    </Button>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmitCompletion}
                    disabled={isSubmittingCompletion || !completionDate}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {isSubmittingCompletion ? 'Saving...' : 'Confirm'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCompletionForm(false);
                      setCompletionDate('');
                      setCompletionMileage('');
                      setCompletionParts([]);
                      setShowAddPart(false);
                      setNewPart({ name: '', partNumber: '', cost: '' });
                    }}
                    disabled={isSubmittingCompletion}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Maintenance Schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this maintenance schedule. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
