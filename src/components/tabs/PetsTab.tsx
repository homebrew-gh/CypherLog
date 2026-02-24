import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, ChevronRight, List, LayoutGrid, Calendar, Archive, ArchiveRestore, ArrowLeft, PawPrint, Dog, Cat, Bird, Fish, Rabbit, Tractor, MoreVertical, Edit, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PetDialog } from '@/components/PetDialog';
import { PetDetailDialog } from '@/components/PetDetailDialog';
import { BlossomImage } from '@/components/BlossomMedia';
import { usePets, usePetActions } from '@/hooks/usePets';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { toast } from '@/hooks/useToast';
import type { Pet } from '@/lib/types';

// Get icon based on pet type
function getPetIcon(type: string) {
  switch (type) {
    case 'Dog':
      return Dog;
    case 'Cat':
      return Cat;
    case 'Bird':
      return Bird;
    case 'Fish':
      return Fish;
    case 'Small Mammal':
      return Rabbit;
    case 'Horse':
    case 'Livestock':
      return Tractor; // Using Tractor as a farm animal icon substitute
    default:
      return PawPrint;
  }
}

interface PetsTabProps {
  scrollTarget?: string;
}

export function PetsTab({ scrollTarget }: PetsTabProps) {
  const navigate = useNavigate();
  const { data: pets = [], isLoading } = usePets();
  const { archivePet, deletePet } = usePetActions();
  const { preferences, setPetsViewMode } = useUserPreferences();
  const viewMode = preferences.petsViewMode;

  // View mode: 'active' or 'archived'
  const [showArchived, setShowArchived] = useState(false);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPet, setEditingPet] = useState<Pet | undefined>();
  const [viewingPet, setViewingPet] = useState<Pet | undefined>(); // For archived pets only
  const [petToDelete, setPetToDelete] = useState<Pet | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Collapsed types state (for list view)
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());

  // Filter pets based on archive state
  const activePets = useMemo(() => pets.filter(p => !p.isArchived), [pets]);
  const archivedPets = useMemo(() => pets.filter(p => p.isArchived), [pets]);
  const displayedPets = showArchived ? archivedPets : activePets;

  // Refs for pet type sections
  const typeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Handle scroll to target when scrollTarget changes
  useEffect(() => {
    if (scrollTarget && scrollTarget.startsWith('type-') && !isLoading) {
      const typeName = scrollTarget.replace('type-', '');
      // Small delay to ensure the DOM has rendered
      const timer = setTimeout(() => {
        const element = typeRefs.current[typeName];
        if (element) {
          // Expand the type if it's collapsed (for list view)
          setCollapsedTypes(prev => {
            const newSet = new Set(prev);
            newSet.delete(typeName);
            return newSet;
          });
          
          // Check if element needs scrolling
          const rect = element.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const headerOffset = 120; // Sticky header height
          const halfwayPoint = viewportHeight / 2;
          
          // Only scroll if needed
          const needsScroll = rect.top < headerOffset || 
                             rect.top > viewportHeight || 
                             rect.top > halfwayPoint;
          
          if (needsScroll) {
            const targetY = window.scrollY + rect.top - headerOffset;
            window.scrollTo({ top: targetY, behavior: 'smooth' });
          }
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [scrollTarget, isLoading]);

  // Group pets by type
  const petsByType = useMemo(() => {
    const grouped: Record<string, Pet[]> = {};

    for (const pet of displayedPets) {
      const type = pet.petType || 'Uncategorized';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(pet);
    }

    // Sort types alphabetically, but put "Uncategorized" at the end
    const sortedTypes = Object.keys(grouped).sort((a, b) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });

    return { grouped, sortedTypes };
  }, [displayedPets]);

  const toggleType = (type: string) => {
    setCollapsedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  const handleEditPet = (pet: Pet) => {
    setEditingPet(pet);
    setDialogOpen(true);
  };

  const handleArchivePet = async (pet: Pet) => {
    try {
      await archivePet(pet.id, !pet.isArchived);
      toast({
        title: pet.isArchived ? 'Pet restored' : 'Pet archived',
        description: pet.isArchived ? 'The pet has been restored from archive.' : 'The pet has been archived.',
      });
      if (pet.isArchived) setViewingPet(undefined);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update pet. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeletePet = async () => {
    if (!petToDelete) return;
    setIsDeleting(true);
    try {
      await deletePet(petToDelete.id);
      toast({ title: 'Pet removed', description: 'The pet has been removed.' });
      setPetToDelete(null);
      setViewingPet(undefined);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete pet. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePetClick = (pet: Pet) => {
    if (showArchived) {
      // For archived pets, show the detail dialog (allows restore/delete)
      setViewingPet(pet);
    } else {
      // For active pets, navigate to the detail page
      navigate(`/pet/${pet.id}`);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          {showArchived ? (
            <>
              <Archive className="h-6 w-6 text-muted-foreground" />
              Archived Pets
            </>
          ) : (
            <>
              <PawPrint className="h-6 w-6 text-primary" />
              Pets & Animals
            </>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {/* Archive Toggle */}
          {showArchived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchived(false)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pets
            </Button>
          ) : (
            <>
              {archivedPets.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowArchived(true)}
                  className="text-muted-foreground"
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archived ({archivedPets.length})
                </Button>
              )}
              {/* View Toggle */}
              {activePets.length > 0 && (
                <ToggleGroup 
                  type="single" 
                  value={viewMode} 
                  onValueChange={(value) => value && setPetsViewMode(value as 'list' | 'card')}
                  className="bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5"
                >
                  <ToggleGroupItem 
                    value="list" 
                    aria-label="List view"
                    className="data-[state=on]:bg-white dark:data-[state=on]:bg-slate-700 data-[state=on]:shadow-sm rounded-md px-2.5 py-1.5"
                  >
                    <List className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem 
                    value="card" 
                    aria-label="Card view"
                    className="data-[state=on]:bg-white dark:data-[state=on]:bg-slate-700 data-[state=on]:shadow-sm rounded-md px-2.5 py-1.5"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
              <Button
                onClick={() => {
                  setEditingPet(undefined);
                  setDialogOpen(true);
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Pet
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        viewMode === 'list' ? (
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-6 w-32" />
                  <div className="pl-6 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {[1, 2].map((i) => (
              <Card key={i} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((j) => (
                      <Skeleton key={j} className="h-40 rounded-xl" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : displayedPets.length === 0 ? (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="py-12 text-center">
            {showArchived ? (
              <>
                <Archive className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  No archived pets.
                </p>
                <Button
                  onClick={() => setShowArchived(false)}
                  variant="outline"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Pets
                </Button>
              </>
            ) : (
              <>
                <PawPrint className="h-12 w-12 text-primary/30 mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  No pets added yet. Start tracking your furry friends!
                </p>
                <Button
                  onClick={() => {
                    setEditingPet(undefined);
                    setDialogOpen(true);
                  }}
                  variant="outline"
                  className="border-primary/30 hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Pet
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        /* List View */
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            {petsByType.sortedTypes.map((type) => {
              const TypeIcon = getPetIcon(type);
              return (
                <div
                  key={type}
                  ref={(el) => { typeRefs.current[type] = el; }}
                >
                <Collapsible
                  open={!collapsedTypes.has(type)}
                  onOpenChange={() => toggleType(type)}
                  className="mb-2 last:mb-0"
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-primary/10 transition-colors">
                    {collapsedTypes.has(type) ? (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                    <TypeIcon className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-foreground">
                      {type}
                    </span>
                    <Badge variant="secondary" className="ml-auto bg-primary/10 text-primary">
                      {petsByType.grouped[type].length}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pl-8 py-2 space-y-1">
                      {petsByType.grouped[type].map((pet) => (
                        <div
                          key={pet.id}
                          className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-primary/5 transition-colors group"
                        >
                          <button
                            onClick={() => handlePetClick(pet)}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                          >
                            {pet.photoUrl ? (
                              <BlossomImage 
                                src={pet.photoUrl} 
                                alt={pet.name}
                                className="h-8 w-8 rounded-full object-cover shrink-0"
                                showSkeleton={false}
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <PawPrint className="h-4 w-4 text-primary" />
                              </div>
                            )}
                            <span className="text-muted-foreground group-hover:text-primary truncate">
                              {pet.name}
                            </span>
                            {(pet.species || pet.breed) && (
                              <span className="text-sm text-slate-400 dark:text-slate-500 truncate hidden sm:inline">
                                - {[pet.species, pet.breed].filter(Boolean).join(' ')}
                              </span>
                            )}
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 opacity-70 hover:opacity-100"
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Pet actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => handlePetClick(pet)}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View full page
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditPet(pet)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleArchivePet(pet)}>
                                {pet.isArchived ? (
                                  <><ArchiveRestore className="h-4 w-4 mr-2" /> Restore</>
                                ) : (
                                  <><Archive className="h-4 w-4 mr-2" /> Archive</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setPetToDelete(pet)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        /* Card View */
        <div className="space-y-6">
          {petsByType.sortedTypes.map((type) => {
            const TypeIcon = getPetIcon(type);
            return (
              <Card 
                key={type} 
                ref={(el) => { typeRefs.current[type] = el; }}
                className="bg-card border-border overflow-hidden"
              >
                <CardHeader className="pb-3 bg-gradient-to-r from-primary/10 to-transparent">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <TypeIcon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-foreground">{type}</span>
                    <Badge variant="secondary" className="ml-auto bg-primary/10 text-primary">
                      {petsByType.grouped[type].length} {petsByType.grouped[type].length === 1 ? 'pet' : 'pets'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {petsByType.grouped[type].map((pet) => (
                      <PetCard
                        key={pet.id}
                        pet={pet}
                        onClick={() => handlePetClick(pet)}
                        onEdit={() => handleEditPet(pet)}
                        onArchive={() => handleArchivePet(pet)}
                        onDelete={() => setPetToDelete(pet)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <PetDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingPet(undefined);
        }}
        pet={editingPet}
      />

      {viewingPet && (
        <PetDetailDialog
          isOpen={!!viewingPet}
          onClose={() => setViewingPet(undefined)}
          pet={viewingPet}
          onEdit={() => handleEditPet(viewingPet)}
          onDelete={() => setViewingPet(undefined)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!petToDelete} onOpenChange={(open) => !open && setPetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {petToDelete?.name ?? 'this pet'} and all associated vet visits and records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePet}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

interface PetCardProps {
  pet: Pet;
  onClick: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function PetCard({ pet, onClick, onEdit, onArchive, onDelete }: PetCardProps) {
  const PetIcon = getPetIcon(pet.petType);

  return (
    <div className="group relative flex flex-col rounded-xl border-2 border-border bg-gradient-to-br from-card to-muted/30 hover:border-primary/50 hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Actions menu - top right */}
      <div className="absolute top-2 right-2 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow-md bg-background/90 hover:bg-background"
              onClick={(e) => e.stopPropagation()}
              aria-label="Pet actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
              <ExternalLink className="h-4 w-4 mr-2" />
              View full page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(); }}>
              {pet.isArchived ? (
                <><ArchiveRestore className="h-4 w-4 mr-2" /> Restore</>
              ) : (
                <><Archive className="h-4 w-4 mr-2" /> Archive</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Clickable area for quick view */}
      <button
        onClick={onClick}
        className="text-left flex-1 flex flex-col"
      >
        {/* Photo or placeholder */}
        {pet.photoUrl ? (
          <div className="aspect-square w-full overflow-hidden">
            <BlossomImage 
              src={pet.photoUrl} 
              alt={pet.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          </div>
        ) : (
          <div className="aspect-square w-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
            <PetIcon className="h-16 w-16 text-primary/30" />
          </div>
        )}

        <div className="p-4">
          {/* Name */}
          <h3 className="font-semibold text-foreground mb-1 line-clamp-1 group-hover:text-primary transition-colors">
            {pet.name}
          </h3>

          {/* Species/Breed */}
          {(pet.species || pet.breed) && (
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2 line-clamp-1">
              <PetIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{[pet.species, pet.breed].filter(Boolean).join(' - ')}</span>
            </p>
          )}

          {/* Birth/Adoption Date */}
          {(pet.birthDate || pet.adoptionDate) && (
            <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700">
              <Calendar className="h-3 w-3" />
              <span>{pet.birthDate ? `Born ${pet.birthDate}` : `Adopted ${pet.adoptionDate}`}</span>
            </p>
          )}
        </div>
      </button>

      {/* Hover indicator */}
      <div className="absolute inset-0 rounded-xl ring-2 ring-primary ring-opacity-0 group-hover:ring-opacity-20 transition-all pointer-events-none" />
    </div>
  );
}
