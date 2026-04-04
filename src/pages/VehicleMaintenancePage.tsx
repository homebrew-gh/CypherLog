import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import {
  ArrowLeft,
  Car,
  Plane,
  Ship,
  Tractor,
  Wrench,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  Plus,
  Package,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useVehicleById } from '@/hooks/useVehicles';
import { useMaintenanceByVehicle, calculateNextDueDate, formatDueDate, isOverdue, isDueSoon } from '@/hooks/useMaintenance';
import { useMaintenanceCompletions } from '@/hooks/useMaintenanceCompletions';
import { MaintenanceDialog } from '@/components/MaintenanceDialog';
import { MaintenanceDetailDialog } from '@/components/MaintenanceDetailDialog';
import { LogMaintenanceDialog } from '@/components/LogMaintenanceDialog';
import { MaintenanceReceiptThumb } from '@/components/MaintenanceReceiptThumb';
import type { MaintenanceSchedule } from '@/lib/types';
import NotFound from './NotFound';

// Get icon based on vehicle type
function getVehicleIcon(type: string) {
  switch (type) {
    case 'Plane':
      return Plane;
    case 'Boat':
      return Ship;
    case 'Farm Machinery':
      return Tractor;
    default:
      return Car;
  }
}

export function VehicleMaintenancePage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  
  const vehicle = useVehicleById(vehicleId);
  const maintenance = useMaintenanceByVehicle(vehicleId);
  const { data: allCompletions = [] } = useMaintenanceCompletions();
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceSchedule | undefined>();
  const [viewingMaintenance, setViewingMaintenance] = useState<MaintenanceSchedule | undefined>();
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'scheduled' | 'log-only'>('scheduled');

  // SEO
  useSeoMeta({
    title: vehicle ? `${vehicle.name} - Maintenance History | Cypher Log` : 'Vehicle Maintenance | Cypher Log',
    description: vehicle ? `View and manage maintenance history for ${vehicle.name}` : 'View vehicle maintenance history',
  });

  // Separate scheduled and log-only maintenance
  const { scheduledMaintenance, logOnlyMaintenance, allMaintenanceWithDates } = useMemo(() => {
    const scheduled = maintenance.filter(m => !m.isLogOnly && !m.isArchived);
    const logOnly = maintenance.filter(m => m.isLogOnly && !m.isArchived);
    
    // Calculate due dates for scheduled maintenance
    const withDates = scheduled.map(m => {
      const mCompletions = allCompletions.filter(c => c.maintenanceId === m.id);
      const lastCompletion = mCompletions[0];
      const purchaseDate = vehicle?.purchaseDate || '';
      const nextDue = calculateNextDueDate(purchaseDate, m.frequency, m.frequencyUnit, lastCompletion?.completedDate);
      const overdue = isOverdue(purchaseDate, m.frequency, m.frequencyUnit, lastCompletion?.completedDate);
      const dueSoon = isDueSoon(purchaseDate, m.frequency, m.frequencyUnit, lastCompletion?.completedDate);
      
      return {
        maintenance: m,
        completions: mCompletions,
        nextDue,
        overdue,
        dueSoon,
        lastCompletion,
      };
    }).sort((a, b) => {
      // Sort by due date (earliest first), overdue first
      if (a.overdue && !b.overdue) return -1;
      if (!a.overdue && b.overdue) return 1;
      if (!a.nextDue && !b.nextDue) return 0;
      if (!a.nextDue) return 1;
      if (!b.nextDue) return -1;
      return a.nextDue.getTime() - b.nextDue.getTime();
    });
    
    return {
      scheduledMaintenance: scheduled,
      logOnlyMaintenance: logOnly,
      allMaintenanceWithDates: withDates,
    };
  }, [maintenance, allCompletions, vehicle?.purchaseDate]);

  // Get all completions for this vehicle's maintenance
  const vehicleCompletions = useMemo(() => {
    const maintenanceIds = new Set(maintenance.map(m => m.id));
    return allCompletions
      .filter(c => maintenanceIds.has(c.maintenanceId))
      .sort((a, b) => {
        // Parse MM/DD/YYYY dates for comparison
        const parseDate = (dateStr: string) => {
          const parts = dateStr.split('/');
          if (parts.length !== 3) return 0;
          return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])).getTime();
        };
        return parseDate(b.completedDate) - parseDate(a.completedDate);
      });
  }, [maintenance, allCompletions]);

  const handleEditMaintenance = (maint: MaintenanceSchedule) => {
    setEditingMaintenance(maint);
    setDialogOpen(true);
  };

  const handleAddMaintenance = () => {
    setEditingMaintenance(undefined);
    setDialogOpen(true);
  };

  // Loading state
  if (!user) {
    return (
      <div className="min-h-screen bg-theme-gradient">
        <div className="container mx-auto px-4 py-8">
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Please log in to view vehicle maintenance.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!vehicleId || !vehicle) {
    return <NotFound />;
  }

  const VehicleIcon = getVehicleIcon(vehicle.vehicleType);

  return (
    <div className="min-h-screen bg-theme-gradient">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <VehicleIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{vehicle.name}</h1>
                <p className="text-sm text-muted-foreground">Maintenance History</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogDialogOpen(true)}
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Log Task</span>
            </Button>
            <Button
              size="sm"
              onClick={handleAddMaintenance}
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Recurring</span>
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Maintenance Schedules */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-primary" />
                  Maintenance Schedules
                </CardTitle>
                <CardDescription>
                  Recurring maintenance tasks for this vehicle
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scheduled' | 'log-only')}>
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="scheduled" className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Scheduled
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {scheduledMaintenance.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="log-only" className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      Log Only
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {logOnlyMaintenance.length}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="scheduled" className="mt-0">
                    {allMaintenanceWithDates.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Wrench className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No scheduled maintenance tasks yet.</p>
                        <Button variant="link" onClick={handleAddMaintenance} className="mt-2">
                          Add your first maintenance schedule
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {allMaintenanceWithDates.map(({ maintenance: m, completions: _completions, nextDue, overdue, dueSoon, lastCompletion }) => (
                          <button
                            key={m.id}
                            onClick={() => setViewingMaintenance(m)}
                            className={`w-full p-4 rounded-lg border text-left transition-colors ${
                              overdue
                                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-950/50'
                                : dueSoon
                                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-950/50'
                                  : 'bg-card border-border hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold truncate">{m.description}</h4>
                                  {overdue && (
                                    <Badge variant="destructive" className="shrink-0">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      Overdue
                                    </Badge>
                                  )}
                                  {dueSoon && !overdue && (
                                    <Badge className="bg-amber-100 text-amber-700 shrink-0">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Due Soon
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5" />
                                    Every {m.frequency} {m.frequencyUnit}
                                  </span>
                                  {m.mileageInterval && (
                                    <span className="flex items-center gap-1">
                                      <Gauge className="h-3.5 w-3.5" />
                                      Every {m.mileageInterval.toLocaleString()} {m.intervalType === 'hours' ? 'hrs' : 'mi'}
                                    </span>
                                  )}
                                </div>
                                {lastCompletion && (
                                  <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Last: {lastCompletion.completedDate}
                                    {lastCompletion.mileageAtCompletion && ` at ${Number(lastCompletion.mileageAtCompletion).toLocaleString()} mi`}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-medium ${
                                  overdue ? 'text-red-600' : dueSoon ? 'text-amber-600' : 'text-muted-foreground'
                                }`}>
                                  {overdue ? 'Overdue' : dueSoon ? 'Due Soon' : 'Next Due'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {formatDueDate(nextDue)}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="log-only" className="mt-0">
                    {logOnlyMaintenance.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No log-only tasks yet.</p>
                        <p className="text-sm mt-1">Use "Log Task" to record one-time maintenance.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {logOnlyMaintenance.map(m => {
                          const mCompletions = allCompletions.filter(c => c.maintenanceId === m.id);
                          const lastCompletion = mCompletions[0];
                          
                          return (
                            <button
                              key={m.id}
                              onClick={() => setViewingMaintenance(m)}
                              className="w-full p-4 rounded-lg border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-950/50 text-left transition-colors"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold truncate">{m.description}</h4>
                                  {lastCompletion && (
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Last: {lastCompletion.completedDate}
                                      {lastCompletion.mileageAtCompletion && ` at ${Number(lastCompletion.mileageAtCompletion).toLocaleString()} mi`}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                                    Log Only
                                  </Badge>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {mCompletions.length} record{mCompletions.length !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Completion History */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Completion History
                </CardTitle>
                <CardDescription>
                  All completed maintenance for this vehicle
                </CardDescription>
              </CardHeader>
              <CardContent>
                {vehicleCompletions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>No completed maintenance yet.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {vehicleCompletions.map(completion => {
                        const maint = maintenance.find(m => m.id === completion.maintenanceId);
                        
                        return (
                          <div
                            key={completion.id}
                            className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-medium text-sm text-green-800 dark:text-green-200 truncate">
                                {maint?.description || 'Unknown Task'}
                              </h4>
                              <Badge variant="outline" className="shrink-0 text-xs border-green-300 text-green-700">
                                {completion.completedDate}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-green-700 dark:text-green-300">
                              {completion.mileageAtCompletion && (
                                <span className="flex items-center gap-1">
                                  <Gauge className="h-3 w-3" />
                                  {Number(completion.mileageAtCompletion).toLocaleString()} mi
                                </span>
                              )}
                              {completion.parts && completion.parts.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Package className="h-3 w-3" />
                                  {completion.parts.length} part{completion.parts.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            {completion.notes && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1 line-clamp-2">
                                {completion.notes}
                              </p>
                            )}
                            <MaintenanceReceiptThumb completion={completion} compact={false} />
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Tasks</span>
                    <span className="font-semibold">{maintenance.length}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Completions</span>
                    <span className="font-semibold text-green-600">{vehicleCompletions.length}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Overdue</span>
                    <span className="font-semibold text-red-600">
                      {allMaintenanceWithDates.filter(m => m.overdue).length}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Due Soon</span>
                    <span className="font-semibold text-amber-600">
                      {allMaintenanceWithDates.filter(m => m.dueSoon && !m.overdue).length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <MaintenanceDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingMaintenance(undefined);
        }}
        maintenance={editingMaintenance}
        mode="vehicle"
        preselectedVehicleId={vehicleId}
      />

      {viewingMaintenance && (
        <MaintenanceDetailDialog
          isOpen={!!viewingMaintenance}
          onClose={() => setViewingMaintenance(undefined)}
          maintenance={viewingMaintenance}
          onEdit={() => handleEditMaintenance(viewingMaintenance)}
        />
      )}

      <LogMaintenanceDialog
        isOpen={logDialogOpen}
        onClose={() => setLogDialogOpen(false)}
        preselectedVehicleId={vehicleId}
      />
    </div>
  );
}

export default VehicleMaintenancePage;
