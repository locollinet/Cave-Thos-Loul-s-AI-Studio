import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  Layers,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Store,
  UtensilsCrossed,
  Warehouse,
} from 'lucide-react';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, Modal, useToast, cx } from '@/ui';
import { MODULE_LIST, PROFILE_MODULES } from '@/registry';
import { DEMO_MODELS, buildFullDemoOps } from '@/data/demoSetup';
import type { ModuleId, OrgProfile } from '@/types';

export interface ModuleSwitcherModalProps {
  open: boolean;
  onClose: () => void;
}

interface ProfilePreset {
  id: OrgProfile | 'all';
  label: string;
  icon: typeof UtensilsCrossed;
  description: string;
  modules: ModuleId[];
  badge?: string;
}

const ALL_MODULES: ModuleId[] = ['stock', 'carte', 'achats', 'negoce', 'compta', 'pilotage'];

export const PRESET_PROFILES: ProfilePreset[] = [
  {
    id: 'all',
    label: 'Suite complète (Full Démo)',
    icon: Sparkles,
    description: 'Tous les modules activés simultanément pour explorer l’intégralité de la plateforme.',
    modules: ALL_MODULES,
    badge: 'Recommandé Démo',
  },
  {
    id: 'restaurant',
    label: 'Restaurant / Bar / Palace',
    icon: UtensilsCrossed,
    description: 'Carte des vins digitale QR, mode service en salle, bouteilles au verre, réceptions.',
    modules: ['stock', 'carte', 'achats', 'pilotage'],
  },
  {
    id: 'negoce',
    label: 'Maison de Négoce',
    icon: Warehouse,
    description: 'Facturation B2B, devis, relances d’impayés, douane DRM, TVA et marges.',
    modules: ['stock', 'achats', 'negoce', 'compta', 'pilotage'],
  },
  {
    id: 'independant',
    label: 'Caviste Indépendant',
    icon: Store,
    description: 'Vente, offres clients personnalisées, achats domaines, sélection dynamique.',
    modules: PROFILE_MODULES.independant,
  },
  {
    id: 'chaine',
    label: 'Groupe & Multi-sites',
    icon: Building2,
    description: 'Multi-établissements, transferts de bouteilles, achats centralisés et consolidation.',
    modules: ['stock', 'carte', 'achats', 'compta', 'pilotage'],
  },
];

export function ModuleSwitcherModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { toast, confirm } = useToast();
  const { org, updateOrg, store, sites } = useOrg();
  const { demo } = useAuth();
  const nav = useNavigate();
  const [reloadingDemo, setReloadingDemo] = useState(false);

  const activeCount = org.modules.length;
  const totalCount = MODULE_LIST.length;

  const toggleModule = async (id: ModuleId) => {
    if (id === 'stock') {
      toast('Le module Stock & Cave est le socle de l’application et reste actif.', 'info');
      return;
    }
    const isActif = org.modules.includes(id);
    const newModules: ModuleId[] = isActif ? org.modules.filter((m) => m !== id) : [...org.modules, id];
    await updateOrg({ modules: newModules });
    toast(isActif ? `Module désactivé` : `Module activé`, 'ok');
  };

  const applyPreset = async (preset: ProfilePreset) => {
    await updateOrg({
      modules: preset.modules,
      ...(preset.id !== 'all' ? { profile: preset.id as OrgProfile } : {}),
    });
    toast(`Configuration « ${preset.label} » appliquée (${preset.modules.length} modules activés)`, 'ok');
  };

  const reloadDemoProfile = async (targetProfile: OrgProfile) => {
    const model = DEMO_MODELS[targetProfile];
    const ok = await confirm({
      title: `Charger les données de « ${model.name} » ?`,
      message: `Cela va remplacer les données de démonstration actuelles par celles du profil ${model.headline}.`,
      confirmLabel: 'Charger ce profil',
      danger: false,
    });
    if (!ok) return;

    setReloadingDemo(true);
    try {
      const mainSiteId = sites[0]?.id || 'cave-principale';
      const presetModules = PROFILE_MODULES[targetProfile];
      const setupOps = buildFullDemoOps(org.id, mainSiteId, targetProfile, {
        orgName: model.name,
        modules: presetModules,
        locale: org.locale || 'fr',
        defaultVatRate: org.defaultVatRate || 20,
        legal: org.legal,
      });

      await store.commit(setupOps, { allowChunking: true });
      await updateOrg({
        name: model.name,
        profile: targetProfile,
        modules: presetModules,
      });
      toast(`Données démo de « ${model.name} » chargées avec succès !`, 'ok');
      onClose();
    } catch (e) {
      toast((e as Error).message || 'Erreur lors du chargement', 'bad');
    } finally {
      setReloadingDemo(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2.5">
          <SlidersHorizontal className="size-5 text-brand" />
          <span>Modules &amp; Profil Métier</span>
          <Badge className="ml-1 text-xs">
            {activeCount}/{totalCount} activés
          </Badge>
        </span>
      }
      footer={
        <div className="flex w-full items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClose();
              nav('/reglages?tab=modules');
            }}
            icon={<ExternalLink className="size-3.5" />}
          >
            Accéder à Réglages &gt; Modules
          </Button>
          <Button variant="primary" onClick={onClose}>
            Terminer
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Banner explicatif */}
        <div className="rounded-xl border border-brand/20 bg-brand-soft/40 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-brand/10 p-1.5 text-brand">
              <Sparkles className="size-4" />
            </div>
            <div className="text-sm">
              <p className="font-semibold text-ink">Navigation libre &amp; sans contrainte</p>
              <p className="mt-0.5 text-xs text-muted">
                Les modules ne sont jamais bloqués : vous pouvez activer ou masquer n’importe quelle fonctionnalité à tout moment pour adapter votre démo. Aucune donnée n’est perdue lorsque vous masquez un module.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1 : Presets 1-clic */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">1. Basculer vers un profil type (1 clic)</h3>
              <p className="text-xs text-muted">Configure automatiquement les modules recommandés pour chaque cas d’usage.</p>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {PRESET_PROFILES.map((p) => {
              const isMatch =
                p.id === 'all'
                  ? ALL_MODULES.every((m) => org.modules.includes(m))
                  : org.profile === p.id && p.modules.every((m) => org.modules.includes(m));
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cx(
                    'group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition',
                    isMatch
                      ? 'border-brand bg-brand-soft/60 ring-2 ring-brand/30 shadow-xs'
                      : 'border-border bg-surface hover:border-brand/40 hover:bg-surface-2',
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium text-sm text-ink">
                        <Icon className={cx('size-4', isMatch ? 'text-brand' : 'text-muted group-hover:text-brand')} />
                        {p.label}
                      </span>
                      {isMatch && <Check className="size-4 text-brand shrink-0" />}
                    </div>
                    {p.badge && (
                      <span className="mt-1 inline-block rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                        {p.badge}
                      </span>
                    )}
                    <p className="mt-1.5 text-xs text-muted leading-relaxed line-clamp-2">{p.description}</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted">
                    <span>{p.modules.length} modules</span>
                    <span className={cx('font-medium', isMatch ? 'text-brand' : 'group-hover:text-ink')}>
                      {isMatch ? 'Profil actif' : 'Appliquer →'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2 : Modules individuels */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">2. Modules à la carte</h3>
              <p className="text-xs text-muted">Activez ou désactivez les menus de navigation individuellement.</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateOrg({ modules: ALL_MODULES })}
              >
                Tout activer
              </Button>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {MODULE_LIST.map((m) => {
              const active = org.modules.includes(m.id);
              const isStock = m.id === 'stock';
              const Icon = m.icon;

              return (
                <div
                  key={m.id}
                  onClick={() => !isStock && toggleModule(m.id)}
                  className={cx(
                    'flex cursor-pointer select-none items-start gap-3 rounded-xl border p-3.5 transition',
                    active
                      ? 'border-brand/40 bg-surface shadow-xs hover:border-brand'
                      : 'border-border/80 bg-surface-2/40 opacity-70 hover:opacity-100',
                  )}
                >
                  <div
                    className={cx(
                      'mt-0.5 rounded-lg p-2 transition',
                      active ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted',
                    )}
                  >
                    <Icon className="size-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-ink">{t(m.labelKey)}</span>
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold transition',
                          active
                            ? 'bg-ok-soft text-ok'
                            : 'bg-surface-2 text-muted',
                        )}
                      >
                        {isStock ? 'Obligatoire' : active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted leading-relaxed">{t(m.descKey)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3 : Jeu de données démo (démo locale uniquement : sur Firebase, on crée une démo neuve depuis la console) */}
        {store.mode === 'local' && (demo || org.isDemo) && (
          <div className="rounded-xl border border-dashed border-border bg-surface-2/30 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="flex items-center gap-2 font-display text-base font-semibold">
                  <RotateCcw className="size-4 text-accent" />
                  <span>Charger les données réelles d’un profil démo</span>
                </h4>
                <p className="mt-1 text-xs text-muted">
                  Pour aller plus loin en présentation, vous pouvez charger l’ensemble de données métier préconfiguré (historique 12 mois, clients, cartes publiées, bouteilles au verre, etc.) correspondant à votre audience.
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(['restaurant', 'negoce', 'independant', 'chaine'] as OrgProfile[]).map((pf) => {
                const model = DEMO_MODELS[pf];
                return (
                  <button
                    key={pf}
                    type="button"
                    disabled={reloadingDemo}
                    onClick={() => reloadDemoProfile(pf)}
                    className="flex flex-col justify-between rounded-lg border border-border bg-surface p-2.5 text-left transition hover:border-accent hover:bg-accent/5 disabled:opacity-50"
                  >
                    <div>
                      <div className="font-medium text-xs text-ink truncate">{model.name}</div>
                      <div className="text-[10px] text-muted">{model.location}</div>
                      <p className="mt-1 text-[11px] text-muted line-clamp-2">{model.description}</p>
                    </div>
                    <span className="mt-2 text-[10px] font-semibold text-accent">
                      Charger ce jeu →
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
