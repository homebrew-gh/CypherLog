import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Package, Calendar, Menu, Settings, Car, Shield, HelpCircle, Cloud, CreditCard, TreePine, Palette, RefreshCw, Coins, HardDrive, PawPrint, PlayCircle, KeyRound, Users, ChevronDown, Building2, Scale, Bot, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { LoginArea } from '@/components/auth/LoginArea';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { RoomManagementDialog } from '@/components/RoomManagementDialog';
import { RelayManagementDialog } from '@/components/RelayManagementDialog';
import { VehicleTypeManagementDialog } from '@/components/VehicleTypeManagementDialog';
import { SubscriptionTypeManagementDialog } from '@/components/SubscriptionTypeManagementDialog';
import { HomeFeatureManagementDialog } from '@/components/HomeFeatureManagementDialog';
import { WarrantyTypeManagementDialog } from '@/components/WarrantyTypeManagementDialog';
import { PetTypeManagementDialog } from '@/components/PetTypeManagementDialog';
import { CompanyTypeManagementDialog } from '@/components/CompanyTypeManagementDialog';
import { StorageSettingsDialog } from '@/components/StorageSettingsDialog';
import { DisplaySettingsDialog } from '@/components/DisplaySettingsDialog';
import { CurrencySettingsDialog } from '@/components/CurrencySettingsDialog';
import { WeightSettingsDialog } from '@/components/WeightSettingsDialog';
import { DonateSection } from '@/components/DonateSection';
import { TabNavigation } from '@/components/TabNavigation';
import { AddTabDialog } from '@/components/AddTabDialog';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { GlobalSearchDialog } from '@/components/GlobalSearchDialog';
import { SearchButton } from '@/components/SearchButton';
import { CompanyDetailDialog } from '@/components/CompanyDetailDialog';
import { SubscriptionDetailDialog } from '@/components/SubscriptionDetailDialog';
import { WarrantyDetailDialog } from '@/components/WarrantyDetailDialog';
import { MaintenanceDetailDialog } from '@/components/MaintenanceDetailDialog';
import { FeatureTourDialog } from '@/components/FeatureTourDialog';
import type { Company, Subscription, Warranty, MaintenanceSchedule } from '@/lib/types';
import {
  HomeTab,
  AppliancesTab,
  MaintenanceTab,
  VehiclesTab,
  SubscriptionsTab,
  WarrantiesTab,
  CompaniesTab,
  ProjectsTab,
  PetsTab,
} from '@/components/tabs';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTabPreferences, type TabId } from '@/hooks/useTabPreferences';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { useApplyColorTheme } from '@/hooks/useColorTheme';
import { useDataSyncStatus } from '@/hooks/useDataSyncStatus';
import { useAmberSignerProbe } from '@/hooks/useAmberSignerProbe';

// House Key Recommendation Component - Compact header version with popover
const HouseKeyRecommendation = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/30 transition-all duration-200"
        title="Learn about House Keys"
      >
        <KeyRound className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-primary hidden sm:inline">
          House Key
        </span>
        <ChevronDown className={`h-3 w-3 text-primary/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Popover */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 p-4 rounded-xl bg-card border border-border shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                House Key
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                  Recommended
                </span>
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Create a dedicated key for your household — separate from your social Nostr identity. 
                Share it with family members for joint access, with built-in security isolation if your social key is ever compromised.
              </p>
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute -top-2 right-6 w-4 h-4 bg-card border-l border-t border-border rotate-45" />
        </div>
      )}
    </div>
  );
};

const Index = () => {
  useSeoMeta({
    title: 'Cypher Log - Home Ownership Management',
    description: 'Manage your home appliances and maintenance schedules with Nostr.',
  });

  const { user } = useCurrentUser();
  const { isProfileLoading } = useLoggedInAccounts();
  const { preferences, setActiveTab, isLoading: _isPreferencesLoading } = useTabPreferences();
  const { isSynced: isDataSynced } = useDataSyncStatus();
  const { result: amberProbe, rerun: rerunAmberProbe } = useAmberSignerProbe();
  
  // Apply color theme to document root
  useApplyColorTheme();

  // Simple loading state - only wait for profile to load, data loads in background
  const isInitialLoading = user && isProfileLoading;
  
  // Determine loading message
  const loadingMessage = "Loading your data...";
  const loadingSubMessage = "Fetching from Nostr relays";
  
  // Data sync is happening in background - show indicator but don't block UI
  const isBackgroundSyncing = user && !isDataSynced;

  // Dialog states
  const [roomManagementOpen, setRoomManagementOpen] = useState(false);
  const [relayManagementOpen, setRelayManagementOpen] = useState(false);
  const [relayManagementDefaultTab, setRelayManagementDefaultTab] = useState<'relays' | 'media'>('relays');
  const [vehicleTypeManagementOpen, setVehicleTypeManagementOpen] = useState(false);
  const [subscriptionTypeManagementOpen, setSubscriptionTypeManagementOpen] = useState(false);
  const [homeFeatureManagementOpen, setHomeFeatureManagementOpen] = useState(false);
  const [warrantyTypeManagementOpen, setWarrantyTypeManagementOpen] = useState(false);
  const [petTypeManagementOpen, setPetTypeManagementOpen] = useState(false);
  const [companyTypeManagementOpen, setCompanyTypeManagementOpen] = useState(false);
  const [_encryptionSettingsOpen, _setEncryptionSettingsOpen] = useState(false);
  const [storageSettingsOpen, setStorageSettingsOpen] = useState(false);
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [currencySettingsOpen, setCurrencySettingsOpen] = useState(false);
  const [weightSettingsOpen, setWeightSettingsOpen] = useState(false);
  const [addTabDialogOpen, setAddTabDialogOpen] = useState(false);
  
  // Global search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewingCompany, setViewingCompany] = useState<Company | undefined>();
  const [viewingSubscription, setViewingSubscription] = useState<Subscription | undefined>();
  const [viewingWarranty, setViewingWarranty] = useState<Warranty | undefined>();
  const [viewingMaintenance, setViewingMaintenance] = useState<MaintenanceSchedule | undefined>();
  
  // Feature tour state
  const [featureTourOpen, setFeatureTourOpen] = useState(false);
  
  // Scroll target state for navigating to specific sections within tabs
  const [scrollTarget, setScrollTarget] = useState<string | undefined>(undefined);

  const openRelayManagement = (tab: 'relays' | 'media' = 'relays') => {
    setRelayManagementDefaultTab(tab);
    setRelayManagementOpen(true);
  };

  const handleNavigateToTab = (tabId: TabId, target?: string) => {
    setScrollTarget(target);
    setActiveTab(tabId);
    // Clear the scroll target after a short delay so it can be re-triggered
    if (target) {
      setTimeout(() => setScrollTarget(undefined), 500);
    }
  };

  const renderTabContent = () => {
    switch (preferences.activeTab) {
      case 'home':
        return (
          <HomeTab 
            onNavigateToTab={handleNavigateToTab} 
            onAddTab={() => setAddTabDialogOpen(true)} 
          />
        );
      case 'appliances':
        return <AppliancesTab scrollTarget={scrollTarget} />;
      case 'maintenance':
        return <MaintenanceTab scrollTarget={scrollTarget} />;
      case 'vehicles':
        return <VehiclesTab scrollTarget={scrollTarget} />;
      case 'subscriptions':
        return <SubscriptionsTab scrollTarget={scrollTarget} />;
      case 'warranties':
        return <WarrantiesTab />;
      case 'companies':
        return <CompaniesTab scrollTarget={scrollTarget} />;
      case 'projects':
        return <ProjectsTab />;
      case 'pets':
        return <PetsTab scrollTarget={scrollTarget} />;
      default:
        return (
          <HomeTab 
            onNavigateToTab={handleNavigateToTab} 
            onAddTab={() => setAddTabDialogOpen(true)} 
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-theme-gradient tool-pattern-bg">
      {/* Header + Tab Navigation - Combined sticky container */}
      <div className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <header>
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            {/* Left - Menu & Logo */}
            <div className="flex items-center gap-3">
              {user && !isInitialLoading && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Settings</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setRoomManagementOpen(true)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Rooms
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setVehicleTypeManagementOpen(true)}>
                      <Car className="h-4 w-4 mr-2" />
                      Vehicle Types
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSubscriptionTypeManagementOpen(true)}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Subscription Types
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHomeFeatureManagementOpen(true)}>
                      <TreePine className="h-4 w-4 mr-2" />
                      Home Features
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setWarrantyTypeManagementOpen(true)}>
                      <Shield className="h-4 w-4 mr-2" />
                      Warranty Types
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPetTypeManagementOpen(true)}>
                      <PawPrint className="h-4 w-4 mr-2" />
                      Pet Types
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCompanyTypeManagementOpen(true)}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Company Types
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Privacy & Security</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setStorageSettingsOpen(true)}>
                      <HardDrive className="h-4 w-4 mr-2" />
                      Browser Storage
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Display</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setDisplaySettingsOpen(true)}>
                      <Palette className="h-4 w-4 mr-2" />
                      Color Theme
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCurrencySettingsOpen(true)}>
                      <Coins className="h-4 w-4 mr-2" />
                      Currency
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setWeightSettingsOpen(true)}>
                      <Scale className="h-4 w-4 mr-2" />
                      Weight
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Nostr Relays</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => openRelayManagement('relays')}>
                      <Cloud className="h-4 w-4 mr-2" />
                      Configure
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Agent & Keys</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link to="/delegation">
                        <Bot className="h-4 w-4 mr-2" />
                        NIP-26 Delegation
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Help</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link to="/faq">
                        <HelpCircle className="h-4 w-4 mr-2" />
                        FAQ & Data Info
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button 
                onClick={() => setActiveTab('home')}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <Logo className="h-10 w-10" />
                <span className="font-bold text-xl text-theme-heading">Cypher Log</span>
              </button>
            </div>

            {/* Right - Search, Theme Toggle (logged-in only), House Key Tip & Login */}
            <div className="flex items-center gap-2">
              {user && !isInitialLoading && (
                <SearchButton onClick={() => setSearchOpen(true)} />
              )}
              {user && <ThemeToggle />}
              {!user && !isInitialLoading && (
                <HouseKeyRecommendation />
              )}
              <LoginArea className="max-w-48" />
            </div>
          </div>
        </header>

        {/* Tab Navigation - Only shown when logged in and initial auth is complete */}
        {user && !isInitialLoading && (
          <TabNavigation onAddTabClick={() => setAddTabDialogOpen(true)} />
        )}
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {isInitialLoading ? (
          // Initial loading - shows during profile fetch and initial data sync
          <LoadingAnimation 
            size="md"
            message={loadingMessage}
            subMessage={loadingSubMessage}
          />
        ) : !user ? (
          // Not logged in - Welcome screen
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-40 h-40 rounded-3xl mb-6 overflow-hidden shadow-xl bg-white/80 dark:bg-[#3a3a3a] backdrop-blur-sm">
                <Logo className="h-40 w-40 object-cover" />
              </div>
              <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-4">
                Welcome to Cypher Log
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-300 mb-8">
                Your private home management hub. Track appliances, vehicles, maintenance, subscriptions, warranties, projects, pets, and more — all encrypted and synced via Nostr.
              </p>
            </div>

            {/* Take a Tour Button */}
            <div className="mb-8">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setFeatureTourOpen(true)}
                className="gap-2 rounded-full px-6"
              >
                <PlayCircle className="h-5 w-5" />
                Take a Tour
              </Button>
            </div>

            <div className="grid sm:grid-cols-3 gap-6 mb-8">
              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <Package className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold mb-2">All-in-One Tracking</h3>
                  <p className="text-sm text-muted-foreground">
                    Appliances, vehicles, subscriptions, warranties, pets, and service providers.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <Shield className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold mb-2">Private & Portable</h3>
                  <p className="text-sm text-muted-foreground">
                    End-to-end encryption with Nostr. Your data, your control.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <Calendar className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold mb-2">Stay Organized</h3>
                  <p className="text-sm text-muted-foreground">
                    Schedule maintenance, plan projects, and never miss a renewal.
                  </p>
                </CardContent>
              </Card>
            </div>

            <LoginArea className="justify-center" />

            <div className="mt-8 text-sm text-muted-foreground space-y-2">
              <p className="flex items-center justify-center gap-3 flex-wrap">
                <Link to="/faq" className="hover:text-primary transition-colors">
                  FAQ
                </Link>
                <span className="text-border">•</span>
                <Link to="/privacy" className="hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
                <span className="text-border">•</span>
                <Link to="/terms" className="hover:text-primary transition-colors">
                  Terms of Use
                </Link>
                <span className="text-border">•</span>
                <Link to="/license" className="hover:text-primary transition-colors">
                  MIT License
                </Link>
              </p>
              <p>
                <a href="https://shakespeare.diy" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                  Vibed with Shakespeare
                </a>
              </p>
            </div>
          </div>
        ) : (
          // Logged in - Tab-based dashboard
          <div className="space-y-8">
            {/* Background sync indicator - subtle notification */}
            {isBackgroundSyncing && (
              <div className="flex items-center justify-center gap-2 py-2 px-4 bg-primary/10 rounded-lg text-sm text-primary animate-pulse">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing your data from Nostr relays...</span>
              </div>
            )}

            {amberProbe.status === 'running' && (
              <Alert>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <AlertTitle>Checking Amber signer</AlertTitle>
                <AlertDescription>
                  Cypher Log is verifying that Amber can decrypt your encrypted data and sign relay-auth events.
                </AlertDescription>
              </Alert>
            )}

            {amberProbe.status === 'failed' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Amber login succeeded, but Cypher Log still cannot load data</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{amberProbe.message}</p>
                  <p>
                    Raw `nsec` login works, so your data is present. This Amber session is missing a capability Cypher Log
                    needs after login.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={rerunAmberProbe}>
                      Retry Amber check
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setRelayManagementOpen(true)}>
                      Open relay settings
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            {/* Tab Content */}
            {renderTabContent()}

            {/* Donate Section */}
            <section>
              <DonateSection />
            </section>

            {/* Footer */}
            <footer className="text-center py-8 text-sm text-muted-foreground space-y-2">
              <p className="flex items-center justify-center gap-3 flex-wrap">
                <Link to="/faq" className="hover:text-primary transition-colors">
                  FAQ
                </Link>
                <span className="text-border">•</span>
                <Link to="/privacy" className="hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
                <span className="text-border">•</span>
                <Link to="/terms" className="hover:text-primary transition-colors">
                  Terms of Use
                </Link>
                <span className="text-border">•</span>
                <Link to="/license" className="hover:text-primary transition-colors">
                  MIT License
                </Link>
              </p>
              <p>
                <a href="https://shakespeare.diy" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                  Vibed with Shakespeare
                </a>
              </p>
            </footer>
          </div>
        )}
      </main>

      {/* Dialogs */}
      <RoomManagementDialog
        isOpen={roomManagementOpen}
        onClose={() => setRoomManagementOpen(false)}
      />

      <RelayManagementDialog
        isOpen={relayManagementOpen}
        onClose={() => setRelayManagementOpen(false)}
        defaultTab={relayManagementDefaultTab}
      />

      <AddTabDialog
        isOpen={addTabDialogOpen}
        onClose={() => setAddTabDialogOpen(false)}
      />

      <VehicleTypeManagementDialog
        isOpen={vehicleTypeManagementOpen}
        onClose={() => setVehicleTypeManagementOpen(false)}
      />

      <SubscriptionTypeManagementDialog
        isOpen={subscriptionTypeManagementOpen}
        onClose={() => setSubscriptionTypeManagementOpen(false)}
      />

      <StorageSettingsDialog
        isOpen={storageSettingsOpen}
        onClose={() => setStorageSettingsOpen(false)}
      />

      <HomeFeatureManagementDialog
        isOpen={homeFeatureManagementOpen}
        onClose={() => setHomeFeatureManagementOpen(false)}
      />

      <WarrantyTypeManagementDialog
        isOpen={warrantyTypeManagementOpen}
        onClose={() => setWarrantyTypeManagementOpen(false)}
      />

      <PetTypeManagementDialog
        isOpen={petTypeManagementOpen}
        onClose={() => setPetTypeManagementOpen(false)}
      />

      <CompanyTypeManagementDialog
        isOpen={companyTypeManagementOpen}
        onClose={() => setCompanyTypeManagementOpen(false)}
      />

      <DisplaySettingsDialog
        isOpen={displaySettingsOpen}
        onClose={() => setDisplaySettingsOpen(false)}
      />

      <CurrencySettingsDialog
        isOpen={currencySettingsOpen}
        onClose={() => setCurrencySettingsOpen(false)}
      />
      <WeightSettingsDialog
        isOpen={weightSettingsOpen}
        onClose={() => setWeightSettingsOpen(false)}
      />

      {/* Global Search */}
      <GlobalSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectCompany={setViewingCompany}
        onSelectSubscription={setViewingSubscription}
        onSelectWarranty={setViewingWarranty}
        onSelectMaintenance={setViewingMaintenance}
      />

      {/* Detail dialogs opened from search */}
      {viewingCompany && (
        <CompanyDetailDialog
          isOpen={!!viewingCompany}
          onClose={() => setViewingCompany(undefined)}
          company={viewingCompany}
          onEdit={() => {}} // View-only from search
          onDelete={() => setViewingCompany(undefined)}
        />
      )}

      {viewingSubscription && (
        <SubscriptionDetailDialog
          isOpen={!!viewingSubscription}
          onClose={() => setViewingSubscription(undefined)}
          subscription={viewingSubscription}
          onEdit={() => {}}
          onDelete={() => setViewingSubscription(undefined)}
        />
      )}

      {viewingWarranty && (
        <WarrantyDetailDialog
          isOpen={!!viewingWarranty}
          onClose={() => setViewingWarranty(undefined)}
          warranty={viewingWarranty}
          onEdit={() => {}} // View-only from search
          onDelete={() => setViewingWarranty(undefined)}
        />
      )}

      {viewingMaintenance && (
        <MaintenanceDetailDialog
          isOpen={!!viewingMaintenance}
          onClose={() => setViewingMaintenance(undefined)}
          maintenance={viewingMaintenance}
          onEdit={() => {}} // View-only from search
        />
      )}

      {/* Feature Tour */}
      <FeatureTourDialog
        isOpen={featureTourOpen}
        onClose={() => setFeatureTourOpen(false)}
      />
    </div>
  );
};

export default Index;
