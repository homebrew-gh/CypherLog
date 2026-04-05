import { useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  FolderKanban, 
  ArrowLeft, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Pause, 
  PlayCircle, 
  Plus, 
  Trash2,
  Edit,
  DollarSign,
  Target,
  Building2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  X,
  Upload,
  StickyNote,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { BlossomImage } from '@/components/BlossomMedia';
import { TaskList, MaterialsList, BudgetTracker, ResearchPlanningCard } from '@/components/project';
import { useProjectById, useProjects, useProjectActions } from '@/hooks/useProjects';
import { useProjectEntries, useProjectEntryActions } from '@/hooks/useProjectEntries';
import { useCompanies, useCompanyById } from '@/hooks/useCompanies';
import { useUploadFile, useCanUploadFiles, NoPrivateServerError } from '@/hooks/useUploadFile';
import { toast } from '@/hooks/useToast';
import NotFound from './NotFound';
import type { Project, ProjectEntry } from '@/lib/types';
import { logger } from '@/lib/logger';

// Get icon based on project status
function getStatusIcon(status?: Project['status']) {
  switch (status) {
    case 'completed':
      return CheckCircle2;
    case 'on_hold':
      return Pause;
    case 'in_progress':
      return PlayCircle;
    case 'planning':
    default:
      return Clock;
  }
}

// Get status display text
function getStatusText(status?: Project['status']) {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'on_hold':
      return 'On Hold';
    case 'in_progress':
      return 'In Progress';
    case 'planning':
    default:
      return 'Planning';
  }
}

// Get status badge variant
function getStatusVariant(status?: Project['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'on_hold':
      return 'destructive';
    case 'in_progress':
      return 'secondary';
    case 'planning':
    default:
      return 'outline';
  }
}

// Format date for display
function formatDate(dateStr: string): string {
  try {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// Progress Entry Component
function ProgressEntry({ 
  entry, 
  onDelete 
}: { 
  entry: ProjectEntry; 
  onDelete: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const hasPhotos = entry.photoUrls && entry.photoUrls.length > 0;

  return (
    <>
      <Card className="border-l-4 border-l-primary/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(entry.entryDate)}</span>
              </div>
              {entry.title && (
                <CardTitle className="text-lg">{entry.title}</CardTitle>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasPhotos && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="h-8 w-8 p-0"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-foreground whitespace-pre-wrap">{entry.content}</p>
          
          {hasPhotos && isExpanded && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {entry.photoUrls!.map((url, index) => (
                <div 
                  key={index} 
                  className="relative aspect-square rounded-lg overflow-hidden border bg-muted"
                >
                  <BlossomImage
                    src={url}
                    alt={`Progress photo ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this progress entry. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// New Entry Dialog
function NewEntryDialog({
  isOpen,
  onClose,
  projectId,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const { createEntry } = useProjectEntryActions();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const canUploadFiles = useCanUploadFiles();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    entryDate: '',
    title: '',
    content: '',
    photoUrls: [] as string[],
  });

  // Reset form when dialog opens
  const resetForm = () => {
    const today = new Date();
    const formattedDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
    setFormData({
      entryDate: formattedDate,
      title: '',
      content: '',
      photoUrls: [],
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      try {
        const tags = await uploadFile(file);
        const url = tags[0]?.[1];
        if (url) {
          setFormData(prev => ({
            ...prev,
            photoUrls: [...prev.photoUrls, url],
          }));
        }
      } catch (error) {
        logger.error('File upload error:', error);
        if (error instanceof NoPrivateServerError) {
          toast({
            title: 'No media server configured',
            description: 'Please configure a media server in Settings to upload photos.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Upload failed',
            description: error instanceof Error ? error.message : 'Failed to upload photo',
            variant: 'destructive',
          });
        }
      }
    }
    e.target.value = '';
  };

  const handleRemovePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      photoUrls: prev.photoUrls.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.content.trim()) {
      toast({
        title: 'Error',
        description: 'Please add some notes for this entry',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await createEntry(projectId, {
        entryDate: formData.entryDate,
        title: formData.title.trim() || undefined,
        content: formData.content.trim(),
        photoUrls: formData.photoUrls.length > 0 ? formData.photoUrls : undefined,
      });

      toast({
        title: 'Entry Added',
        description: 'Progress entry has been saved.',
      });

      resetForm();
      onClose();
    } catch (error) {
      logger.error('Error creating entry:', error);
      toast({
        title: 'Error',
        description: 'Failed to save entry',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        } else {
          resetForm();
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Add Progress Entry
          </DialogTitle>
          <DialogDescription>
            Document your project progress with notes and photos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="entryDate">Date</Label>
            <DateInput
              id="entryDate"
              value={formData.entryDate}
              onChange={(value) => setFormData(prev => ({ ...prev, entryDate: value }))}
              placeholder="MM/DD/YYYY"
            />
          </div>

          {/* Title (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="title">Title (Optional)</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Foundation Complete"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="content">
              Notes <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Describe the progress, challenges, next steps..."
              rows={5}
            />
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <Label>Photos</Label>
            
            {formData.photoUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {formData.photoUrls.map((url, index) => (
                  <div 
                    key={index} 
                    className="relative aspect-square rounded-lg overflow-hidden border bg-muted group"
                  >
                    <BlossomImage
                      src={url}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              className="hidden"
            />
            
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !canUploadFiles}
              className="w-full"
            >
              {isUploading ? (
                <>Uploading...</>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Add Photos
                </>
              )}
            </Button>
            
            {!canUploadFiles && (
              <p className="text-xs text-muted-foreground">
                Configure a media server in Settings to upload photos.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isUploading}
            >
              {isSubmitting ? 'Saving...' : 'Save Entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Edit Project Dialog
function EditProjectDialog({
  isOpen,
  onClose,
  project,
}: {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
}) {
  const { updateProject, archiveProject, deleteProject } = useProjectActions();
  const { data: companies = [] } = useCompanies();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    name: project.name,
    description: project.description || '',
    startDate: project.startDate,
    targetCompletionDate: project.targetCompletionDate || '',
    status: project.status || 'planning',
    budget: project.budget || '',
    notes: project.notes || '',
    companyIds: project.companyIds || [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a project name',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await updateProject(project.id, {
        ...formData,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        targetCompletionDate: formData.targetCompletionDate || undefined,
        budget: formData.budget.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        companyIds: formData.companyIds.length > 0 ? formData.companyIds : undefined,
        completionDate: project.completionDate,
        isArchived: project.isArchived,
      });

      toast({
        title: 'Project Updated',
        description: 'Your changes have been saved.',
      });

      onClose();
    } catch (error) {
      logger.error('Error updating project:', error);
      toast({
        title: 'Error',
        description: 'Failed to update project',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async () => {
    try {
      await archiveProject(project.id, !project.isArchived);
      toast({
        title: project.isArchived ? 'Project Restored' : 'Project Archived',
        description: project.isArchived 
          ? 'Project has been restored from archive.'
          : 'Project has been moved to archive.',
      });
      onClose();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to archive project',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject(project.id);
      toast({
        title: 'Project Deleted',
        description: 'Project has been permanently deleted.',
      });
      // Navigate back since project no longer exists
      window.location.href = '/?tab=projects';
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete project',
        variant: 'destructive',
      });
    }
  };

  const handleCompanyToggle = (companyId: string) => {
    setFormData(prev => ({
      ...prev,
      companyIds: prev.companyIds.includes(companyId)
        ? prev.companyIds.filter(id => id !== companyId)
        : [...prev.companyIds, companyId],
    }));
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-primary" />
              Edit Project
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Kitchen Renovation"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the project..."
                rows={2}
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData(prev => {
                  const nextStatus: Project['status'] =
                    value && ['planning', 'in_progress', 'on_hold', 'completed'].includes(value)
                      ? (value as Project['status'])
                      : (prev.status ?? 'planning');
                  return { ...prev, status: nextStatus } as typeof prev;
                })}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <DateInput
                  id="startDate"
                  value={formData.startDate}
                  onChange={(value) => setFormData(prev => ({ ...prev, startDate: value }))}
                  placeholder="MM/DD/YYYY"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="targetCompletionDate">Target Completion</Label>
                <DateInput
                  id="targetCompletionDate"
                  value={formData.targetCompletionDate}
                  onChange={(value) => setFormData(prev => ({ ...prev, targetCompletionDate: value }))}
                  placeholder="MM/DD/YYYY"
                />
              </div>
            </div>

            {/* Budget */}
            <div className="space-y-2">
              <Label htmlFor="budget">Budget</Label>
              <Input
                id="budget"
                value={formData.budget}
                onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                placeholder="e.g., $5,000"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>

            {/* Linked Companies */}
            {companies.length > 0 && (
              <div className="space-y-2">
                <Label>Linked Companies/Services</Label>
                <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30 max-h-32 overflow-y-auto">
                  {companies.map((company) => (
                    <Badge
                      key={company.id}
                      variant={formData.companyIds.includes(company.id) ? 'default' : 'outline'}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => handleCompanyToggle(company.id)}
                    >
                      {company.name}
                      {formData.companyIds.includes(company.id) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Click to toggle companies associated with this project
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleArchive}
                >
                  {project.isArchived ? 'Restore' : 'Archive'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Project?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and all its progress entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Company Link Card
function LinkedCompanyCard({ companyId }: { companyId: string }) {
  const company = useCompanyById(companyId);
  
  if (!company) {
    return null;
  }

  return (
    <Link 
      to={`/asset/company/${company.id}`}
      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
    >
      <div className="p-2 rounded-lg bg-primary/10">
        <Building2 className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{company.name}</p>
        {company.serviceType && (
          <p className="text-sm text-muted-foreground truncate">{company.serviceType}</p>
        )}
      </div>
    </Link>
  );
}

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProjectById(projectId);
  const { isLoading } = useProjects();
  const { data: entries = [], isLoading: isEntriesLoading } = useProjectEntries(projectId);
  const { deleteEntry } = useProjectEntryActions();

  const [showNewEntryDialog, setShowNewEntryDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await deleteEntry(entryId);
      toast({
        title: 'Entry Deleted',
        description: 'Progress entry has been removed.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete entry',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-theme-gradient tool-pattern-bg">
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!project) {
    return <NotFound />;
  }

  const StatusIcon = getStatusIcon(project.status);
  const hasLinkedCompanies = project.companyIds && project.companyIds.length > 0;

  return (
    <div className="min-h-screen bg-theme-gradient tool-pattern-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" asChild>
              <Link to="/?tab=projects">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-lg sm:text-xl font-bold truncate min-w-0 flex-1">
                  {project.name}
                </h1>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setShowEditDialog(true)}
                >
                  <Edit className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0">
                  <FolderKanban className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <Badge variant={getStatusVariant(project.status)} className="shrink-0">
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {getStatusText(project.status)}
                </Badge>
                {project.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 sm:line-clamp-1 w-full sm:w-auto sm:flex-1 sm:min-w-0">
                    {project.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Project Overview */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Start Date */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Started</p>
                  <p className="font-semibold">{formatDate(project.startDate)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Target Date */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Target Completion</p>
                  <p className="font-semibold">
                    {project.targetCompletionDate 
                      ? formatDate(project.targetCompletionDate) 
                      : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Budget */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Budget</p>
                  <p className="font-semibold">
                    {project.budget || 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Notes */}
        {project.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-primary" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground whitespace-pre-wrap">{project.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Linked Companies */}
        {hasLinkedCompanies && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Companies & Services
              </CardTitle>
              <CardDescription>
                {project.companyIds!.length} {project.companyIds!.length === 1 ? 'company' : 'companies'} linked to this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {project.companyIds!.map((companyId) => (
                  <LinkedCompanyCard key={companyId} companyId={companyId} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Budget Tracker */}
        <BudgetTracker projectId={projectId!} originalBudget={project.budget} />

        {/* Tasks and Materials - Side by Side on larger screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* To-Do List */}
          <TaskList projectId={projectId!} />

          {/* Materials & Expenses */}
          <MaterialsList projectId={projectId!} />
        </div>

        {/* Research & Planning */}
        <ResearchPlanningCard projectId={projectId!} />

        {/* Progress Diary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Progress Diary
                </CardTitle>
                <CardDescription>
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                </CardDescription>
              </div>
              <Button onClick={() => setShowNewEntryDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isEntriesLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  No progress entries yet. Start documenting your project journey!
                </p>
                <Button 
                  variant="outline"
                  onClick={() => setShowNewEntryDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Entry
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {entries.map((entry) => (
                  <ProgressEntry
                    key={entry.id}
                    entry={entry}
                    onDelete={() => handleDeleteEntry(entry.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Dialogs */}
      <NewEntryDialog
        isOpen={showNewEntryDialog}
        onClose={() => setShowNewEntryDialog(false)}
        projectId={projectId!}
      />

      {project && (
        <EditProjectDialog
          isOpen={showEditDialog}
          onClose={() => setShowEditDialog(false)}
          project={project}
        />
      )}
    </div>
  );
}
