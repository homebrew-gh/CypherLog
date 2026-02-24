import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Building, Calendar, DollarSign, Tag, FileText, Trash2, Pencil, ExternalLink, Package, Car, TreePine, ChevronRight, PlayCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSubscriptionActions } from '@/hooks/useSubscriptions';
import { useCompanyById } from '@/hooks/useCompanies';
import { useApplianceById } from '@/hooks/useAppliances';
import { useVehicleById } from '@/hooks/useVehicles';
import { useSubscriptionCurrency } from '@/hooks/useCurrency';
import { toast } from '@/hooks/useToast';
import { BILLING_FREQUENCIES, type Subscription } from '@/lib/types';

interface SubscriptionDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: Subscription;
  onEdit: () => void;
  onDelete: () => void;
}

export function SubscriptionDetailDialog({ 
  isOpen, 
  onClose, 
  subscription, 
  onEdit,
  onDelete,
}: SubscriptionDetailDialogProps) {
  const { deleteSubscription } = useSubscriptionActions();
  const linkedCompany = useCompanyById(subscription.companyId);
  const linkedAppliance = useApplianceById(subscription.linkedAssetType === 'appliance' ? subscription.linkedAssetId : undefined);
  const linkedVehicle = useVehicleById(subscription.linkedAssetType === 'vehicle' ? subscription.linkedAssetId : undefined);
  const { formatSubscriptionCost } = useSubscriptionCurrency();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Format the cost with proper currency symbol
  const formattedCost = formatSubscriptionCost(subscription.cost, subscription.currency);

  // Get linked asset details
  const getLinkedAssetInfo = () => {
    if (!subscription.linkedAssetType) return null;

    if (subscription.linkedAssetType === 'appliance' && linkedAppliance) {
      return {
        type: 'Appliance',
        name: linkedAppliance.model,
        subtitle: linkedAppliance.manufacturer,
        icon: Package,
        link: `/asset/appliance/${linkedAppliance.id}`,
      };
    }

    if (subscription.linkedAssetType === 'vehicle' && linkedVehicle) {
      return {
        type: 'Vehicle',
        name: linkedVehicle.name,
        subtitle: [linkedVehicle.make, linkedVehicle.model].filter(Boolean).join(' '),
        icon: Car,
        link: `/asset/vehicle/${linkedVehicle.id}`,
      };
    }

    if (subscription.linkedAssetType === 'home_feature' && subscription.linkedAssetName) {
      return {
        type: 'Home Feature',
        name: subscription.linkedAssetName,
        subtitle: undefined,
        icon: TreePine,
        link: `/asset/home-feature/${encodeURIComponent(subscription.linkedAssetName)}`,
      };
    }

    return null;
  };

  const linkedAssetInfo = getLinkedAssetInfo();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteSubscription(subscription.id);
      toast({
        title: 'Subscription deleted',
        description: 'Your subscription has been deleted successfully.',
      });
      setShowDeleteConfirm(false);
      onDelete();
      onClose();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete subscription. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Get billing frequency label
  const billingLabel = BILLING_FREQUENCIES.find(f => f.value === subscription.billingFrequency)?.label || subscription.billingFrequency;

  // Get company display name
  const companyDisplayName = linkedCompany?.name || subscription.companyName;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-left">{subscription.name}</DialogTitle>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {subscription.subscriptionType}
                  </Badge>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Cost and Billing */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  Cost
                </div>
                <p className="font-semibold text-lg text-primary">{formattedCost}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Billing
                </div>
                <p className="font-medium">{billingLabel}</p>
              </div>
              {subscription.startDate && (
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <PlayCircle className="h-4 w-4" />
                    Started
                  </div>
                  <p className="font-medium">{subscription.startDate}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Company/Provider */}
            {companyDisplayName && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building className="h-4 w-4" />
                    Company/Provider
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{companyDisplayName}</p>
                    {linkedCompany && (
                      <Badge variant="outline" className="text-xs">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Linked
                      </Badge>
                    )}
                  </div>
                  {linkedCompany?.serviceType && (
                    <p className="text-sm text-muted-foreground">{linkedCompany.serviceType}</p>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Subscription Type */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Tag className="h-4 w-4" />
                Type
              </div>
              <p className="font-medium">{subscription.subscriptionType}</p>
            </div>

            {/* Linked Asset */}
            {linkedAssetInfo && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <linkedAssetInfo.icon className="h-4 w-4" />
                    Linked {linkedAssetInfo.type}
                  </div>
                  <Link
                    to={linkedAssetInfo.link}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <linkedAssetInfo.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium group-hover:text-primary transition-colors">
                          {linkedAssetInfo.name}
                        </p>
                        {linkedAssetInfo.subtitle && (
                          <p className="text-sm text-muted-foreground">{linkedAssetInfo.subtitle}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </Link>
                </div>
              </>
            )}

            {/* Notes */}
            {subscription.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    Notes
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{subscription.notes}</p>
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{subscription.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
